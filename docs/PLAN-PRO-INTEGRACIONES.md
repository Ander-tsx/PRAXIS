# Plan Pro fijo + integraciones (MCP y GitHub)

> **Estado: P0 cerrada** (2026-10-02): decisiones D1–D12 tomadas con el dueño y
> backend acordado. Falta confirmar en el dashboard en qué modo están los objetos
> de Stripe (ver «Stripe»). Siguiente: **P1**. Nace de una
> conversación con el dueño del producto. **Una sesión que retome esto empieza
> leyéndolo entero**, y después [PLAN-MCP.md](PLAN-MCP.md), que es la mitad
> técnica de la primera integración. ⚠️ **Toca el backend** (billing, credentials,
> gateway): hay que acordarlo antes, como pide M11 de PLAN-MCP.

---

## El encargo, en una frase

El plan **Pro deja de cobrarse por asiento y pasa a ser un plan fijo y barato**
para equipos pequeños que quieren algo sencillo, y es **el primero que trae
como valor añadido** (1) el **MCP de Praxis** —que el agente del usuario
(Claude, Cursor…) gestione el tablero— y (2) la **integración con GitHub**. Equipo
queda para empresas más grandes.

Literal del dueño:

> «Pro como plan fijo podría ser el primer plan en integrar MCP de IA +
> integración con GitHub como opciones de valor.»
> «Un equipo chico no quiere cobro por asientos, quiere algo sencillo para
> trabajar en equipo: un plan low-cost que permita trabajar a un equipo de tamaño
> decente con lo indispensable a un precio económico. Una empresa grande ya
> preferirá Equipo.»

Los cambios en Stripe **los hace el agente** con Claude in Chrome sobre la sesión
del dueño (ver «Stripe»), no el dueño a mano.

---

## Lo que ya está medido (2026-10-02)

| Hecho | Dónde |
|---|---|
| La cuota de IA es en **tokens PRAX**, **por persona y por organización**, no en mensajes. Gratis 250 mil · **Pro 1,5 M** · Equipo 2 M · Negocio 6 M · Enterprise 20 M al mes (provisionales: ~20 mil tokens por turno) | `apps/backend/commons/contracts/src/billing/plans.ts` (`iaTokensMensualesPorPersona`) |
| Pro hoy: **5 asientos, 5 proyectos**, 10 automatizaciones por proyecto, 2 GB, 180 días de historial, `asientosMinimos: 1`, sin mes de prueba, `AUTOSERVICIO` | `plans.ts` ~línea 312–360 |
| El precio sale de la variable **`STRIPE_PRICE_PRO`** (no hay id en el código: cambia entre pruebas y real) | `plans.ts:349`, `gateway/src/common/config/env.validation.ts:95` |
| El tope de asientos que aplica el servidor es **`min(Subscription.seats, quotas.asientos)`**; sin suscripción vigente, el del plan gratuito | `services/billing/src/organizations/asientos.ts` |
| «Popular» está **fijo en Equipo**: `destacado = plan.tier === 'TEAM'` | `apps/frontend/web/src/components/organisms/Billing/PlanCatalog.tsx:76` |
| `plans.spec.ts` exige que **cada escalón dé ≥ que el anterior en todos los ejes** y que el **techo total de IA** (`porPersona × asientos`) tampoco baje | `contracts/src/billing/plans.spec.ts` |
| El motor de automatizaciones **declara** `GITHUB_PULL_REQUEST_OPENED` y `MOVE_TASK`, pero el servidor los rechaza (400 «no soportado») | `docs/frontend/CONTRATO-API.md` ~1704, `PLAN-PRAX-AUTOMATIZA.md` ~402 |
| Integraciones ya tiene entrada de menú (`/main/integrations`, marcada «Pronto») | `commons/organisms/AppLayout/navigation.tsx` |

⚠️ **`docs/AUDITORIA-PLANES.md` tiene en el cuerpo la tabla vieja en mensajes**
(13 / 75 / 100). La nota de arriba del documento lo avisa: donde diga «mensajes»,
léase tokens PRAX. **No tomes esas cifras del cuerpo.**

---

## Stripe: estado real, leído el 2026-10-02 (solo lectura)

Cuenta `acct_1U4P2vRtjrkmFx5t` («PRAXIS · ANDER»), moneda **MXN**. Producto
`prod_V70Nktw6hkM6vY` «PRAXIS PRO», activo, **0 suscripciones**:

| Precio | Importe | Nota |
|---|---|---|
| (por defecto en el producto) | **120 MXN / mes** | sin descripción; el más antiguo |
| `price_1UBfUbRtjrkmFx5tcR2qNv8r` | **60 MXN / mes** | «Pro (catalogo 2026-09) – por asiento y mes» — **es por asiento** |

Notas del producto: sin trial, sin metadatos, sin lista de características.

⚠️ **No se pudo confirmar si es modo de pruebas o real**: la captura no enseñó
ninguna cinta de «modo de pruebas». **Antes de escribir nada, confírmalo con el
dueño** (y mira `docs/deploy/STRIPE-MODO-REAL.md`: los objetos de prueba no se
migran, y activar la cuenta y las claves va a mano, siempre).

🔴 **Respuesta del dueño (2026-10-02): la cuenta está en modo real.** Pero el
`.env` local del gateway lleva una clave **`sk_test_`**: el entorno local habla
con el modo de **pruebas**. Así que el producto y los dos precios de arriba
pueden ser objetos **de prueba** de una cuenta que en real está activada, y en
ese caso **no existen en real** (los objetos de prueba no se migran). **Antes de
la primera escritura** se abre el dashboard con el interruptor de modo de
pruebas a la vista y se anota aquí en qué modo está cada objeto. El precio fijo
se crea **en los dos modos**: el de pruebas va al `.env` local y el real a
`STRIPE_PRICE_PRO` de producción, que pone el dueño a mano.

### Estado medido el 2026-10-02 (segunda lectura)

Son **dos cuentas distintas**, no dos modos de la misma:

| | Cuenta | Producto PRAXIS PRO | Precios |
|---|---|---|---|
| **Real** | `acct_1U4P2vRtjrkmFx5t` | `prod_V70Nktw6hkM6vY` | **99 nuevo `price_1UM9xPRtjrkmFx5tJiwFuivR`, por defecto**, sin prueba en el precio; 120 y 60 **archivados**, 0 suscripciones. Lo hizo el dueño a mano el 2026-10-02 y el agente lo verificó (solo lectura) |
| **Sandbox** «PRAXIS sandbox» | `acct_1U4P3B2LjbIaK2Ms` | `prod_V70Nktw6hkM6vY` | 120 (por defecto, 5 suscripciones de prueba), **99 nuevo `price_1UM9t52LjbIaK2MsjTE9a7Sn`** (`lookup_key: pro_fijo_mensual`), 60 **archivado** |

El `.env` local del gateway (`sk_test_`) es el **sandbox**; su `STRIPE_PRICE_PRO`
ya apunta al de 99, y `web/.env.local` lleva `NEXT_PUBLIC_PRECIO_PRO=99`. El
modo de pruebas de la cuenta real está vacío.

**Lo que falta en real, a mano (el dueño):** en el producto PRAXIS PRO, añadir
un precio *recurring · flat rate · 99 MXN · monthly* (descripción «Pro fijo
(2026-10) - precio por organizacion y mes», `lookup_key` `pro_fijo_mensual`),
marcarlo por defecto y archivar el de 120 y el de 60. Después, en Railway:
`STRIPE_PRICE_PRO=<price_ nuevo>` en `api` y `NEXT_PUBLIC_PRECIO_PRO=99` en `web`.
⚠️ **Sin periodo de prueba en el precio**: el mes gratis lo pone el checkout,
y los dos se sumarían (ver `stripe.service.ts`).

### Cómo se prueba el cobro en real (decisión del dueño)

Con el **mes de prueba** de D9, el checkout en real **no cobra**: Stripe guarda
la tarjeta y, como mucho, hace una autorización temporal que el banco puede
avisar. El dueño se suscribe a Pro con su tarjeta, se comprueba que el webhook
llega, que la organización pasa a Pro y que `seats` queda en 7 (D10), y **cancela
antes de que termine la prueba**: no se cobra nada.

⚠️ Esto prueba checkout, webhook y asientos, **no el cobro en sí** (el
`invoice.paid` del primer mes). Si se quiere ver ese evento, se dispara con el
CLI de Stripe en modo de pruebas (`stripe trigger invoice.paid`), nunca
cobrando de verdad.

### Cómo se hará el cambio (cuando esté decidido el precio)

1. **No se edita el precio por asiento existente**: un precio de Stripe es
   inmutable en importe. Se **crea uno nuevo** *fijo* (`unit_amount` por mes, sin
   `quantity` variable, `recurring: month`) en el mismo producto, y se **archiva**
   el de «por asiento» cuando ya nadie lo use (0 suscripciones hoy: es seguro).
2. Se **elige un precio por defecto** en el producto (hoy el default es el de 120).
3. Se copia el `price_…` nuevo a **`STRIPE_PRICE_PRO`** del entorno (local, y el
   de producción lo pone el dueño: ⚠️ las claves y el entorno de producción van a
   mano).
4. Se añade la lista de características de marketing al producto (opcional).

**Lo que sí puede hacer el agente** con la sesión del dueño en Chrome: crear el
precio nuevo, archivar el viejo, poner el default, editar el nombre y la
descripción. **Lo que no:** activar la cuenta, introducir claves o datos
bancarios, ni nada que mueva dinero. Cada escritura se **confirma antes en el
chat** («voy a crear un precio fijo de X MXN/mes en prod_V70N…, ¿confirmas?»).

---

## Decisiones tomadas (D)

**D1 — Pro es un plan de precio fijo, no por asiento.** El importe no depende del
número de personas.

**D2 — Pro es el primer plan con MCP y con GitHub.** Son su argumento de valor
frente a Gratis. Equipo, Negocio y Enterprise los **heredan** (la escalera no
puede quitar: lo exige `plans.spec.ts`).

**D3 — Pro se vende como «equipo pequeño con lo indispensable»; Equipo, como
escala.** Lo que los separa es el **tamaño** (asientos, proyectos, tokens,
almacenamiento, historial), no una función exclusiva.

### Cerradas en P0 (2026-10-02, con el dueño)

Las A de abajo se conservan por el razonamiento; esto es lo que se decidió.

**D4 — 99 MXN al mes, fijo** (cierra A1). Sin anual por ahora. Es un precio
**nuevo** en Stripe: ni el de 120 ni el de 60 por asiento sirven.

**D5 — 7 asientos y 7 proyectos** (cierra A2). Tope duro: sin cobro por asiento,
para pasar de 7 personas hay que subir a Equipo.

**D6 — 250 mil tokens PRAX por persona, igual que Gratis** (cierra A4). A 99 MXN
la IA no puede ser el argumento: lo son MCP y GitHub. El techo del equipo sube
solo porque caben más personas (7 × 250 mil = 1,75 M frente a 3 × 250 mil =
750 mil). Sin techo total nuevo en `PlanQuotas`: no hace falta y evita una cuota
más que aplicar. `plans.spec.ts` lo admite (exige ≥, no >).

**D7 — El resto de Pro se recorta** (cierra A5): **5 automatizaciones por
proyecto, 1 GB, 90 días de historial**. Queda entre Gratis (3 / 200 MB / 90 d) y
Equipo (25 / 10 GB / 365 d).

**D8 — Fila `PRO` de `plans.ts` resultante:**

| Cuota | Gratis | **Pro** | Equipo |
|---|---|---|---|
| `asientos` | 3 | **7** | 15 |
| `proyectos` | 3 | **7** | 25 |
| `iaTokensMensualesPorPersona` | 250 mil | **250 mil** | 2 M |
| `automatizacionesPorProyecto` | 3 | **5** | 25 |
| `almacenamientoOrgMb` | 200 | **1.024** | 10.240 |
| `historialAnalisisDias` | 90 | **90** | 365 |
| Mes de prueba | — | **30 días** | 30 días |

**D9 — Pro tiene mes de prueba, de 30 días, y Equipo deja de tenerlo** (cierra
A6; lo segundo, decisión del dueño del 2026-10-02). **Uno por persona y uno por
organización**: tabla `billing.trial_redemptions`, consultada por el checkout y
garantizada por el webhook, que corta (`trial_end: now`) una segunda prueba
colada por dos checkouts a la vez. La migración cuenta como usadas las pruebas
de Equipo que ya se dieron. Sirve para conseguir
usuarios **y** para probar en real sin cobrar (ver «Cómo se prueba el cobro en
real»).

⚠️ El JSDoc de `diasDePrueba` en `plans.ts` dice que **«solo lo tiene el primer
peldaño de pago»**, y hasta hoy ese peldaño era Equipo. Con D9 pasa a ser Pro.
**Resuelto:** Equipo la pierde; el comentario y `plans.spec.ts` ya lo dicen.

**D10 — `Subscription.seats` de un Pro = el tope del plan (7), y lo escribe el
webhook** (cierra A3). Así `min(seats, quotas.asientos)` da 7 y nadie se congela.
También en estado `trialing`, que `estaVigente` ya cuenta como vigente:
comprobarlo con una prueba, no darlo por hecho.

**D11 — El MCP no gasta tokens PRAX** (cierra A7). Lo razona el modelo del
usuario. Lo que se acota es la API: límite de llamadas por minuto por token (M9
de PLAN-MCP).

**D12 — Las integraciones viven en `/main/integrations`, son personales y la
organización decide si se permiten.** Petición del dueño:
- Una página con **todas** las integraciones (MCP, GitHub, las que vengan), y
  cada una se despliega para configurarla.
- **Cada persona gestiona la suya** —su token MCP, para que su agente trabaje
  como ella misma— **dentro de la organización activa**.
- **La organización puede no permitirlo**: un interruptor por integración que
  ve quien administra la organización. Apagado, nadie crea tokens nuevos y los
  que hay dejan de funcionar (se comprueba al usarlos, no solo al crearlos).
- **Puerta por plan:** con Gratis la tarjeta sale con «Disponible en Pro».
- Sustituye a «Ajustes» como sitio de la pantalla del MCP (M5 de PLAN-MCP).

**D13 — Nada del backend se publica: lo que viene de fuera entra por `web`.** En
Railway el gateway **no tiene dominio público** (`docs/deploy/RAILWAY.md`: red
privada, `api.railway.internal`), y así se queda. El MCP (`/api/mcp`) y el
webhook de GitHub (`/api/webhooks/github`) son **route handlers de paso** en
`apps/frontend/web`, como el de Stripe (`web/src/app/api/webhooks/stripe/route.ts`):
- **No sirve `createGatewayProxy()`**: borra `Authorization` y saca la sesión de
  la cookie. El MCP **necesita** ese `Authorization: Bearer <token>`, y el webhook
  de GitHub trae su firma.
- **El cuerpo pasa crudo** (`arrayBuffer()`) para que la firma de GitHub cuadre.
- **La respuesta del MCP puede ser un flujo** (Streamable HTTP admite SSE): el
  paso tiene que reenviarla sin bufferizar.
- ⚠️ `/api/mcp` **no puede ir a `PREFIJOS_PRIVADOS`** de `proxy.ts`: no lleva
  cookie, y el guard lo mandaría al login. Se autentica con su token en el
  gateway.

## Decisiones abiertas (A) — cerradas arriba, se conservan por el razonamiento

**A1 — ¿Cuánto cuesta?** Hoy hay 120 y 60 MXN/mes en el producto (ninguno
validado como el precio final). Falta el importe fijo y si hay anual.

**A2 — ¿Cuántas personas caben?** El dueño habló de «un equipo de tamaño
decente» y de **7 asientos y 7 proyectos** como orden de magnitud (hoy 5 y 5).
Sin cobro por asiento, `asientos` pasa a ser un **tope duro del plan**.

**A3 — ¿Qué es `Subscription.seats` en un plan fijo?** El tope vigente es
`min(Subscription.seats, quotas.asientos)`. Un plan sin cantidad tiene que dejar
`seats` en un valor definido (propuesta: el tope del plan, escrito por el
webhook), o `asientos.ts` tratará un `null` como «sin suscripción» y
**congelará a todos**. Es la trampa principal de este cambio. Mira
`docs/PLAN-ASIENTOS-CONGELADOS.md` antes.

**A4 — ¿Cuántos tokens por persona, y hay techo del equipo?** Hoy Pro da 1,5 M
por persona (`iaTokensMensualesPorPersona`): con N personas, el coste de IA crece
con N y el precio no. Opciones: bajarlo; o añadir un **techo total del plan** a
`PlanQuotas` (no existe hoy: el techo es `porPersona × asientos`). Ojo con
`plans.spec.ts`: Pro no puede quedar por debajo de Gratis ni por encima de Equipo
en el techo total. ⚠️ Si se añade un número a `PlanQuotas`, **el mismo commit que
lo añade tiene que aplicarlo** (trampa 23 de CLAUDE.md; ya pasó tres veces).

**A5 — ¿Qué se le quita a Pro para que no compita con Equipo?** Candidatos:
historial de Análisis más corto, menos automatizaciones, menos almacenamiento.

**A6 — Mes de prueba.** Hoy Pro no lo tiene y Equipo sí (30 días, «decisión del
dueño»). ¿Pro con prueba?

**A7 — ¿Cuántos tokens por turno de MCP?** El MCP lo paga el modelo **del
usuario**, no el nuestro; lo que paga Praxis es la API. No gasta cuota de
tokens PRAX. Decidir si tiene cuota propia por token (M9 de PLAN-MCP: límite de
velocidad por PAT) o va aparte.

---

## Fases propuestas

> El orden importa: **cada fase deja `main` verde y usable.** Registro al final,
> con casilla.

### P0 — Cerrar A1–A7 con el dueño y acordar con backend
Un documento corto de decisiones tomadas, escrito aquí. Sin código. **Y confirmar
modo de pruebas o real de Stripe.**

### P1 — Pro pasa a precio fijo (backend + Stripe + pantalla)
- `plans.ts`: la fila `PRO` de D8, con `diasDePrueba: 30` (D9) y una marca de
  **precio fijo** que distinga «sin cantidad» de «por asiento» (hoy no existe:
  `contratacion` solo dice si se compra solo). `asientosMinimos` deja de tener
  sentido para Pro.
- `billing` (`gateway/src/billing/stripe.service.ts`): el checkout de Pro manda
  `quantity: 1` sobre el precio fijo **y no lo usa como asientos**; el cambio de
  asientos (línea ~237, `quantity: seats`) **no se ofrece** para Pro. El webhook
  escribe `seats = quotas.asientos` (D10), también en `trialing`.
  Probar con el **CLI de Stripe** o un checkout de pruebas **antes** de producción.
- Stripe: crear el precio fijo (ver «Cómo se hará el cambio»), actualizar
  `STRIPE_PRICE_PRO`.
- `PlanCatalog.tsx`: «Popular» pasa a Pro; la columna enseña «Precio fijo» en vez
  de «por asiento»; el selector de asientos desaparece solo para Pro.
- Pruebas: `plans.spec.ts` (la escalera y el techo total), una de integración
  del webhook con Pro, y un e2e de `/main/billing`.
- ⚠️ **No hay suscriptores de Pro hoy (0 activas)**: no hace falta migración de
  datos, pero sí comprobar que no hay filas `Subscription` huérfanas con `seats`.

### P2 — MCP (ver [PLAN-MCP.md](PLAN-MCP.md), fases M0–M6)
Con la diferencia de que **el MCP se activa por plan**: Pro y superiores. Gratis
no lo ve (la pantalla de Integraciones enseña la tarjeta con «Disponible en Pro»).
Dónde se comprueba: en la **creación del PAT** (el gateway rechaza con 402 y
`puedeAmpliar`, igual que las demás cuotas) **y** al usarlo, por si la
organización baja de plan. Una cuota que no se comprueba no da error (trampa 23).

Y además, **el interruptor de la organización** (D12): tres condiciones en cada
llamada —plan ≥ Pro, integración permitida en la organización, token vivo—. La
pantalla es `/main/integrations` (D12) y la entrada pública, un route handler de
paso en `web` (D13).

Primera entrega: **lectura y escritura**; el borrado, aparte (M4). El ejemplo del
dueño —«Claude, haz mis tareas 1 y 2»— es: el agente lee la tarea por MCP, hace
el trabajo y el PR con **sus propias herramientas**, y vuelve a Praxis a marcarla
«en revisión». **Praxis no ejecuta código.**

### P3 — GitHub
Diseño propuesto (a validar con el dueño y con backend):
- **GitHub App** que la organización instala sobre sus repos (no OAuth de usuario:
  permisos acotados por repo y webhooks incluidos).
- **Webhook firmado** (`X-Hub-Signature-256` verificado con el secreto de la App)
  que llega al gateway **a través de un route handler de paso en `web`** (D13:
  el gateway no tiene dominio público). Es una ruta pública, igual que el webhook de Stripe:
  🔴 **hay que verificar firma y rechazar sin ella**, y no pasa por el guard de
  sesión.
- **Vínculo tarea ↔ PR** por una convención del título o la rama (p. ej.
  `PRAX-123`), más un vínculo manual desde la tarea.
- Estados: PR abierto → «en revisión»; PR fusionado → «completada» (o la columna
  que se configure); PR cerrado sin fusionar → no mueve nada, avisa.
- Reutiliza el **motor de automatizaciones**: implementar de verdad
  `GITHUB_PULL_REQUEST_OPENED` / `MOVE_TASK` en el servidor es la forma más
  barata, y las reglas del usuario ya los entienden. Falta tabla de instalaciones
  y de vínculos.
- Pantalla en `/main/integrations`: conectar, elegir repos, ver qué tareas están
  en PR.

### P4 — Medir
`lastUsedAt` y contador por herramienta del MCP (M12) y de eventos de GitHub
recibidos. Si nadie los usa, no se invierte en OAuth ni en más conectores.

---

## Invariantes

1. **Una cuota se aplica en el mismo commit que la declara.** (Trampa 23.)
2. **El plan vale solo dentro de la organización que lo paga**, y esa organización
   **nunca sale de una cookie**: se deriva del recurso o se valida su pertenencia.
   Vale igual para la instalación de GitHub y para el PAT.
3. **Un webhook público verifica su firma o no existe.** Stripe ya lo hace; GitHub
   igual.
4. **El agente del usuario no puede más que el usuario.** (M2 de PLAN-MCP.)
5. **Nada de Stripe en modo real sin confirmación explícita en el chat.**
6. **«El asistente propone; nunca ejecuta» sigue vigente para PRAX.** El MCP es
   **otra cosa**: es el agente del usuario, con su token (ver PLAN-MCP, «Qué NO es
   esto»).

## Trampas previstas

- **`seats` nulo = todos congelados.** Ver A3. Es silencioso: nadie da error, la
  gente deja de poder escribir.
- **Mezclar los dos precios de Stripe.** El producto tiene dos y el «por defecto»
  es el de 120, no el de 60. Un `STRIPE_PRICE_PRO` apuntando al equivocado cobra
  el doble o el mitad sin que nada falle.
- **La tabla de precios se pinta de `PLAN_LIST`.** Si el plan fijo no distingue
  «precio fijo» de «por asiento», la pantalla seguirá pidiendo cantidad.
- **El webhook de GitHub y el de Stripe viven en sitios distintos del monolito.**
  Un servicio o ruta nuevos van en `SERVICIOS`, `SCHEMAS` y `migrar.sh` (CLAUDE.md,
  sección del monolito).
- **El PAT del MCP no se guarda en claro**: solo su hash, y se enseña una vez.

## Cómo retomarlo

1. Lee este documento y [PLAN-MCP.md](PLAN-MCP.md).
2. P0 está cerrada (D4–D13). **Empieza por P1**, y antes de cualquier escritura
   en Stripe anota en qué modo está cada objeto (ver «Stripe»).
3. Para Stripe, abre el producto con Claude in Chrome
   (`https://dashboard.stripe.com/acct_1U4P2vRtjrkmFx5t/products/prod_V70Nktw6hkM6vY`).
   El navegador ya tiene la sesión del dueño. **Confirma cada escritura en el
   chat.**
4. Levanta el entorno con `pnpm docker:up`, migraciones y semillas (ver README);
   para verificar, el stack **construido**, no el modo desarrollo (la máquina
   tiene 8 GB).
5. Marca la casilla de cada fase al cerrarla.

## Registro

| Fase | Estado | Nota |
|---|---|---|
| P0 — Decisiones y acuerdo con backend | ✅ | 2026-10-02. D4–D13 con el dueño; backend acordado. Pendiente solo anotar el modo de cada objeto de Stripe antes de escribir |
| P1 — Pro a precio fijo | ✅ | 2026-10-02, rama `feature/pro-integraciones`. Código hecho y en verde (catálogo, `precioFijo`, asientos = tope, checkout sin cantidad, `trial_redemptions` + corte en el webhook, Equipo sin prueba, tabla de precios). Sandbox configurado. En `main` (`49865f2b`). Precio real verificado y comprobado por el dueño en producción |
| P2 — MCP (M0–M6 de PLAN-MCP, con la puerta por plan) | ✅ | 2026-10-02. Puerta por plan (`PlanSpec.integraciones`, 402 `kind: integraciones`) al crear y en cada llamada; interruptor por organización; registro en PLAN-MCP |
| P3 — GitHub | ☐ | |
| P4 — Medir | ☐ | |
