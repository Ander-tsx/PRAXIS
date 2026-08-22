# Plan Enterprise — planes, cuotas y la organización que paga

> Etapa abierta el 2026-08-21 sobre `feature/enterprise`, a partir de
> [ENCARGO-ENTERPRISE.md](ENCARGO-ENTERPRISE.md), que es lo que dictó el dueño
> del producto antes de irse a dormir y **lo único que él decidió**. Todo lo
> demás —arquitectura, nombres, límites, reparto entre servicios— lo decidió
> quien lo implementó, porque así lo delegó con estas palabras: *«que él trabaje
> con su propio criterio»*.
>
> ⚠️ **Este documento existe porque la primera vez no se escribió.** La etapa se
> construyó entera con el razonamiento en mensajes de chat, que es donde no se
> puede revisar nada: cuarenta ficheros en un solo bulto y diez decisiones de
> producto tomadas sin que constaran en ninguna parte. Se lee al retomar y se
> marca al terminar cada tarea, como los otros planes.

## Dónde estamos

| Stack | Qué es | Estado |
|---|---|---|
| E1 | Los contratos: el catálogo de planes | ✅ **hecho** (2026-08-21) |
| E2 | `billing-service` en el 3009 | ✅ **hecho** (2026-08-21) |
| E3 | El gateway: plan, checkout y portal de organización | ✅ **hecho** (2026-08-21) |
| E4 | Las cuotas, comprobadas donde se escribe | ✅ **hecho** (2026-08-21) |
| E5 | El frontend: precios, portal e invitaciones | ✅ **hecho** (2026-08-21) |
| E6 | Cierre: correo, recuperación del 402, e2e, ESTADO-ACTUAL | ⬜ **pendiente** |

### Registro

| Fecha | Stack | Commit | Qué entró |
|---|---|---|---|
| 2026-08-21 | E1 | `44aab3d` | El catálogo de planes y la organización que también tiene quien está solo |
| 2026-08-21 | E2 | `7e8af94` | `billing-service`: cuatro tablas, once comandos y ni un cliente hacia otro servicio |
| 2026-08-21 | E3 | (pendiente) | `QuotaService`, la traducción de fallos, `me/billing` y `organizations/:id` |
| 2026-08-21 | E4 | (pendiente) | 402 al crear proyecto, al meter miembro y al invitar; el tope de IA viajando en cada turno |
| 2026-08-21 | E5 | (pendiente) | Los cinco planes, el portal de la organización, las invitaciones y la tarjeta de Configuración |

---

## El encargo, en una línea

Que una **empresa** pueda contratar PRAXIS: planes con capacidades y miembros
distintos, quien lo contrata puede gestionarlo, y los planes acotan **proyectos**,
**uso de IA** y **miembros por proyecto** — *«cantidades bastante indulgentes
pero que a final de cuentas están en las letras pequeñas»*. Con Stripe, y con un
mes gratis en el plan individual intermedio.

---

## Decisiones cerradas

Las diez que no estaban en el encargo. Cada una se puede cambiar; ninguna está
enterrada en el código sin decir por qué.

### D1 — La unidad que paga es la organización, y la tiene todo el mundo

Hoy la única unidad de pertenencia es el **proyecto**. Colgar la suscripción de
ahí haría que una empresa con doce tableros pagara doce veces y que no hubiera
dónde enseñar «tu plan». Es la trampa 1 del encargo, dicha allí con estas
palabras: *una organización no es un proyecto*.

Lo que no era evidente es la otra mitad: **quien está solo también tiene
organización**, una personal, invisible, de un miembro y que no admite más. La
alternativa —«o tienes plan individual o perteneces a una organización»— obliga a
que cada sitio que resuelve una cuota tenga dos caminos, y a que la mitad se
olvide de uno.

⚠️ **Se crea la primera vez que hace falta, no al registrarse.** Sin fila el plan
ya es el correcto (FREE), y rellenar una tabla para todo el mundo antes de que
sirva de algo es una migración pendiente disfrazada. La crea el checkout, que es
donde hay intención de pagar; **las lecturas no la crean**, o cada carga de
Configuración sería una escritura para todas las cuentas del sistema.

### D2 — Cinco planes, y los números salen de un solo archivo

`FREE` · `PLUS` · `PRO` · `TEAM` · `BUSINESS`, en `contracts/src/billing/plans.ts`.

| Plan | Proyectos | IA/mes/persona | Miembros por proyecto | Notas |
|---|---|---|---|---|
| Gratis | 2 | 13 | 5 | No se contrata: se es |
| Plus | 10 | 100 | 15 | **Primer mes gratis** |
| Pro | 40 | 250 | 50 | Ya existía en producción |
| Equipo | 100 | 250 | 100 | Por asiento, desde 3 |
| Empresa | sin tope | 750 | sin tope | Por asiento, desde 10 |

⚠️ **`FREE` = 13 y `PRO` = 250 porque ya lo eran.** Salen de `ASSISTANT_LIMITS`,
que lleva meses en producción; cambiarlos habría recortado la cuota a gente que
ya la tiene, en un commit que habla de otra cosa. Los planes nuevos se colocaron
alrededor.

⚠️ **Ese archivo es la única fuente.** El gateway lo lee para negar, la pantalla
de precios para pintar la tabla, y el aviso de «te quedan tres» para saber sobre
cuántos. Escribir el mismo número dos veces es garantizar que un día la tabla
prometa lo que el guard niega, **sin un solo error de compilación**.

### D3 — El tope de IA es por persona, no por organización

Se consideró el agregado y se descartó por la trampa 2 del encargo: un límite de
equipo **se agota por lo que hizo otro**, a media tarde, sin aviso y sin nada que
la persona pueda hacer. La organización *ve* el total en su portal, que es para
lo que sirve saberlo; lo que se niega se niega por lo que gastaste tú. El techo
global sigue acotado — es ese número por los asientos.

### D4 — Una cuota agotada es 402, no 403

Un permiso denegado se arregla pidiéndoselo a quien administra el proyecto. Una
cuota agotada **no se arregla con permisos**: o se paga, o se borra algo.
Meterlos en el mismo saco hace que la interfaz ofrezca «pídeselo a quien
administra» a alguien que administra él, que es la peor ayuda posible.

El código va en `error.code` (`QUOTA_EXCEEDED`) y el `details` lleva **qué** tope,
cuánto es y cuánto llevas. Sin eso, la pantalla no puede ofrecer la salida
correcta — y cada cuota tiene la suya: quien se queda sin proyectos borra uno,
quien se queda sin asientos en un tablero no puede hacer nada salvo sacar a
alguien o ampliar.

### D5 — Un cobro fallido no corta el acceso

`PAST_DUE` avisa y deja trabajar mientras Stripe reintenta. Una tarjeta caducada
es lo más común del mundo y quitarle los proyectos a alguien por eso es la peor
forma de enterarse — y la que provoca la baja de verdad. Cuando Stripe se rinde
manda `deleted`, y ahí sí se cae a FREE.

De ahí sale también que solo guardemos **cuatro** estados y no los ocho de
Stripe: aquí hay que decidir una cosa, si el plan vale hoy. Guardar
`incomplete_expired` habría metido su vocabulario en nuestras consultas y en
nuestras pantallas.

### D6 — Los planes de empresa se cobran por asiento, y una invitación ocupa uno

Es lo que hace que ampliar el equipo cueste algo y que el techo total de IA esté
acotado.

⚠️ **La invitación ocupa asiento desde que se manda**, no desde que la aceptan.
Si no lo ocupara se podrían mandar mil sobre tres y el tope se rompería en el
momento de aceptarlas, con la organización ya por encima de lo que paga y sin
más salida que echar a alguien.

### D7 — Bajar por debajo de lo ocupado se rechaza, con el número dentro

Es la trampa 4 del encargo. Lo que no vale es que el sistema decida a quién echa,
así que se dice cuántos hay y se deja que lo arregle quien administra. Vale igual
para los asientos de una organización y para el tope de proyectos: **nada se
borra ni se archiva solo**.

### D8 — Un plan no abre ninguna puerta dentro

Ser `OWNER` de la organización no da ni un permiso en un tablero. Son tres capas
y esta es la tercera: rol global (quién administra la plataforma), rol de
proyecto (qué puedes hacer dentro), y plan (qué te queda). Un dueño que no sea
miembro de un proyecto de su propia organización **no lo ve**, y es a propósito
— el plan paga la plataforma, no es una llave maestra.

### D9 — La invitación devuelve un enlace; no se manda por correo

Mandarlo exigiría abrirle al gateway una ruta de envío de correo arbitrario en
`credentials-service`, que es el único que tiene `MailService`. Mientras eso no
se decida, quien invita copia el enlace y lo pasa.

⚠️ El token en claro **solo existe en esa respuesta**: en la base queda su hash,
igual que en la verificación de correo. Perderlo significa cancelar la invitación
y volver a invitar.

**Esto es deuda consciente, no la forma final.** Ver E6.

### D10 — Los cinco planes no se pueden contratar todos en todos los despliegues

Cada precio que falte en el entorno **apaga solo su plan**, no el cobro entero.
La pantalla pregunta cuáles se pueden contratar (`planesDisponibles`) y no ofrece
los demás, en vez de enseñar un botón que responde 503 al pulsarlo. Así se pudo
desplegar PRO —que ya estaba en producción— antes que los de empresa.

---

## Invariantes — lo que este trabajo NO puede romper

1. 🔴 **El plan lo concede el webhook de Stripe, y solo el webhook.** La
   `success_url` la puede escribir cualquiera en la barra de direcciones: si dar
   de alta el plan dependiera de visitarla, el plan sería gratis. `?pago=ok` no
   toca nada — solo enciende una pantalla que pregunta hasta que el servidor
   confirme.
2. 🔴 **El sobre `{success, data, meta}` no puede envolver un flujo SSE**, y el
   `rawBody: true` de `main.ts` está por la firma del webhook: la firma se
   calcula sobre los bytes exactos y cualquier cosa que reparsee el cuerpo la
   rompe.
3. ⚠️ **Los números viven en `PLANS` y en ningún otro sitio.** Ni en la base, ni
   en el frontend, ni en un guard.
4. ⚠️ **La pantalla apaga botones; el servidor decide.** Misma regla que los
   permisos, y por lo mismo: la pantalla es del cliente.
5. ⚠️ **`billing-service` no habla con nadie.** Contesta *qué plan tienes y qué
   da ese plan*; quien cuenta proyectos y mensajes es el gateway, que ya tiene
   delante los clientes de `projects`, `tasks` y `assistant`. Si algún día
   aparece un `*_SERVICE_HOST` en su `.env`, es que se ha invertido el reparto.
6. ⚠️ **Fallo de billing = FREE, no «pasa».** Si `billing-service` no contesta,
   `planDe` devuelve el plan más restrictivo y se registra con nivel de error.
   Un fallo no puede regalar el plan más caro. **La excepción está escrita**: si
   no se puede *contar* (projects caído), sí se deja pasar — negar por no haber
   podido contar es un falso positivo que quien lo sufre no puede resolver, y un
   proyecto de más se borra.
7. 🔴 **`billing_events` no es un log, es la prueba.** Todo lo que dependa de
   fechas de facturación queda con su instante y con el evento de Stripe que lo
   causó. Su `stripeEventId` único **es** la idempotencia: dejar que el índice
   rechace el duplicado no tiene la carrera que sí tiene comprobarlo antes con un
   `SELECT`.
8. ⚠️ **Sin fila = FREE, y leer no crea filas.** Ver D1.

---

## E1 — Los contratos *(hecho, `44aab3d`)*

`contracts/src/billing/`: `plans.ts` (catálogo, `cabe()`, `quedan()`,
`mejorPlan()`, `QUOTA_EXCEEDED_CODE`), `organization.dto.ts` y `billing.dto.ts`.

### Apuntes

- **`SIN_TOPE` es `null`** y choca a propósito con la invariante de que `null`
  significa «no se pudo leer»: aquella habla de lo que devuelve un `fetch`, y
  esto es una constante del catálogo que no viaja por la red. `Infinity` no
  sobrevive a `JSON` y `-1` es un número mágico que alguien acaba sumando.
- **Nunca un `<` a mano contra un tope.** `actual < null` compara contra cero, o
  sea que el plan sin límite se comporta como el más restrictivo y no da ningún
  error. Para eso está `cabe()`.
- **`PLAN_RANK` es un orden declarado, no deducido.** Se intentó «mejor es el que
  da más» y no sale: `TEAM` da los mismos 250 mensajes que `PRO` y más proyectos,
  así que no hay orden total, y elegir el máximo por cada eje construye un plan
  que no se vende.

## E2 — `billing-service` *(hecho, `7e8af94`)*

Noveno servicio, TCP 3009, esquema `billing`. Cuatro tablas y dieciocho comandos.

### Apuntes

- **El índice único parcial que Prisma no sabe expresar.** Solo puede haber una
  organización `PERSONAL` por cuenta, pero varias de empresa del mismo dueño son
  legítimas. El `WHERE kind = 'PERSONAL'` va a mano en la migración: sin él, dos
  peticiones simultáneas de alguien sin organización crean dos, y la segunda se
  queda con las cuotas mientras la primera guarda la suscripción. `personalDe`
  recoge el P2002 y vuelve a leer.
- **Los fallos se devuelven, no se lanzan.** Un `RpcException` por TCP llega al
  otro lado como error de transporte y pierde el motivo: el gateway acabaría
  respondiendo 500 a «no quedan asientos».
- **`planEfectivoDe` devuelve el mejor de tus planes**, no el de la organización
  que estés mirando. Si dependiera de la pantalla, la misma acción se permitiría
  o se negaría según dónde estés.

## E3 — El gateway *(hecho)*

`gateway/src/billing/`: `quota.service.ts`, `fallos.ts`, `billing.controller.ts`,
`organizations.controller.ts`, `billing.module.ts`, y el webhook y `StripeService`
ya migrados a organizaciones y a cinco planes.

| Ruta | Qué hace |
|---|---|
| `GET /me/billing/planes` | El catálogo y cuáles se pueden contratar aquí |
| `GET /me/billing/resumen` | Plan, topes, consumo, organizaciones — en una llamada |
| `GET /me/billing/estado` | Los dos booleanos que necesita una tarjeta |
| `POST /me/billing/checkout` | Abre el pago de un plan. **No concede nada** |
| `POST /me/billing/portal` | El portal de Stripe |
| `GET/POST /me/organizations` | Las tuyas, y crear una |
| `POST /me/organizations/invitations/accept` | Entrar con el token del enlace |
| `GET/PATCH /organizations/:id` | Verla, renombrarla |
| `GET/POST /organizations/:id/members` | Lista e invitación |
| `PATCH/DELETE /organizations/:id/members/:idOrEmail` | Papel, y sacar o cancelar |
| `PATCH /organizations/:id/seats` | Asientos contratados |
| `GET /organizations/:id/history` | El registro de facturación |

### Apuntes

- **No hay `OrganizationRoleGuard`, y es a propósito.** El papel dentro de una
  organización solo lo sabe `billing-service`; un guard aquí sería una llamada
  TCP más por petición para repetir lo que el comando ya hace. Es distinto de
  `ProjectPermissionGuard`, que existe porque allí hay **una** pregunta
  compartida por cuarenta rutas.
- **`oFalla()` es obligatorio.** Un comando devuelto tal cual respondería **200
  con `{error, codigo}` dentro**, que para el navegador es un éxito: la pantalla
  pintaría la lista vacía de una organización ajena sin decir por qué.
- **Cambiar asientos son dos escrituras sin transacción que las abarque.** El
  orden elegido: se comprueba el dueño → se comprueba que quepa la gente que ya
  está → **Stripe primero, nuestra base después**. Si falla lo segundo, el
  webhook llega detrás y escribe el número bueno; al revés, un fallo de Stripe
  dejaría a la organización con diez asientos pagando tres — la única de las dos
  incoherencias que regala algo.
- **El plan viaja en los metadatos de la suscripción, además del precio.**
  Deducirlo del `price_…` obliga a que el gateway que atiende el webhook tenga
  exactamente las mismas variables que el que abrió el checkout.

## E4 — Las cuotas *(hecho)*

Se comprueban **donde ocurre la escritura**, no en el módulo de facturación:
`POST /projects`, `POST /projects/:id/members`, `POST /projects/:id/invitations`,
y el tope de IA viajando en el payload de cada turno del asistente.

### Apuntes

- **El tope de miembros lo pone el plan del DUEÑO del proyecto**, no el de quien
  invita: es su tablero el que crece, y al revés alguien con plan grande metería
  gente en el proyecto de quien paga el pequeño.
- **Los proyectos se cuentan por dueño, no por pertenencia.** Si contara la
  pertenencia, cualquiera podría dejarte sin poder crear proyectos invitándote a
  los suyos. Y los `DELETED` no cuentan: cobrar por algo que ya no se ve es
  exactamente la clase de cuota que parece una avería.
- **`assistant-service` sigue teniendo su tabla por defecto**, y no es
  decorativa: es lo que responde si alguien le habla por TCP sin pasar por el
  gateway. Sin ella ese camino daría `undefined`, que comparado con `>=` es
  siempre falso — o sea, mensajes infinitos y ni un error.

## E5 — El frontend *(hecho)*

| Pantalla | Ruta |
|---|---|
| Los cinco planes y tu consumo | `/dashboard/plans` |
| Tus organizaciones | `/dashboard/organizations` |
| Crear una | `/dashboard/organizations/new?tier=…` |
| El portal de una | `/dashboard/organizations/:id` |
| Aceptar una invitación | `/dashboard/organizations/invitation?token=…` |
| La tarjeta del plan | `/dashboard/settings` |

### Apuntes

- 🔴 **Planes no tenía entrada en la barra lateral.** Solo se llegaba por un
  enlace dentro de la tarjeta de Configuración y por el aviso del chat al agotar
  la cuota: o sea, **solo tropezando con un límite**. Una tabla de precios a la
  que se llega chocando no vende nada. Corregido.
- ⚠️ **Las rutas nuevas nacieron en español** (`/planes`, `/organizaciones`,
  `nueva`, `invitacion`), contra la convención del repo — nombres de fichero en
  inglés. Corregido; queda la deuda de `components/organisms/Planes` y
  `.../Organizaciones`, que siguen en español (ver E6).
- **Ninguna cifra se escribe en el frontend.** La tabla se pinta con el catálogo
  que manda el servidor. Los precios son la excepción y tampoco salen de ahí:
  viven en Stripe, y lo que se enseña es el texto del `.env` de la zona. Si los
  dos discrepan **manda Stripe**, así que la tarjeta escribe «—» antes que
  inventarse una cifra.
- **El aviso del mes gratis va junto al botón**, no en la letra pequeña.
- **El formulario de asientos se envía con `onSubmit` + `preventDefault()`**
  porque **edita**: un `<form action={…}>` se resetea solo en React 19 y el campo
  volvería al número viejo. El de invitar sí usa `action={…}` — ahí vaciarse es
  lo que se quiere.
- **`VueltaDelPago` espera a que el plan *cambie*, no a que sea uno concreto.**
  Esperar «PRO» dejaba a quien compra Plus mirando el mensaje de confirmación
  hasta agotar los intentos, con el plan ya aplicado por detrás.

---

## E6 — Cierre *(pendiente)*

Lo que falta, por orden de lo que más duele:

1. 🔴 **No hay pantalla de recuperación tras un 402.** El mensaje sale en el
   diálogo de crear proyecto y **sin un botón que lleve a Planes**. El dato para
   pintarlo ya viaja (`error.details` trae `kind`, `tier`, `tope`, `actual`);
   falta la pantalla. Es el sitio exacto donde alguien decidiría pagar.
2. ⚠️ **La invitación no se manda por correo** (D9). Decidir si
   `credentials-service` expone un comando de envío, y con qué acotación.
3. ⚠️ **Sin pruebas end-to-end.** Ni de las cuotas ni del portal. Todo lo de
   esta etapa se verificó a mano contra el stack levantado.
4. ⚠️ **ESTADO-ACTUAL y CONTRATO-API no mencionan nada de esto**: ni el noveno
   servicio, ni las doce rutas nuevas, ni el 402.
5. ⚠️ **No hay traspaso de dueño de una organización.** Está bloqueado a
   propósito —hay un dueño y es quien paga— pero no tiene ruta, así que hoy una
   organización muere con su creador.
6. **Los componentes siguen en español**: `components/organisms/Planes/` y
   `.../Organizaciones/`. Renombrarlos es seguro (son `PascalCase` inequívocos),
   pero se dejó fuera para no mezclarlo con el arreglo de rutas.
7. **El webhook en local necesita `stripe listen --forward-to
   localhost:3000/api/webhooks/stripe`.** Sin él se paga y el plan no se aplica
   — que es el comportamiento correcto, pero hay que saberlo.

---

## Cómo retomar esto en frío

1. Lee [ENCARGO-ENTERPRISE.md](ENCARGO-ENTERPRISE.md): es lo que se pidió, y sus
   cinco trampas siguen siendo las que muerden.
2. Lee las **diez decisiones** de arriba. Ninguna venía del encargo; todas se
   pueden cambiar, y cambiar una es cambiar un párrafo de este documento antes de
   tocar código.
3. Los números están en `contracts/src/billing/plans.ts` y en ningún otro sitio.
4. Para levantarlo: `pnpm docker:up && pnpm build:shared && pnpm prisma:deploy &&
   pnpm dev:backend` (necesita `--concurrency=16`, ya está en el script) y
   `pnpm dev:frontend`. Los precios de Stripe del entorno local son de una cuenta
   **sandbox**; sin ellos, cada plan sin precio se apaga solo (D10).
5. Lo siguiente que hay que hacer es E6.1 — la pantalla del 402.
