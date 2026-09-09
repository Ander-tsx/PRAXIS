# Plan de asientos congelados — bajar de plan no puede echar a nadie

> Etapa **abierta y sin empezar**. Nace de una pregunta del dueño del producto el
> 2026-09-09: *«tengo 5 personas y el mes gratis del plan Equipo; ¿qué pasa
> cuando se acabe? ¿se expulsa gente? ¿pierdo proyectos?»*.
>
> 📍 Vive en `docs/` y no en `docs/frontend/`: **es una regla de negocio y toca
> el backend**. No se puede aproximar desde el frontend sin mentir en la pantalla.
>
> ⚠️ El diseño de abajo **no está cerrado**. Las siete decisiones tienen una
> recomendación y un porqué; las cinco preguntas abiertas del final hay que
> contestarlas antes de escribir código.

---

## El encargo, literal

> «Si se me acaba el plan, que los usuarios invitados a la org se ordenen por
> fecha en la que fueron invitados (o que entraron/aceptaron, lo que sea
> conveniente) y que en base a eso, si hay 5 personas y me bajan a free tier,
> las últimas 2 en llegar se queden **congeladas dentro** de la organización.»

Lo importante de esa frase es «dentro». Nadie sale, nadie pierde su sitio, y
cuando se vuelve a pagar todo el mundo se descongela sin que nadie tenga que
reinvitar a nadie.

---

## Qué pasa hoy, medido en el código

Se comprobó antes de diseñar nada, y el resultado cambia el planteamiento.

### Lo bueno: hoy no se expulsa a nadie, y tampoco por accidente

Al cancelar, el webhook escribe `tier: FREE` y `status: CANCELED`
(`gateway/src/billing/stripe-webhook.controller.ts`), y `planEfectivoDe` empieza
a devolver las cuotas del plan gratuito. Pero:

- Las cuotas se comprueban **solo en los caminos de escritura** — crear
  proyecto, activar automatización, subir adjunto, invitar. Ninguna en la
  lectura.
- **No hay un solo `@Cron` ni `ScheduleModule` en todo el backend.** Nada corre
  más tarde para podar nada.

Así que los proyectos y las membresías se quedan intactos. Lo que se nota es la
cuota de PRAX (100 → 13 por persona y mes), el almacenamiento (10 GB → 200 MB),
las automatizaciones activas (25 → 3 por proyecto) y el historial de análisis
(365 → 90 días).

### 🔴 Lo malo: el tope de asientos del plan gratuito no lo aplica nadie

La única puerta de asientos está en billing-service, y mira
`Subscription.seats` —lo **contratado en Stripe**— no la cuota del plan:

```ts
// services/billing/src/organizations/organizations.service.ts
const asientos = organizacion.subscription?.seats ?? 1;
if (ocupados >= asientos) return { codigo: 'SIN_ASIENTOS', … };
```

Y `QuotaKind.ASIENTOS` solo aparece en un sitio de todo el gateway: el informe
de `GET /me/billing/resumen` (`billing.controller.ts`), que **describe** el
exceso pero no lo impide. Ningún guard lo invoca.

Además, al cancelar el webhook conserva `seats` con la última cantidad de Stripe
(`seats: subscription.items.data[0]?.quantity`), así que ni siquiera baja a 3.

**Consecuencia:** una organización que cancela se queda con los asientos que
contrató y puede seguir invitando hasta ese número. El plan gratuito promete
tres y no los hace cumplir. Es la tercera vez que aparece este patrón —una
cuota escrita en `plans.ts` que no invoca nadie—; las dos anteriores están en
CLAUDE.md (trampa 20 con `organizacionesPropias`, trampa 23 con las tres
últimas).

### Lo que ya no hay que construir

`OrganizationMember` **ya tiene las dos fechas** que pide el encargo:

```prisma
invitedAt DateTime  @default(now())
joinedAt  DateTime?
status    MembershipStatus @default(INVITED)
```

O sea que el orden no necesita migración. La parte difícil no era esa.

---

## Las siete decisiones

### D1 — Congelado se **deriva**, no se guarda

No hay columna `frozen`. Se calcula al leer, ordenando las membresías activas y
cortando por el tope del plan.

**Por qué.** Un flag hay que mantenerlo al día en cinco sitios —cancelar, pagar,
invitar, sacar a alguien, cambiar de plan— y el día que uno se olvide habrá
gente congelada en una organización que ya paga, sin que nada falle. Derivado,
volver a pagar **descongela solo**, que es justo lo que pide el encargo.

⚠️ El coste es que el orden hay que calcularlo en cada comprobación. Es una
consulta ordenada sobre una tabla que tiene decenas de filas, no millones.

### D2 — El criterio de orden es `joinedAt`, con `invitedAt` de repliegue

Se ordena **ascendente**: primero quien lleva más tiempo dentro. Se congela la
cola.

`joinedAt` y no `invitedAt` porque lo que cuenta es haber estado trabajando: una
invitación de hace tres meses que se aceptó ayer no da antigüedad. Pero
`joinedAt` es `null` mientras la invitación está pendiente, así que el orden
real es `COALESCE(joinedAt, invitedAt)`.

### D3 — El dueño **nunca** se congela, y no ocupa un turno

Se resuelve contra `Organization.ownerUserId` **antes** de ordenar, igual que ya
hace `permisosDe` con los papeles. Sale de la lista y se le descuenta un asiento
al tope.

**Por qué.** Congelar al dueño deja una organización que nadie puede
descongelar: para volver a pagar hay que entrar, y para entrar no hay que estar
congelado. Es un cierre sin llave por dentro.

### D4 — Congelado = **solo lectura**, y se le dice por qué

Puede entrar, ver sus proyectos, leer tareas, leer el chat. No puede escribir
nada: ni crear, ni editar, ni mover, ni comentar, ni subir.

**Por qué solo lectura y no bloqueo total.** Alguien congelado no ha hecho nada
mal; le bajaron el techo. Dejarle fuera del todo es indistinguible de que le
hayan echado, que es exactamente lo que el encargo prohíbe.

⚠️ **Y el 403 tiene que llevar código propio** —`SEAT_FROZEN`— no un `FORBIDDEN`
genérico. Es la misma lección que `PROJECT_SUSPENDED_CODE` (CLAUDE.md trampa
11): un permiso denegado se arregla pidiéndoselo a quien administra el proyecto,
y esto no se arregla así — hay que ampliar el plan. Confundirlos manda a la
persona a pedirle algo a quien no se lo puede dar.

### D5 — Se aplica en el **gateway**, con las demás cuotas

`QuotaService.exigirAsientoVivo(userId, organizationId)`, invocado por los
guards de escritura. billing-service expone el cálculo del orden; projects-service
y tasks-service no se enteran, igual que hoy no se enteran de los asientos.

### D6 — El tope efectivo es `min(Subscription.seats, quotas.asientos)`

Los dos números existen y significan cosas distintas: lo contratado y lo que el
plan admite como mucho. Hoy solo se mira el primero — el agujero de arriba.

Con el mínimo, una organización que cancela pasa de 5 contratados a 3 (el tope
de FREE) y se congelan 2. Y una que contrató 5 en un plan de 15 sigue con 5, que
es lo que paga.

### D7 — El aviso llega a **quien puede resolverlo**, no solo a quien lo sufre

`GET /me/billing/resumen` ya trae `excedidas[]`. Se le añade quién está
congelado, y la tarjeta la ve quien tenga `canManageBilling` — que en un equipo
de cinco no suele ser quien se quedó fuera. Es la misma asimetría que ya resuelve
`puedeAmpliar` en el 402 de proyectos.

---

## Los invariantes

1. **Nadie se borra nunca.** Ni membresías, ni proyectos, ni tareas, ni mensajes.
   Congelar es un estado calculado, jamás un `DELETE`.
2. **El dueño nunca se congela.**
3. **Volver a pagar descongela sin intervención**, y en el mismo instante.
4. **Congelado se lee**, se distingue de un permiso denegado (`SEAT_FROZEN`) y
   se explica en la pantalla.
5. **El orden es estable.** Dos personas con la misma fecha se desempatan por
   `id`, o el corte bailará entre peticiones y hoy congelará a una y mañana a la
   otra.

---

## El orden de trabajo

| # | Paso | Dónde |
|---|---|---|
| A1 | Tapar el agujero: aplicar `min(seats, quotas.asientos)` al invitar | billing-service |
| A2 | `orderMiembrosPorAntiguedad` + cálculo del corte, con el dueño fuera | billing-service |
| A3 | `billing_frozen_members` por TCP, y `SEAT_FROZEN` en `fallos.ts` | billing-service + gateway |
| A4 | `QuotaService.exigirAsientoVivo` y su uso en los guards de escritura | gateway |
| A5 | `excedidas[]` incluye congelados; `resumen` dice quiénes | gateway |
| A6 | La cinta de «estás en solo lectura» y el listado en Equipo | frontend |
| A7 | Pruebas: cancelar con 5, comprobar que las 2 últimas leen y no escriben, volver a pagar y comprobar que escriben | e2e |

⚠️ **A1 es independiente y se puede entregar solo.** Es el arreglo de un agujero
real que hoy regala asientos en el plan gratuito, y no depende de nada de lo
demás. Si esta etapa se aplaza, A1 no debería aplazarse con ella.

---

## Las cinco preguntas que faltan por contestar

1. **¿Quién más se salva además del dueño?** Alguien con `canManageBilling` es
   quien puede volver a pagar; congelarlo tiene el mismo problema que congelar al
   dueño, en menor grado. ¿Se salvan todos los que puedan pagar, o solo el dueño?
2. **¿Qué pasa con las invitaciones pendientes?** Ocupan asiento (así se cuenta
   hoy, a propósito). Al bajar de plan, ¿se congelan, se cancelan, o se dejan
   caducar solas?
3. **¿Congelado afecta a los proyectos de otras organizaciones?** El plan vale
   dentro de su organización (CLAUDE.md trampa 20). Alguien congelado en la tuya
   debería seguir escribiendo con normalidad en la suya — hay que comprobar que
   `exigirAsientoVivo` recibe siempre la organización del **recurso**, nunca la
   cookie.
4. **¿Y sus tareas asignadas?** Siguen asignadas a quien no puede tocarlas.
   ¿Se avisa en el tablero, se deja como está, o se ofrece reasignar?
5. **¿Qué se hace con las organizaciones que hoy ya están por encima?** Al
   entregar A1 pasarían a tener gente congelada de un día para otro, sin haber
   hecho nada. Hace falta decidir si hay periodo de gracia y cuánto.

---

## Registro

*(vacío — la etapa no ha empezado)*
