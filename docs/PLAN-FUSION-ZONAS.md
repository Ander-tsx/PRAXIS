# Fusionar las Multi-Zones en un solo frontend

> Abierto el 2026-09-03. **Documento de traspaso**: se escribió al final de una
> conversación larga para poder continuar en otra sin arrastrar el contexto de
> los cambios pequeños que se hicieron ese día (Stripe, colores, cabecera).
>
> Aquí está **solo** lo que hace falta para decidir y ejecutar la fusión.

---

## Qué se decidió, y qué queda por decidir

| | |
|---|---|
| ✅ **Fusionar las zonas** | Aceptado por el dueño del producto |
| ✅ **`reports-front` se archiva** | Ver «La decisión sobre Análisis» |
| ⬜ **Correr `pnpm e2e:regresion` ANTES de tocar nada** | Es el primer paso de la conversación nueva |
| ⬜ **El alcance exacto de la fusión** | Propuesta abajo; falta confirmarla |

---

## Por qué existe Multi-Zones, y por qué ya no

**No fue una decisión de arquitectura: fue un requisito de una materia
universitaria.** PRAXIS era el proyecto de esa asignatura —quedó segundo en la
competencia— y Multi-Zones estaba en el enunciado. La competencia terminó y el
dueño del producto quiere convertirlo en algo real.

### 🔴 El dato que zanja la discusión

Multi-Zones existe para **desplegar cada zona por separado**. El despliegue real
no hace eso:

```js
// infra/docker/images/frontend.pm2.config.cjs
const zonas = {
  AUTH_FRONT_URL:      'http://127.0.0.1:4101',
  DASHBOARD_FRONT_URL: 'http://127.0.0.1:4102',
  PROJECTS_FRONT_URL:  'http://127.0.0.1:4103',
  // …siete en total
};
```

```dockerfile
# infra/docker/images/frontend.Dockerfile
CMD ["pm2-runtime", "start", "/app/pm2.config.cjs"]
```

Las **ocho apps corren en el mismo contenedor**, en loopback, bajo un solo pm2, y
un push a `main` las redespliega todas a la vez.

**Se paga el 100% del coste de Multi-Zones y se recibe el 0% del beneficio.**

---

## Lo que cuesta hoy

| Coste | Detalle |
|---|---|
| **Navegación** | Cada salto entre secciones es una carga completa de página: se rehacen el armazón, la barra lateral, el proveedor del directorio de chats y **la conexión SSE**. Es la queja concreta que abrió esto |
| **Memoria** | 8 procesos Node en una máquina, facturados en Railway |
| **Fontanería duplicada** | ~1.340 líneas de `proxy.ts`, `api/gateway/[...path]/route.ts`, `next.config.ts` y `globals.css` repetidas siete veces |
| **Trampas propias** | Ver abajo |

### Las trampas que se pagan por tenerlo

⚠️ **Buena parte de los fallos encontrados esta semana fueron de Multi-Zones, no
del producto.** Merece la pena la lista, porque es el argumento menos evidente y
el más caro:

- El `matcher` con lookahead negativo **no casa la raíz**, así que cada zona
  necesita `'/'` como entrada aparte o su página principal se sirve sin guard.
- `<Link>` **prefija con el `basePath` de la zona actual**, así que todo enlace
  que cruce zonas tiene que ser un `<a>` duro — que es exactamente lo que
  provoca la recarga completa de la barra lateral.
- Cada `@font-face` lleva el `basePath` escrito a mano.
- El `.next/` de una zona puede desaparecer bajo su servidor de desarrollo y esa
  zona da 404 **mientras las otras siete funcionan** (pasó con `/assistant`).
- El renombrado `dashboard` → `main` dejó URLs muertas en el **backend**
  (`success_url` de Stripe, enlace de invitación) que nadie vio durante semanas.

---

## Lo que la fusión cuesta: menos de lo que parece

### El reparto real del código

```
commons          33.297   ← 43% del total. Ya es compartido, NO se toca
projects-front   18.791
reports-front     7.415   ← se archiva, ver abajo
dashboard-front   7.334
admin-front       3.384
chat-front        2.539
web-shell         2.109
auth-front        2.138
assistant-front     757
                 ─────
                 77.711
```

Las zonas son **carpetas de páginas**, no aplicaciones con lógica propia: casi
todo lo que piensa vive en `commons`. Fusionar es, en esencia:

1. Mover `<zona>/src/app/*` → `apps/frontend/web/src/app/<zona>/*`.
2. Borrar seis `proxy.ts` y dejar **uno**.
3. Borrar seis `api/gateway/[...path]/route.ts` y dejar **uno**.
4. Unificar los `globals.css` y quitar el `basePath` de los `@font-face`.
5. Retirar los `rewrites()` del shell.

**Estimación: 2–3 días.** No es refactorizar producto, es mover carpetas y
borrar fontanería.

### 🔴 La excepción: `auth-front` se queda fuera

**Es la única zona pública.** Hoy cada zona se protege sola con su propio guard,
y eso es una red real: un fallo en el guard de una no desprotege a las demás.
Fusionando las siete, un fallo en el guard único las desprotege **todas a la
vez**.

**Propuesta: fusionar las seis privadas y dejar `auth-front` como zona aparte.**
Se conserva casi toda la ganancia —la navegación que duele es la de dentro— y la
superficie de sesión sigue aislada.

Queda por confirmar si el `web-shell` se funde también o se queda como cáscara
pública (landing + la ruta del webhook de Stripe, que **no se puede mover sin
romper el cobro** — ver más abajo).

---

## La decisión sobre Análisis (`reports-front`)

✅ **Se archiva.** Decisión del dueño del producto, con su motivo:

> *«no se le vio utilidad de momento — de las 15+ gráficas solo 1 o 2 eran útiles
> de verdad, como ver cuándo acabaría un proyecto; cosas que no necesitan un
> front dedicado ni una página dedicada».*

Contexto que confirma la decisión: **ya no se puede llegar a esa zona.** El menú
lo dice por escrito desde antes:

> *«Análisis» (`/reports`) se retiró del sidebar: la pantalla no daba valor y está
> pendiente decidir qué hacer con esa zona.*
> — `commons/organisms/AppLayout/navigation.tsx`

O sea: 7.415 líneas, la segunda zona más grande, **inalcanzable**. Archivarla
hace la fusión un 20% más pequeña.

⚠️ **Archivar no es borrar a ciegas.** Antes de quitarla hay que comprobar qué
sobrevive:

- `reports-service` (puerto 3005) **lo consume el asistente**: PRAX pide informes
  para responder. Ese servicio **no se toca**.
- Las once rutas de análisis del gateway siguen sirviendo a PRAX y a
  `historialAnalisisDias`. **No se tocan.**
- Lo que se archiva es **la zona del frontend**, no la capacidad.
- ⚠️ Hay una idea que rescatar antes de archivar: *«cuándo acabaría un
  proyecto»* se consideró lo único realmente útil. Merece un sitio dentro de la
  pantalla del proyecto, no una sección propia.

---

## El orden acordado

### 1. `pnpm e2e:regresion` — **antes de tocar nada**

Es el primer paso de la conversación nueva, y es una decisión explícita del dueño
del producto:

> *«el e2e déjalo pendiente, en la nueva conversación lo inicias, vemos que
> funciona (todo debería funcionar) y luego vemos cómo proceder con la migración
> y realizamos otra e2e al acabar para ver qué tal fue».*

⚠️ **Lleva sin correrse desde la etapa de la organización activa** (C9 de
`PLAN-ORGANIZACION-ACTIVA.md`, todavía en ⬜), y desde entonces han entrado dos
tandas grandes de cambios. **Se espera rojo** en las pruebas que afirmaban la
regla vieja del chat privado —«compartís proyecto»— porque esa regla cambió a
«compartís organización» a propósito. Esas se reescriben; cualquier otro rojo es
un fallo de verdad.

**Sin esa línea base verde, la fusión no tiene red.** Es un cambio que toca
todo, y hay que poder decir «esto funcionaba antes» con pruebas, no con memoria.

### 2. El helper `<Link>` vs `<a>` — 2 horas, opcional

Arregla hoy la queja concreta sin comprometerse a la fusión:

```
zonePath="/chat", destino "/chat/<peer>"     → <Link href="/<peer>">   instantáneo
zonePath="/projects", destino "/chat/<peer>" → <a href="/chat/<peer>"> duro, obligatorio
```

Dentro de `/chat`, cambiar de conversación deja de recargar la barra, el
proveedor y el SSE. Igual dentro de `/projects` entre proyectos y espacios.

⚠️ **No arregla el salto entre zonas** —eso es Multi-Zones y solo lo cura la
fusión— y **si se fusiona, el helper se simplifica solo**: todo pasa a ser
interno. Hacerlo antes no es trabajo tirado, pero se puede saltar e ir directo a
la fusión.

### 3. Archivar `reports-front`

Más pequeño y aislado que la fusión. Hacerlo antes reduce lo que hay que mover.

### 4. La fusión

Con la regresión verde antes y después.

### 5. `pnpm e2e:regresion` otra vez

---

## Lo que no se puede romper al fusionar

Cinco cosas que están documentadas en otros sitios y que la fusión toca de lleno:

1. 🔴 **`/api/webhooks/stripe` vive en el `web-shell`**
   (`web-shell/src/app/api/webhooks/stripe/route.ts`) y **reenvía el cuerpo byte
   a byte** al gateway, porque la firma de Stripe se calcula sobre esos bytes
   exactos. No vale un `rewrite()` —Next los resuelve al construir— ni
   `createGatewayProxy()`, que borra `Authorization` para meter la cookie. Si esa
   ruta se mueve o se toca, **se cobra y no se concede ningún plan**.

2. **El guard de cada zona verifica la firma del JWT por su cuenta** y renueva la
   sesión. Al unificarlo, el `matcher` tiene que cubrir todo lo privado **y
   seguir excluyendo** `_next/static`, `fonts/` y `api/`.

3. **`admin-front` exige rol global además de sesión**, y `reports-front` exigía
   `canViewReports`. Al fusionar, esas comprobaciones no pueden diluirse en un
   guard genérico.

4. **Tailwind descarta en silencio lo que no encuentra al escanear.** Los
   `@source` de `commons/styles/theme.css` son relativos a ese archivo; al
   reorganizar carpetas hay que revisarlos o media aplicación sale sin estilos
   **sin un solo error** (ya pasó, `ba94057`).

5. **La cookie del tema, la del pliegue y la de la organización van con
   `path: '/'`** justamente porque las zonas comparten origen. Al fusionar dejan
   de necesitarlo, pero quitarlo no es urgente y romperlo sí es fácil.

---

## Lo que queda abierto de las auditorías anteriores

No bloquean la fusión, pero conviene no perderlos de vista. Detalle en
[AUDITORIA-ORGANIZACION-CHAT-MOVIL.md](AUDITORIA-ORGANIZACION-CHAT-MOVIL.md) y
[AUDITORIA-PLANES.md](AUDITORIA-PLANES.md).

| # | Qué | Estado |
|---|---|---|
| **B8** | La tarjeta emergente de un mensaje nuevo no siempre sale | El reparto se leyó entero y es correcto. Faltan dos sesiones y el stack en marcha para separar «no llega el evento» de «llega y no se pinta» |
| **P4** | El almacenamiento se comprueba en **1 de 4** rutas de subida y mide solo los adjuntos de tarea | Es un cambio de modelo, no un olvido: dos de esas rutas no tienen proyecto del que derivar la organización. **Hay que decidir** a qué almacén se le cobra un adjunto de chat privado |
| **C6** | Repaso visual a 375 px del tablero, el panel de tarea y el portal de organización | Necesita navegador |
| **E1** | 147 diagnósticos de Biome en `apps/frontend` | El formato está a cero; quedan a11y y `useExhaustiveDependencies`, de revisar uno a uno |

---

## Estado del stack al escribir esto

- **Todo commiteado y subido.** Último commit relevante: `3c611d8`.
- **Stripe en modo real**, con la cuenta activada, los tres precios de producción
  y el webhook creado. Ver [deploy/STRIPE-MODO-REAL.md](deploy/STRIPE-MODO-REAL.md).
- **Las migraciones están aplicadas** en local y Railway las aplica sola al
  arrancar (`start-backend.sh` → `migrar.sh`).
- **El stack local está parado.** Para levantarlo:

```bash
pnpm docker:up
pnpm dev:backend      # espera a que los 10 puertos respondan
pnpm dev:frontend
```

⚠️ Levantar los 9 servicios y las 8 zonas a la vez puede agotar los descriptores
de archivo y matar la última zona en arrancar. Y si una zona da 404 en todo menos
en sus estáticos, mira si existe su `.next/`: si no, párala, bórralo y arranca en
frío.
