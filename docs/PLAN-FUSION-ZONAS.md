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
| ✅ **Correr `pnpm e2e:regresion` ANTES de tocar nada** | Hecho el 2026-09-03: **243 de 243 en verde**. Ver «La línea base» |
| ✅ **El alcance exacto de la fusión** | Confirmado el 2026-09-03: **una sola app, auth y shell incluidos**. Ver «El alcance confirmado» |
| ✅ **Rama de trabajo** | `feature/fusion-zonas`. Todo lo de esta etapa se hace ahí |

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

#### La línea base — 2026-09-03

✅ **243 de 243 en verde**, 39 minutos, un solo worker.

Dos cosas que no salieron como se esperaba aquí arriba:

- **Los rojos previstos del chat privado no aparecieron.** Las pruebas que
  afirmaban la regla vieja —«compartís proyecto»— ya se habían reescrito a
  «compartís organización» dentro de la propia etapa. No hay nada que reescribir.
- **La suite tiene 243 pruebas, no 81.** Ese número venía del comentario de
  `playwright.config.ts`, que quedó viejo. El filtro `--grep-invert @security`
  sigue haciendo lo suyo; lo que creció es la suite.

Hubo **un rojo**, y era de la prueba, no del producto:

> `06-chat-zona.spec.ts:103` esperaba `getByRole('button', { name: 'Chat' })` y
> agotaba los 120 s enteros.

`2d4d1a5` convirtió las tres secciones de la barra lateral en un `tablist` de
verdad, así que esos controles son `role="tab"` y un `getByRole('button', …)` no
los casa. El localizador se corrigió a `getByRole('tab', …)` y el archivo entero
pasa (4/4). ⚠️ Es exactamente el tipo de rojo que hay que separar del otro: la
accesibilidad mejoró y la prueba se quedó atrás.

### 2. El helper `<Link>` vs `<a>` — 🚫 **se salta**

Decidido el 2026-09-03: se va directo a la fusión. El helper existía para
aliviar la queja sin comprometerse a fusionar; una vez fusionado, **todo enlace
pasa a ser interno y el helper se borra solo**. Hacerlo ahora es trabajo que
nace muerto.

Se conserva la descripción de abajo porque explica el mecanismo — y porque si la
fusión se parase a mitad, este es el parche que la sustituye.

<details>
<summary>El helper, tal como estaba propuesto</summary>


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

</details>

### 3. Archivar `reports-front`

Más pequeño y aislado que la fusión. Hacerlo antes reduce lo que hay que mover.

### 4. La fusión

Con la regresión verde antes y después.

### 5. `pnpm e2e:regresion` otra vez

---

## El alcance confirmado

**Una sola aplicación Next. Las ocho zonas dentro, `auth-front` y `web-shell`
incluidos.**

La propuesta anterior —fusionar las seis privadas y dejar fuera auth y el
shell— se descartó al leer los guards. El argumento que la sostenía era que
cada zona se protege sola y que un fallo en el guard único las desprotegería a
todas. No se sostiene, por cinco motivos, en orden de peso:

1. 🔴 **El guard no es la frontera de autorización. Lo es el gateway**, y lo
   dicen los propios guards. `admin-front/src/proxy.ts`: *«Esconder la pantalla
   es cortesía; lo que protege los datos está del otro lado»*. Igual en
   `dashboard-front/src/proxy.ts`: *«la autorización real la hace siempre el
   gateway»*. Saltarse el guard sirve una página que a continuación pide sin
   token y come un 401. Lo que se filtra son pantallas vacías, no datos.
2. **Menos `matcher`, menos fallos de `matcher`.** La lista de trampas de este
   documento son justo eso: el lookahead que no casa `'/'`, encontrado zona a
   zona, una por una, durante meses. Siete matchers se revisan siete veces; uno
   se revisa una. El radio de daño sube y la probabilidad baja — y la
   probabilidad es por donde este repositorio ha sangrado.
3. **Dejar una sola zona fuera mantiene vivas todas las trampas de
   Multi-Zones**: el prefijo de `basePath` en `<Link>`, el `basePath` de cada
   `@font-face`, el 404 del `.next/` desaparecido, los `rewrites()` del shell.
   Y el salto que quedaría fuera —login → aplicación— es el que da todo el
   mundo, una vez por sesión.
4. **El guard de `auth-front` son 52 líneas y es la regla inversa**: solo
   invitados, y solo en `/login` y `/signup`. En una sola app eso es una lista
   de rutas públicas de diez líneas. No es una frontera de seguridad, es una
   regla de experiencia de uso.
5. El ahorro pasa de **8 procesos → 1**, no de 8 → 3.

### 🔴 La decisión que desactiva los dos riesgos: la app fusionada **es** el shell

No se crea `apps/frontend/web` y se mueve todo dentro. **`web-shell` crece
hasta ser la aplicación entera**, y las zonas entran como segmentos de su
`app/`.

Es lo que convierte los dos riesgos serios de esta migración en no-eventos:

| Riesgo | Con app nueva | Con el shell creciendo |
|---|---|---|
| `/api/webhooks/stripe` | Hay que mover la ruta que cobra. Si se rompe, **se cobra y no se concede plan**, en silencio | **No se mueve.** Se queda donde está, byte a byte igual |
| `default_service` del balanceador (`infra/terraform/frontend.tf:309`) | Hay que repuntarlo a la app nueva | **No se toca.** Ya apunta al shell |

Y hay un tercer regalo: el shell **no tiene `basePath`**, así que sirve desde la
raíz. Una zona que entra como `src/app/main/*` conserva su URL `/main/...` sin
que nadie escriba un solo `basePath`. Las URLs no cambian **ninguna**, que es
justo lo que el renombrado `dashboard` → `main` enseñó por las malas.

⚠️ El directorio seguirá llamándose `web-shell` mientras dure la migración, y
el nombre pasará a mentir en cuanto entre la primera zona. Renombrarlo a `web`
es el **último** paso, cuando ya no quede ningún consumidor que lo nombre —
`pnpm-workspace.yaml`, `turbo.json`, el pm2, el Dockerfile, el `dev-cli` y
Terraform.

---

## Las ocho decisiones

| # | Decisión | Por qué |
|---|---|---|
| **D1** | **La app fusionada es `web-shell`**, que crece. No se crea una app nueva | Deja quieto el webhook de Stripe y el `default_service`. Ver arriba |
| **D2** | **Entran las ocho zonas**, `auth-front` incluido | El guard no es la autorización; dejar una fuera conserva todas las trampas |
| **D3** | **Una zona por commit**, con `pnpm e2e:regresion` verde antes de la siguiente | Un commit que mueve siete zonas no se puede revisar ni revertir a medias |
| **D4** | Las zonas privadas caen en **un solo grupo de rutas `(privado)`** con un único `layout.tsx` | Es el premio de verdad: `AppShell`, el proveedor del directorio y **el SSE** se montan una vez y sobreviven a la navegación entre secciones |
| **D5** | **`reports-front` se archiva primero**, antes de mover nada | Quita 7.415 líneas del trabajo. Y es reversible: se borra la zona, no la capacidad |
| **D6** | **Un solo proxy autenticado**, el que ya existe en `/api/gateway`. Los ~21 literales `'/<zona>/api/gateway'` se corrigen zona a zona, al moverla | Corregirlos todos de golpe rompe las zonas que aún no se han movido |
| **D7** | **Un solo `globals.css`**, con los `@font-face` sin `basePath` y una sola copia de las fuentes en `public/fonts/` | Hoy cada zona repite el bloque con su prefijo escrito a mano |
| **D8** | **Un solo `proxy.ts`**: renueva siempre, exige sesión en los prefijos privados, aplica la regla de solo-invitados en `/auth/login` y `/auth/signup`, y excluye `api/`, `_next/static`, `_next/image` y `fonts/` | Es la suma de los ocho guards actuales, que ya son casi el mismo archivo |

---

## Los seis invariantes

Lo que **no puede cambiar** durante toda la migración. Si algo de esto se mueve,
se ha salido del alcance.

1. 🔴 **Ninguna URL cambia.** Ni una. `/main`, `/projects/<slug>`, `/chat/<peerId>`,
   `/admin`, `/assistant`, `/auth/login`, `/reports` (que pasa a 404 a
   propósito). El backend tiene URLs escritas a mano —el `success_url` de
   Stripe, el enlace de invitación— y ya nos mordió una vez.
2. 🔴 **`/api/webhooks/stripe` no se toca.** Ni el archivo, ni su ruta, ni el
   `matcher` que lo excluye. Sigue siendo un route handler que reenvía el
   cuerpo crudo. Nada de `rewrite()`, nada de `createGatewayProxy()`.
3. **El rol global de `/admin` se comprueba en su `layout.tsx`, no en el
   guard**, y sigue igual después de fusionar. Un guard genérico que solo mira
   sesión no puede quedarse como única puerta de esa zona.
4. **Los `@source` de Tailwind tienen que cubrir el código movido.** Se
   descartan clases en silencio, sin un solo error. Comprobación por zona: abrir
   la pantalla movida y mirar si tiene estilos, no si compila.
5. **Las cookies siguen con `path: '/'`.** Fusionar hace que deje de ser
   necesario, pero quitarlo no es urgente y romperlo es fácil.
6. **`reports-service`, las once rutas de análisis del gateway y
   `historialAnalisisDias` no se tocan.** Lo que se archiva es la zona del
   frontend; PRAX sigue pidiendo informes.

---

## El orden de ejecución

Cada línea es un commit. La casilla se marca **al terminar**, con la regresión
verde. Las zonas van de menor a mayor, para que el mecanismo se depure en la
más barata.

| # | Paso | Líneas | Estado |
|---|---|---|---|
| **F0** | Línea base: `pnpm e2e:regresion` | — | ✅ 243/243 |
| **F1** | Archivar `reports-front` | 7.415 | ✅ código · ⚠️ regresión a medias, ver Registro |
| **F2** | Mover `assistant-front` → shell **(piloto del mecanismo)** | 757 | ✅ código · ⚠️ e2e pendiente |
| **F3** | Mover `chat-front` | 2.539 | ✅ código · ⚠️ e2e pendiente |
| **F4** | Mover `admin-front` | 3.384 | ✅ código · ⚠️ e2e pendiente |
| **F5** | Mover `dashboard-front` (`/main`) | 7.334 | ✅ código · ⚠️ e2e pendiente |
| **F6** | Mover `projects-front` | 18.791 | ✅ código · ⚠️ e2e pendiente |
| **F7** | Mover `auth-front` (la pública) | 2.138 | ✅ código · ⚠️ e2e pendiente |
| **F8** | Un solo `(privado)/layout.tsx`: el armazón deja de remontarse | — | ✅ código · ⚠️ e2e pendiente |
| **F9** | Limpieza: `rewrites()` fuera, pm2 a un proceso, Dockerfile, `dev-cli`, puertos, documentación | — | ✅ |
| **F10** | Renombrar `web-shell` → `web` | — | ✅ |
| **F11** | `pnpm e2e:regresion` de cierre | — | ⬜ |

### La receta de cada zona (F2–F7)

Se repite igual siete veces. El piloto F2 existe para descubrir qué le falta a
esta lista.

1. `src/app/**` de la zona → `web-shell/src/app/<zona>/**`, **quitando su
   `layout.tsx` raíz**: el `<html>`/`<body>` y las fuentes ya los pone el shell.
   Lo que sobreviva de ese layout (metadata) baja al segmento.
2. `src/components`, `src/lib`, `src/hooks` de la zona → bajo un directorio
   propio en el shell, para que dos zonas no choquen de nombre.
3. Borrar el `proxy.ts` de la zona; su regla se suma al del shell.
4. Borrar su `api/gateway/[...path]/route.ts`; se usa el del shell.
5. Cambiar sus literales `'/<zona>/api/gateway'` por `'/api/gateway'` y su
   `zonePath` — **solo los de esa zona**.
6. Quitar su entrada de `rewrites()` en `web-shell/next.config.ts`.
7. Borrar la app y su entrada del pm2, del `dev-cli` y de Terraform.
8. `pnpm e2e:regresion`. Verde antes de la siguiente.

#### Lo que enseñó el piloto (F2), y vale para las cinco que quedan

1. 🔴 **`zonePath` pasa a ser la cadena vacía, no el prefijo.** Hace dos
   trabajos en `AppShell` —prefijar el proxy (`${zonePath}/api/gateway`) y
   **reconstruir la ruta del navegador**, porque dentro de una zona
   `usePathname()` no incluye el `basePath`—. Fusionada no hay `basePath`: la
   ruta ya viene entera y el proxy vive en `/api/gateway`. `""` es exactamente
   lo que necesitan los dos cálculos, así que **`AppShell` no se toca** y las
   zonas movidas conviven con las que faltan.
2. 🔴 **Cuidado con quien compare `zonePath` con un literal.** `PraxLauncher`
   hacía `zonePath === '/assistant'` para esconderse dentro de la pantalla de
   PRAX; con `""` la comparación da `false` y **el lanzador aparecía encima de
   la propia pantalla del asistente**. Se arregló mirando la ruta. Antes de
   mover una zona: `grep -rn "zonePath ===" apps/frontend/commons`.
3. **El `layout.tsx` raíz de la zona no se mueve, se descarta**: `<html>`,
   `<body>` y las fuentes las pone el layout del shell. Lo único que sobrevive
   es su `metadata`, que baja al segmento.
4. **El `globals.css` de la zona tampoco se mueve.** Solo aportaba el `@source`
   —cubierto por el `../**/*.tsx` del shell, que ahora incluye el código
   movido— y los `@font-face` de Redaction con el `basePath` escrito a mano. El
   shell ya los declara sin prefijo, y ya tiene las fuentes en `public/fonts/`.
5. ⚠️ **El `<body>` del shell llevaba `flex flex-col`** de cuando solo servía la
   landing. Eso cambia cómo reparte el alto `AppShell`, así que se quitó; la
   landing no lo echa de menos porque `LandingTemplate` trae el suyo.
6. **El `not-found.tsx` de la zona sí se queda**, como `app/<zona>/not-found.tsx`:
   el más cercano en el árbol gana, y devuelve a esa sección en vez de a la
   landing.
7. **El `matcher` del shell excluye las zonas que aún no se han movido** y el
   prefijo de la que entra pasa a `PREFIJOS_PRIVADOS`. Olvidarlo no falla:
   la pantalla se sirve sin guard, el gateway responde 401 y se lee como avería.
   `02-guards` lo cubre para las cinco.
8. 🍎 El `matcher` del shell excluía `dashboard(?:/|$)`, y **esa zona se sirve en
   `/main` desde hace meses**: llevaba desde entonces renovando la sesión dos
   veces por navegación en el panel. Corregido de paso.

⚠️ **Y en cada zona, mirar la pantalla**, no solo el verde: el fallo de los
`@source` no da error y las pruebas no miran los estilos.

### 🔴 En una máquina de 8 GB, la suite se corre contra el stack **construido**

**El modo desarrollo no cabe.** Diez servicios con `nest start --watch` y siete
`next dev` mantienen en memoria un compilador y un vigilante cada uno; con
Chromium encima, el sistema mató los procesos **dos veces** en mitad de la
corrida de F1 —en la prueba 200 de 245 la primera, en la 31 de 66 la segunda—.
No deja error en la suite: los procesos desaparecen y ya.

La salida no es partir la suite, es no arrancar el compilador:

| Modo | Backend | Frontend |
|---|---|---|
| `dev` (vigilancia) | varios GB | varios GB |
| **construido** | **315 MB** | **579 MB** |

```bash
pnpm build:shared                 # contracts, observability, domain-events
pnpm --filter "@praxis/gateway" --filter "@praxis/*-service" run build
pnpm build:frontend               # las 7 zonas, --concurrency=1 (el pico importa)

pnpm start:backend                # los 10, desde dist/ (node dist/main)
pnpm start:frontend               # las 7, desde .next/ (next start)

pnpm e2e:regresion                # ya cabe entera, de una vez
```

Los tres scripts de arranque se añadieron en esta etapa (`build:frontend`,
`start:backend`, `start:frontend`) y las tareas `start` / `start:prod` a
`turbo.json`, persistentes y dependientes de `build`.

⚠️ **Lo que se pierde es la recarga en caliente**: tocar código no se ve hasta
reconstruir esa zona (`pnpm --filter @praxis/<zona> build` y reiniciar). Para
escribir código sigue valiendo `dev:cli` con lo mínimo levantado; el stack
construido es para **verificar**.

⚠️ **`next start` implica `NODE_ENV=production`.** No rompe la sesión —Chrome
trata `localhost` como origen seguro, así que la cookie `secure` se guarda igual—
pero conviene saberlo si alguna prueba dependiera de algo propio de desarrollo.

⚠️ Y esto es un argumento **a favor** de la fusión: al acabar queda **un**
proceso de frontend en vez de siete.

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

## Registro

Una línea por paso cerrado, con lo que se aprendió. Lo que no está aquí, no se
ha hecho.

| Fecha | Paso | Qué pasó |
|---|---|---|
| 2026-09-03 | **F0** | Línea base **243/243 en verde** (39,1 min). Un rojo, y era de la prueba: `06-chat-zona.spec.ts` buscaba `role="button"` donde `2d4d1a5` había puesto `role="tab"`. Corregido el localizador. Los rojos previstos del chat privado no aparecieron: ya estaban reescritos |
| 2026-09-04 | **F1** | Zona archivada. Fuera: la app entera, sus `rewrites()`, su entrada de pm2 y de `dev-cli`, los helpers `reportHref`/`reportPath` —que solo usaba ella—, la fila `/reports/` de `OrgSwitcher` y el enlace muerto a Análisis de la tarjeta de gráfico. La costura del lienzo (`AccionDelLienzo`, `alAceptarGrafico`) **se conserva sin implementador**, para cuando el informe vuelva a tener sitio. `/reports` responde 404, comprobado. Las cinco zonas privadas entraron en `02-guards`: faltaban `chat` y `assistant`, que son justo las que la fusión va a meter bajo un único `matcher` |
| 2026-09-04 | ⚠️ | **La regresión de F1 no se pudo cerrar: la máquina se queda sin memoria.** Cuatro intentos, muerto los cuatro por el sistema. Verde lo que llegó a correr: **las 195 de API enteras** y, de navegador, `01-publico`, `02-guards` —con las dos zonas nuevas— y `03-sesion` hasta la 31. Sin correr: `04-invitaciones`, `05-equipo`, `06-chat-zona`, `07-reglas`, `08-panel-de-tarea`. Ninguna toca Análisis, pero **el paso no está cerrado hasta que corran** |
| 2026-09-04 | **F2** | `assistant-front` fusionada: `src/app/assistant/` dentro del shell, un solo `proxy.ts` con `PREFIJOS_PRIVADOS`, y fuera su app, su `rewrites()`, su proxy de gateway, su pm2 y su `dev-cli`. El 4107 queda libre y **la URL no cambió**. Verificado sin navegador: compila las 6, `/assistant` y `/assistant/algo` dan 307 al login sin sesión, y con una cookie de sesión responde **200 con PRAX y la barra lateral dentro**, sin un solo `/assistant/api/gateway` en el HTML. Dos trampas encontradas, las dos anotadas en la receta: `zonePath=""` y `PraxLauncher` comparando `zonePath` con un literal |
| 2026-09-04 | **F3** | `chat-front` fusionada. Traía lo que ninguna otra: el recuerdo de la última conversación, que se anota **en el guard** porque por ahí pasa toda navegación. Esa lógica se mudó al `proxy.ts` del shell con su filtro de prefetch intacto, y `conversacionDeLaRuta` pasó a recibir la ruta **ya sin `/chat`** —la resta la hace ahora `recordarConversacion`—. Es la tercera vez que ese prefijo cambia y ninguna dio error: la expresión deja de casar, la cookie no se escribe y «vuelve a donde lo dejaste» muere en silencio. También se corrigieron los `revalidatePath` y los enlaces internos, que iban sin `/chat` porque el `basePath` lo ponía el router. Verificado: 307 al login sin sesión en `/chat` y en una conversación, 200 con sesión, y cero `/chat/api/gateway` en el HTML |
| 2026-09-04 | **F4** | `admin-front` fusionada. La comprobación de rol global se queda donde estaba —en su `layout.tsx`, no en el guard— y verificado que sigue discriminando: la cuenta de administración ve el panel, una corriente ve `AccessDenied`. 🔴 La trampa de este paso fueron los `revalidatePath`: dentro de la zona, `'/projects'` significaba `/admin/projects`, y fusionado habría revalidado **otra sección**. Igual con los `'/actividad'` y con el `revalidatePath('/', 'layout')` de presencia, que habría revalidado el layout raíz de toda la aplicación, landing incluida. Se revisaron también los de `/chat` y `/assistant`, que tenían el mismo patrón |
| 2026-09-04 | **F5** | `dashboard-front` fusionada — la cuenta entera bajo `/main`. Dos choques de nombre resueltos agrupando por sección: `lib/admin/` y `lib/main/`. 🔴 Y un hallazgo que cambia la receta: **una redirección sin pantalla va en el guard, no en un `page.tsx`**. Un `redirect()` de servidor bajo un layout privado se ejecuta después de que ese layout haya empezado a hacer streaming, así que la cabecera ya salió 200 y Next lo degrada a redirección de cliente: 44 KB y dos llamadas al gateway, medido. Desde `REDIRECCIONES_EXACTAS` del `proxy.ts`, 9 bytes y un 307 — y sin sesión siguen yendo al login, comprobado. También se arregló un `router.push('/')` de `PraxScreen` que quedó de F2 y sacaba a la landing en vez de reiniciar la conversación |
| 2026-09-04 | **F6** | `projects-front` fusionada — la más grande, 102 archivos. Con ella se van sus 62 pruebas de vitest, que pasan ya dentro del shell, y `lucide-react` pasa a ser dependencia directa de la app. 🔴 El cambio de fondo es que **`projectPath()` se retira**: devolvía la ruta sin `/projects` porque el `basePath` lo ponía Next, y fusionada llevaba a la landing sin dar ningún error. Queda `projectHref()`, que vale en los dos sitios, y sus ocho usos se repuntaron. Verificado contra un proyecto sembrado: listado 200, ficha 200 y las cuatro pestañas con `/projects/<slug>?tab=…` |
| 2026-09-04 | **F7** | `auth-front` fusionada, y con ella **desaparece Multi-Zones**: una sola aplicación, un `proxy.ts`, un `api/gateway` y un proceso de Node. El guard suma la regla inversa —`SOLO_INVITADOS`— con dos rutas exactas y no un prefijo: `/auth/verify-email` y `/auth/reset-password` llegan por correo y **tienen que abrirse con sesión puesta**. `jose` pasa a ser dependencia de la app. Verificado el flujo entero contra la aplicación construida: público 200, `/auth` → login, las redirecciones viejas `/login` y `/signup` en pie, login por el BFF poniendo la cookie, las cinco secciones privadas a 200 con ella, `/auth/login` rebotando a `/projects` con sesión y **sin rebotar** verify-email ni reset-password, y `session`/`logout` a 200 |
| 2026-09-04 | **F8** | **El premio.** Las cinco secciones cuelgan de un grupo `(privado)` con un único `layout.tsx`: había cinco copias idénticas del mismo armazón y cada salto entre secciones lo remontaba entero, rehaciendo la barra, el proveedor del directorio de chats y **la conexión SSE**. El rol de `/admin` baja a su propio layout, que ya solo comprueba eso. Y los enlaces del menú pasan de `<a>` a `next/link` — sin eso el layout compartido no sirve de nada, porque una navegación del navegador lo remonta igual. Verificado: las doce URLs siguen respondiendo 200 y ninguna cambió |
| 2026-09-04 | 🍎 | El paso de `<a>` a `<Link>` se hizo con una expresión regular y **se comió cinco comentarios** que contenían `` `<a>` `` como prosa. Compilaba igual. Es exactamente lo que avisa CLAUDE.md sobre los renombrados globales; se revisó el diff buscando prosa, no solo que compilara |
| 2026-09-04 | 🕳️ | Dos enlaces muertos encontrados y arreglados de paso: el botón «Ver planes y precios» del portal de organización apuntaba a `/billing`, que no existe desde que Suscripción salió de la barra lateral, y `destinoDeUnAviso` podía devolver `undefined` —válido en un `<a>`, no en un `Link`— |
| 2026-09-04 | **F9** | Limpieza. Fuera el `rewrites()` entero —catorce entradas—, el pm2 baja de ocho procesos a uno, el Dockerfile compila una sola app y el `dev-cli` lista una sola entrada de frontend. Los `globals.css` y los `@font-face` con `basePath` se fueron solos con cada zona; el de la aplicación ya los declaraba sin prefijo. Y la documentación: `CLAUDE.md`, `README`, `STRUCTURE`, los dos de despliegue y la skill de diseño, cuya §12 describía una restricción —«cruzar de zona obliga a navegación dura»— que ya no existe |
| 2026-09-04 | **F10** | `apps/frontend/web-shell` → `apps/frontend/web`, y el paquete a `@praxis/web`. El nombre pasó a mentir en cuanto entró la primera sección. ESTADO-ACTUAL **no se reescribe**: describe el multi-zone en media docena de sitios y ese es su valor. Lleva un aviso en la cabecera con la tabla de traducción |
| 2026-09-04 | 🕳️ | Encontrado de paso, **no arreglado**: `/main/roles` redirige a `/main/organizations/:id/roles`, que **no existe en ninguna app**. Es anterior a la fusión —la ruta no está en la barra lateral, solo se llega escribiéndola— y no es trabajo de esta etapa. Para la auditoría |
| 2026-09-04 | 🍎 | **Un `pkill -f "next start"` no mata el servidor**: `next start` deja un proceso `next-server`, así que el shell viejo seguía escuchando en el 4100 con las reescrituras de antes y el nuevo moría con `EADDRINUSE`. Se mata por `next-server` |
| 2026-09-04 | 🔧 | De ahí salió el stack construido (`build:frontend`, `start:backend`, `start:frontend`): **315 MB el backend y 579 MB el frontend**, contra varios GB en vigilancia. No bastó — con todo apagado la máquina ya tenía 677 MB libres y 6,65 de 8 GB de swap ocupados— pero es el modo correcto de verificar de aquí en adelante |

---

## Estado del stack al escribir esto

- **La rama de trabajo es `feature/fusion-zonas`.** Sale de `3c611d8`
  (`main`). Todo lo de esta etapa vive ahí; `main` no se toca hasta el PR.
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
