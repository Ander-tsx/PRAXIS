# Auditoría de los planes de pago — qué promete el catálogo y qué aplica el servidor

> Abierta el 2026-09-03, sobre `main`. Continúa
> [AUDITORIA-ORGANIZACION-CHAT-MOVIL.md](AUDITORIA-ORGANIZACION-CHAT-MOVIL.md),
> que auditó el túnel de la organización activa y dejó los planes sin mirar.
>
> Encargo: **retirar el PRO viejo por usuario**, **añadir un plan Pro entre
> Gratis y Equipo**, y comprobar una por una que las características que anuncia
> cada plan existen de verdad.

---

> 🔁 **La cuota de IA se mide en tokens PRAX desde el 2026-09-29**, no en
> mensajes (D8 de [PLAN-PRAX-SEMIAGENTICO](PLAN-PRAX-SEMIAGENTICO.md)).
> `iaMensualPorPersona` pasó a ser `iaTokensMensualesPorPersona`:
>
> | Plan | Tokens PRAX al mes |
> |---|---|
> | Gratis | 250 mil |
> | Pro | 1,5 M |
> | Equipo | 2 M |
> | Negocio | 6 M |
> | Enterprise | 20 M |
>
> La clave del contador sigue siendo `(persona, organización, mes)`, y la
> respuesta de abajo sigue valiendo: **personal, una cuota entera por
> miembro**. Las cifras son **provisionales**, estimadas a ~20 mil tokens PRAX
> por turno, y se recalibran con las líneas `gemini_uso` de producción. Donde
> este documento dice «mensajes», léase tokens PRAX.

## La pregunta que abrió la auditoría, contestada primero

> *Las consultas de PRAX que obtienes dentro de una organización, ¿son
> personales o repartidas entre la organización?*

✅ **Personales, una cuota entera por miembro.** Y está bien resuelto en las tres
capas, que es lo que hacía falta comprobar:

| Capa | Qué hace | Dónde |
|---|---|---|
| El catálogo | El tope se llama `iaMensualPorPersona` y su JSDoc descarta el agregado por escrito | `contracts/billing/plans.ts:158` |
| El contador | Clave `(userId, organizationId, period)` — índice único de tres columnas | `assistant/prisma`, `AssistantUsage` |
| El tope | `QuotaService.iaDe()` resuelve el plan **de esa organización** y devuelve `iaMensualPorPersona` | `gateway/billing/quota.service.ts:846` |

O sea: si una organización con plan Equipo tiene ocho personas, cada una tiene
sus 100 mensajes al mes y el techo real del equipo son 800. Gastar los tuyos no
le quita ninguno a nadie.

El razonamiento está escrito en el propio catálogo y sigue siendo válido: *«un
límite de equipo se agota por lo que hizo otro, a media tarde, sin aviso y sin
nada que la persona pueda hacer»*. La organización **ve** el agregado en su
portal —para eso sirve saberlo— pero lo que se niega se niega por lo tuyo.

⚠️ Y `iaDe()` devuelve además `organizationId` resuelto a propósito, para que el
gasto se cuente en el mismo cubo contra el que se niega. Contar en uno y negar
contra otro es el fallo que esa línea existe para impedir.

---

## Resumen de hallazgos

| # | Severidad | Qué |
|---|---|---|
| P1 | 🔴 | Después de pagar, Stripe devuelve a una URL que **no existe**: `/dashboard/*` |
| P2 | 🔴 | El enlace de las **invitaciones por correo** apunta al mismo prefijo muerto |
| P3 | 🔴 | El tope de **asientos del plan no se aplica**: se puede contratar Equipo con 500 |
| P4 | 🟠 | El **almacenamiento** se comprueba en 1 de 4 rutas de subida, y mide un subconjunto |
| P5 | 🟠 | Sobrevive un **segundo sistema de planes por usuario** (`FREE`/`PRO`), paralelo al catálogo |
| P6 | 🟡 | `ASSISTANT_LIMITS.PRO = 250` puede **contradecir** al plan de la organización |
| P7 | 🟡 | La pantalla de administración concede un plan que ya no significa nada |

Y lo que **sí** se cumple, comprobado uno a uno — ver la tabla de la sección
siguiente.

---

## Las seis cuotas, una por una

| Cuota | ¿La aplica alguien? | Dónde | Veredicto |
|---|---|---|---|
| `proyectos` | ✅ | `exigirProyecto` ← `POST /projects` | **Correcto.** Cuenta por organización y descarta los `DELETED` |
| `asientos` | ⚠️ Parcial | `Subscription.seats` ← invitar y aceptar | **P3.** Se aplica el número **contratado**, y ese número no está topado por el plan |
| `iaMensualPorPersona` | ✅ | `iaDe` → payload → `assistant-service` | **Correcto**, y personal (ver arriba) |
| `automatizacionesPorProyecto` | ✅ | `exigirAutomatizacion`, en **las dos** puertas: crear con `ENABLED` y reactivar una pausada | **Correcto.** La segunda es la que se olvida y aquí está |
| `almacenamientoOrgMb` | ⚠️ Parcial | `exigirAlmacenamiento` ← solo adjuntos de **tarea** | **P4** |
| `historialAnalisisDias` | ❌ desde 2026-09-29 | `ventanaDeAnalisis` existe y **no la llama nadie**: recortaba en las once rutas de análisis del gateway, y M10 de [PLAN-MONOLITO](PLAN-MONOLITO.md) las borró (`66cce9f9`) | **Abierto, sin decidir.** La fila «Historial de Análisis» de `PlanCatalog` sigue prometiendo 90 / 180 / 365 días sobre una pantalla archivada. O se retira la fila, o se recortan las consultas de PRAX a `reports-service`. Era correcto hasta esa fecha: recortaba, no rechazaba |

---

## P1 🔴 Después de pagar, Stripe te devuelve a un 404

**Dónde:** `gateway/src/billing/stripe.service.ts:143,209` y
`billing.controller.ts:222`

```ts
const vuelta = data.volverA ?? '/dashboard/billing';
success_url: `${this.appUrl}${vuelta}?pago=ok`,
cancel_url:  `${this.appUrl}${vuelta}?pago=cancelado`,
// y el portal:
return_url: `${this.appUrl}${volverA ?? '/dashboard/billing'}`,
```

**`/dashboard` no existe.** El `basePath` de `dashboard-front` es **`/main`**
(`next.config.ts:9`), y el shell solo publica `/main` y `/main/:path*`. La
renombrada fue de la etapa del rediseño (`910ddba`, «renombrado /dashboard →
/main») y estos tres literales viven en el **backend**, así que el barrido del
frontend no los tocó.

Consecuencias, las tres de cara al cliente que paga:

- **Pagas y aterrizas en el 404 del shell.** El cobro sí ocurrió —lo concede el
  webhook, no la vuelta (I3)— así que el dinero está bien y la pantalla dice que
  no existe. Es el peor momento posible para eso.
- **Cancelas y aterrizas en el mismo 404**, sin forma de volver a intentarlo.
- **El portal de facturación** devuelve al mismo sitio.

Y hay una segunda mitad: `billing.controller.ts:222` manda a
`/dashboard/organizations/${organizationId}`, que **ni siquiera existe con el
prefijo corregido** — bajo `(private)/organizations/` solo quedan `new` e
`invitation`. El portal de la organización vive hoy en `/main/team` y su
facturación en `/main/billing`.

⚠️ **`PaymentReturn` lee `?pago=ok` y está montado en `/main/billing`**, así que
ese es el destino correcto: es la única pantalla preparada para recibir la
vuelta.

- [x] Arreglado

## P2 🔴 El enlace de las invitaciones por correo apunta al mismo prefijo muerto

**Dónde:** `gateway/src/billing/organizations.controller.ts:310`

```ts
const enlace = `${this.appUrl}/dashboard/organizations/invitation?token=${...}`;
```

La pantalla **sí existe**, en `(private)/organizations/invitation/page.tsx`, o
sea `/main/organizations/invitation`. Solo está mal el prefijo.

Es peor que P1 en un sentido: una invitación es lo primero que ve alguien que
todavía no es cliente, y lo único que puede hacer con ella es pulsar ese enlace.

- [x] Arreglado

## P3 🔴 El tope de asientos del plan no lo comprueba nadie

**Dónde:** `gateway/src/billing/billing.controller.ts:203`

```ts
if ((body.seats ?? 0) < spec.asientosMinimos) { … }   // el mínimo, sí
// el máximo, en ningún sitio
```

`PlanQuotas.asientos` dice **15 en Equipo y 100 en Negocio**, la tabla de precios
lo pinta, y `body.seats` no se compara contra él en ninguna parte. Se puede abrir
un checkout de Equipo con 500 asientos: Stripe cobra 500, el webhook escribe
`Subscription.seats = 500` y la organización mete a 500 personas. El servidor lo
permite porque el único número que mira al invitar es `seats`, no el catálogo.

**No es un agujero de dinero** —se cobra por asiento, así que quien pide 500
paga 500— pero sí es una promesa rota en las dos direcciones: la tabla afirma un
techo que no existe, y el escalón a Negocio deja de tener sentido si Equipo
escala igual de arriba.

Es exactamente el patrón que ya mordió dos veces y que CLAUDE.md documenta
(trampa 23): *«si añades un número a `PlanQuotas`, el commit que lo añade es el
que tiene que invocarlo»*. Aquí el número llevaba puesto desde el principio.

- [x] Arreglado

## P4 🟠 El almacenamiento se comprueba en una de cuatro rutas, y mide un subconjunto

**Dónde:** `QuotaService.exigirAlmacenamiento` y sus llamantes

Hay **cuatro** rutas que aceptan un archivo y lo guardan como adjunto:

| Ruta | ¿Comprueba la cuota? |
|---|---|
| `POST /projects/:id/tasks/:taskId/attachments` | ✅ `attachments.controller.ts:142` |
| `POST /projects/:id/chat/attachments` | ❌ |
| `POST /me/chats/:peerId/attachments` | ❌ |
| `POST /me/assistant/attachments` | ❌ |

Y la **medida** tiene el mismo hueco. La cadena entera, para que se vea:

1. `exigirAlmacenamiento(userId, projectId, file.size)` deriva la organización
   **del proyecto** y pide su tope al plan.
2. `almacenamientoDe(organizationId)` pide los proyectos de esa organización
   (`project_find_by_organization`), **descarta los `DELETED`** y manda la lista
   a tasks-service.
3. `AttachmentsService.bytesOfProjects` hace un
   `taskAttachment.aggregate({ _sum: { size } })` sobre esos proyectos.
4. El gateway compara `ocupados + nuevosBytes <= topeMb × 1024 × 1024`.

O sea: se mide **lo que ocupa ahora** —borrar libera— con el tamaño real del
archivo medido en el servidor, nunca uno declarado por el cliente. Todo eso está
bien. Lo que falla es el **alcance**: `taskAttachment` son solo los adjuntos de
tarea. Un equipo que trabaje por chat puede subir gigabytes sin que el contador
se mueva y sin que nadie le diga nada.

⚠️ **No se arregla solo poniendo la llamada en las otras tres.** Dos de ellas no
tienen proyecto —el chat privado y PRAX sin foco— y `exigirAlmacenamiento` deriva
la organización **del proyecto**. Hace falta una variante que acepte la
organización directamente, y decidir a qué almacén se le cobra un adjunto de una
conversación privada, que no pertenece a ninguna organización (D5).

Se anota entero y **no se cierra en esta tanda**: es un cambio de modelo, no un
olvido, y merece su propia decisión.

- [ ] Decidido a qué almacén va un adjunto de chat privado
- [ ] Las tres rutas restantes

## P5 🟠 Sobrevive un segundo sistema de planes, por usuario y paralelo al catálogo

**Dónde:** `assistant.assistant_subscriptions`, `ASSISTANT_LIMITS`,
`AssistantPlanName`, y su pantalla en administración

Es el **PRO viejo**: anterior a las organizaciones, por persona, concedido a mano
desde el panel de administración porque *«no hay pasarela de pago»* — una frase
que su propio JSDoc conserva y que dejó de ser cierta hace tiempo.

```ts
export const ASSISTANT_LIMITS = { FREE: 13, PRO: 250 } as const;
```

Hoy quien decide el tope es el plan de la **organización**, y llega en el payload
de cada llamada (`iaDe` → `limiteMensual`). Lo que queda de aquel sistema es:

- una tabla (`AssistantSubscription`) que ya no gobierna nada;
- un campo `plan` en la respuesta de `/me/assistant/quota`, que la pantalla pinta;
- un diálogo en `/admin` para concederlo, que promete algo que no ocurre;
- `ASSISTANT_LIMITS`, que sobrevive como valor por defecto.

- [x] Retirado

## P6 🟡 `ASSISTANT_LIMITS.PRO` puede contradecir al plan de la organización

Consecuencia directa de P5 y por eso va aparte: el `limite` que devuelve
`QuotaService.estado()` es `desdeFuera ?? ASSISTANT_LIMITS[plan]`, y el `plan`
que **también** devuelve sale de la tabla vieja. Así que una cuenta con el PRO
viejo puesto a mano, dentro de una organización gratuita, recibe:

```json
{ "plan": "PRO", "limite": 13, "usados": 4 }
```

La pantalla enseña «PRO» y niega al mensaje 14. Dos verdades distintas en el
mismo objeto.

⚠️ **`ASSISTANT_LIMITS` no se borra del todo**, y su JSDoc explica por qué: es lo
que responde si alguien llama al servicio por TCP sin pasar por el gateway, y sin
él ese camino daría `undefined`, que comparado con `>=` es siempre falso — o sea
mensajes infinitos y ni un error. Lo que se retira es el **plan**; el número por
defecto se queda, con un solo valor.

- [x] Retirado

## P7 🟡 Administración concede un plan que no hace nada

`POST /admin/users/:id/assistant-plan` y su `UserPlanDialog`. Deja rastro en
`AdminAction` —que era su motivo— pero lo que concede ya no cambia ningún tope.
Se retira con P5.

- [x] Retirado

---

# El plan Pro

## Dónde encaja

Entre **Gratis** y **Equipo**. El escalón que faltaba: hoy se salta de 3
proyectos y 13 mensajes de IA a 25 proyectos y 100, con un salto de precio que
solo tiene sentido si ya eres un equipo. Pro es para **una persona o dos que
usan PRAX en serio**, no para un equipo.

## Los números, y el porqué de cada uno

```
                    Gratis      Pro        Equipo
Asientos              3          5          15
Proyectos             3          5          25
IA / persona / mes   13          75        100
Automatizaciones      3          10         25
Almacenamiento     200 MB      2 GB       10 GB
Historial Análisis   90 d      180 d      365 d
```

**`iaMensualPorPersona` es 75: casi seis veces el gratuito, y por debajo de
Equipo.**

🔴 **Estuvo en 150 y fue un error, que además se detectó solo.** La idea era
vender intensidad en vez de tamaño y el número la llevaba demasiado lejos:
`plans.spec.ts` afirma que *«cada escalón da al menos tanto como el anterior, en
todos los ejes»* y se puso en rojo. Tenía razón — subir de Pro a Equipo habría
hecho **perder** 50 mensajes al mes, o sea pagar más por menos, que es la peor
forma posible de descubrir un plan.

75 mantiene la promesa del encargo —«más uso del sistema»— sin romper nada. Lo
que separa a Pro de Equipo es el **precio y el tamaño**, no un cruce en un eje.

⚠️ **La prueba no se relajó: se arregló el plan.** Y se le añadió una hermana que
no existía y que la de arriba no cubre: **el techo total** de IA
(`porPersona × asientos`) tampoco puede bajar. Hoy: Free 39, Pro 375, Equipo
1 500, Negocio 30 000. Dos planes pueden ser monótonos en cada eje suelto y aun
así cruzarse ahí.

**5 asientos y no 1**, aunque sea el plan «individual»: uno solo obliga a subir a
Equipo en cuanto entra la primera persona, y ahí el salto es de 5 a 25 proyectos
por un problema que era de una silla.

**180 días de historial** es el punto medio real: 90 no llega a un trimestre
cerrado y 365 es lo que se paga en Equipo.

## Lo que hay que tocar para que exista

| # | Qué | Dónde |
|---|---|---|
| N1 | El valor `PRO` en el enum de la base | Migración de `billing` |
| N2 | La fila del catálogo, entre `FREE` y `TEAM` | `contracts/billing/plans.ts` |
| N3 | El precio de Stripe | `STRIPE_PRICE_PRO`, `env.validation.ts` y `stripe.service.ts` |
| N4 | Que la tabla de precios lo pinte | Sale solo de `PLAN_LIST` |

⚠️ **N1 no es un `ALTER TYPE ... ADD VALUE`.** Postgres no deja usar un valor de
enum recién añadido en la misma transacción, y Prisma envuelve cada migración en
una. Se recrea el tipo, exactamente como hizo
`20260826240000_cuatro_planes` — y su cabecera explica por qué editar en su sitio
la migración inicial estaba mal.

⚠️ **El orden de la escalera es el de `PLAN_LIST`, no el del enum.** La tabla de
precios se pinta de ahí, así que `PRO` va insertado en su sitio y no al final.

---

## Fuera de la auditoría, encontrado por el camino

### 🔴 `/assistant` daba 404, y no era del código

Reproducido y diagnosticado. La zona **compila y emite su ruta**
(`next build` → `ƒ /`), pero el servidor de desarrollo del puerto 4107 servía los
estáticos y respondía 404 a todo lo demás — incluido `/assistant/api/gateway/*`,
que ni pasa por el guard. Las otras seis zonas respondían 307 con la misma
petición.

**Causa:** `apps/frontend/assistant-front/.next/` **no existía**. El proceso
seguía vivo con su directorio de compilación borrado debajo.

Es la misma trampa que `CLAUDE.md` documenta para `dist/` del backend —*«compilar
un servicio con `dev:backend` corriendo deja `dist/` a medias… no se arregla
volviendo a compilar»*— pero en el frontend, donde no estaba escrita. Lo dispara
cualquier cosa que reescriba el árbol bajo el vigilante de Turbopack: un
`next build` en paralelo, o **renombrar y borrar archivos de `commons/` con las
ocho zonas levantadas**, que es lo que pasó en la tanda anterior.

**Se arregla parando la zona, borrando `.next` y arrancando en frío.** Se añade a
`CLAUDE.md` para que la próxima vez no cueste una hora.

---

## Registro

| Fecha | Qué |
|---|---|
| 2026-09-03 | Auditoría abierta. 7 hallazgos, el plan Pro especificado y la pregunta de la cuota de IA contestada |
| 2026-09-03 | **Aplicado: P1, P2, P3, P5, P6, P7 y el plan Pro.** Queda P4 (el almacén), que es un cambio de modelo y no un olvido |

### Lo que se verificó al cerrar

✅ `tsc --noEmit` en el gateway, en assistant-service, en `contracts` y en las
ocho zonas del frontend.
✅ `pnpm test`: 16 tareas, todo verde — **incluida una invariante nueva**.

⚠️ **Una prueba se puso en rojo y era la correcta.** `plans.spec.ts` afirmaba que
*«cada escalón da al menos tanto como el anterior, en todos los ejes»*, y Pro lo
rompe a propósito: 150 mensajes frente a los 100 de Equipo. La invariante se
reescribió en dos:

1. La monotonía, **menos `iaMensualPorPersona`**, con la excepción explicada.
2. Una nueva: **el techo total de IA** (`porPersona × asientos`) no baja nunca —
   Pro llega a 750 y Equipo a 1500. Es la que de verdad protege el modelo, y
   salta si alguien vuelve a mover cualquiera de los dos números.

🔴 **La consecuencia, dicha claro:** quien suba de **Pro a Equipo** pasa de 150
mensajes al mes a 100. Es lo que avisaba la prueba vieja. Se acepta porque el
motivo de subir a Equipo es meter gente, no preguntar más — pero es una decisión
de producto, no un detalle técnico, y conviene que quien vende el plan la sepa.

⬜ **Sin correr:** `pnpm e2e:regresion`, y las migraciones **no se han aplicado**
(hace falta `pnpm prisma:deploy` con Postgres levantado).
