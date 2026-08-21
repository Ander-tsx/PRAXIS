# Plan de implementación — Apartado «Reglas» del proyecto

Complementa a [PLAN-FRONTEND-REGLAS-AUTOMATIZACION.md](PLAN-FRONTEND-REGLAS-AUTOMATIZACION.md),
que fija el alcance de producto. Este documento fija **archivos, decisiones cerradas y orden de
ejecución** contra el estado real del repositorio a 2026-08-19, rama `feature/automation-service`.

No se implementa nada en este documento. Se ejecuta bloque a bloque con `/executing-plans`,
`/automation-development` y `/test-driven-development`; se revisa con `/requesting-code-review` y
`/verification-before-completion`.

---

## 1. Estado real verificado

### 1.1 Lo que el backend ya ofrece

Siete rutas bajo `/projects/:projectId/automations`, todas con `canManageAutomations`
(`gateway/src/automation/project-automations.controller.ts`):

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/automations` | `AutomationRule[]` con `trigger`, `conditions` y `actions` embebidos y ordenados por `position` |
| POST | `/automations` | La regla creada (201) |
| GET | `/automations/:id` | Una regla, 404 si no es del proyecto |
| PATCH | `/automations/:id` | La regla actualizada, con `version` incrementada |
| DELETE | `/automations/:id` | `{ success: true }` |
| POST | `/automations/review` | `{ rules, candidates, succeeded, failed }` |
| GET | `/automations/executions` | Las 20 `RuleExecution` más recientes, con `rule: { name }` |

Todo llega envuelto en `{ success, data, meta }`, como el resto del gateway.

### 1.2 El catálogo real, leído del validador

La fuente de verdad es `services/automation/src/rules/rule-definition.ts`. **No es el enum de
`@praxis/contracts`**: el enum declara `GITHUB_PULL_REQUEST_OPENED`, `MOVE_TASK` y `SEND_EMAIL`,
y el validador los rechaza con «no soportado en el MVP académico». La interfaz debe seguir al
validador, no al enum.

| Trigger | Config admitida | Condiciones | Acción | Destinatario |
|---|---|---|---|---|
| `TASK_DUE_SOON` | `{ leadTimeMinutes }`, entero ≥ 1, **obligatorio** | `priority` (texto), `dueDate` (`YYYY-MM-DD`), `assigneeCount` (entero ≥ 0) | `CREATE_NOTIFICATION` | `ASSIGNEES` |
| `TASK_STALE` | `{ days }`, entero ≥ 1, **opcional** (por defecto 7) | `staleDays` (entero ≥ 0), `overdue` (booleano), `withoutHistory` (booleano) | `CREATE_NOTIFICATION` | `PROJECT_OWNER` |

- Operadores: `EQUALS`, `NOT_EQUALS`, `IN`. `IN` exige una **lista no vacía**; los otros dos, un
  escalar (un array o un objeto da 400).
- `status` desde el cliente solo puede ser `ENABLED` o `DISABLED`. `PAUSED_SYSTEM` e `INVALID`
  existen en el enum pero los pone el sistema; enviarlos da 400.
- Entre 1 y 5 acciones. Cero acciones da 400.
- `hasOnlyKeys` es estricto: una clave de más en `trigger.config` o en `action.config` da 400,
  igual que el `forbidNonWhitelisted: true` del gateway hace con el body.
- `priority` se compara con `===` contra `task.priority`, así que los valores útiles son los
  cuatro de `PRIORITIES` (`LOW`, `MEDIUM`, `HIGH`, `URGENT`). El validador solo exige «texto no
  vacío»: un valor libre **se guarda sin error y no coincide nunca**.

### 1.3 Lo que hay hoy en el frontend

Todo vive incrustado en `projects-front/src/app/(private)/[id]/page.tsx`, líneas 604-751, dentro
de la pestaña `automatizaciones`: un formulario de alta con tres campos, una lista de tarjetas,
un botón de activar/desactivar y un panel de ejecuciones. Más tres acciones en `actions.ts`
(`createAcademicAutomationAction`, `reviewAcademicAutomationsAction`,
`setAcademicAutomationStatusAction`).

Seis cosas que hay que arreglar al mover el apartado, y que son el motivo de varios bloques:

1. **No es un organismo.** Es marcado suelto en la página, con `<input>` y `<select>` a mano en
   vez de los átomos de `commons`. Rompe la convención de Atomic Design de las otras cuatro
   pestañas (`ProjectMembers`, `ProjectRoles`, `WorkspaceCanvas`, `ProjectChat`).
2. **No usa `useAccion`.** Son `<form action={serverAction}>` sin estado: sin `pending`, sin
   error visible y sin confirmación contra el `data` de la respuesta. Un 400 del validador se
   pierde entero — el formulario se queda igual y no dice nada.
3. **No hay condiciones.** `createAcademicAutomationAction` manda `conditions: []` fijo.
4. **No hay editar ni eliminar.**
5. **Lee un campo que no existe.** `AcademicExecution.conditionResult.context.taskTitle`
   (page.tsx:197) es siempre `undefined`: el motor construye `context` solo con los campos de
   condición (`priority`/`dueDate`/`assigneeCount` o `staleDays`/`overdue`/`withoutHistory`).
   El título de la tarea no se persiste en ningún sitio legible. Ver §2, hueco 3.
6. **El mensaje de «sin permiso» tapa la suspensión.** Con el proyecto suspendido,
   `permissions/me` llega recortado a `canViewProject` + `canViewReports`, así que
   `canManageAutomations` es `false` y la pestaña dice «No tienes permiso», que es falso: el
   permiso está, lo que falta es que el proyecto esté activo.

### 1.4 Restricción de verificación

**No existe ningún runner de pruebas unitarias en `apps/frontend`.** Cero archivos `.spec.ts` en
todo el árbol, y ningún `package.json` de zona declara `test`. La única verificación automática
disponible hoy para frontend es Playwright (`e2e/tests/api` y `e2e/tests/ui`) y `tsc`.

Como el Bloque 2 produce justo el tipo de módulo puro que `/test-driven-development` necesita
—traducción de contrato, coerción de valores, validación— el plan **añade Vitest a
`projects-front`** como subtarea del Bloque 2: una dependencia, un `vitest.config.ts` de seis
líneas y un script `test` que `turbo run test` ya recoge (`turbo.json` declara la tarea). Es la
diferencia entre poder hacer TDD sobre las reglas y no poder.

> **Decisión abierta.** Si se prefiere no introducir un runner nuevo, la alternativa es cubrir
> esos módulos solo desde `e2e/tests/ui`, que es más lento, menos preciso y no sirve para el
> ciclo rojo-verde. El plan asume Vitest; cambiar a la alternativa afecta solo a los apartados
> «Pruebas» de los bloques 2, 5 y 6.

---

## 2. Huecos del backend

Detectados desde frontend. **Ninguno bloquea el plan**: los siete bloques se pueden completar sin
tocar backend. Se documentan en `docs/frontend/PENDIENTES-BACKEND-AUTOMATIZACION.md` (Bloque 1,
archivo separado del `PENDIENTES-BACKEND.md` general porque nace de esta sola tarea) y, si en
algún momento se decide cerrarlos, se hará como tarea aparte con `/praxis-backend-development`.

### Hueco 1 — No hay endpoint de catálogo *(severidad: media)*

**Qué falta.** Nada expone qué triggers, campos de condición, operadores, tipos de valor y
acciones admite el validador. Solo existe dentro de `rule-definition.ts`.

**Por qué lo necesita el frontend.** El requisito explícito de esta tarea es que la pantalla no
quede acoplada a los tipos actuales. Sin catálogo servido, el frontend tiene que **duplicar** el
del validador; el día que backend añada un trigger, la interfaz seguirá sin ofrecerlo hasta que
alguien se acuerde de tocar el frontend, y el día que backend **retire** un campo, la interfaz lo
seguirá ofreciendo y el usuario se comerá un 400 sobre un campo que la propia pantalla le ofreció.

**Cambio mínimo.** `GET /projects/:projectId/automations/catalog`, con `canManageAutomations`,
derivado de las mismas constantes de `rule-definition.ts` (no una copia): por cada trigger, su
config, sus campos de condición con tipo y operadores admitidos, y sus acciones con la config
fija. Alternativa aún más barata: mover ese descriptor a `@praxis/contracts` y espejarlo en
`commons/api/domain.ts`, como ya se hace con `LABEL_COLORS` — sin ruta nueva, pero sin evitar del
todo la duplicación.

**Mientras tanto.** El Bloque 2 aísla la duplicación en **un solo archivo de datos**
(`lib/automation-catalog.ts`) con una nota que apunta a `rule-definition.ts`. Cuando el endpoint
exista, se sustituye el módulo por la respuesta y ningún componente cambia.

### Hueco 2 — `PATCH` es reemplazo total, no parcial *(severidad: media)*

**Qué falta.** `UpdateAutomationRuleBodyDto extends CreateAutomationRuleBodyDto`: `name`,
`trigger`, `conditions` y `actions` son obligatorios. No se puede cambiar solo `status`.

**Por qué lo necesita el frontend.** Habilitar y deshabilitar es la operación más frecuente del
apartado y hoy cuesta **dos viajes** (GET + PATCH, ver `setAcademicAutomationStatusAction`), con
tres consecuencias: una carrera de lectura-escritura que puede revertir la edición de otra
persona, un `version` incrementado por un cambio que no tocó la definición, y —lo peor— que una
regla guardada antes de un endurecimiento del validador **no se puede ni desactivar**, porque el
reenvío completo la vuelve a validar y da 400.

**Cambio mínimo.** `PATCH /automations/:id/status` con `{ status: 'ENABLED' | 'DISABLED' }`; o
hacer opcionales los campos de `UpdateAutomationRuleBodyDto` y fusionar contra lo guardado.

**Mientras tanto.** El Bloque 4 conserva el lee-modifica-escribe, pero centralizado en una sola
acción, con el `describe()` de siempre y un mensaje específico para el 400 de revalidación
(«esta regla ya no es válida con el catálogo actual: ábrela y corrígela»).

### Hueco 3 — Una ejecución no dice sobre qué tarea fue *(severidad: media)*

**Qué falta.** `RuleExecution` guarda `conditionResult: { matched, context }` y `causeKey`. El
`context` solo trae los campos de condición; el `causeKey` lleva el `taskId` incrustado en una
cadena (`manual:<version>:<taskId>:<huella>`) que no está pensada para leerse. `taskTitle` no se
persiste en ninguna parte.

**Por qué lo necesita el frontend.** La auditoría es el único sitio donde se demuestra que la
automatización hizo algo. «Regla X · SUCCEEDED · hace 2 min» no permite comprobar nada; «Regla X
avisó sobre *Preparar la exposición*» sí. Además, hoy la página ya intenta leer ese título y
recibe `undefined`.

**Cambio mínimo.** Añadir `taskId` y `taskTitle` a lo que persiste `direct-execution.ts` —el
candidato ya los tiene en memoria (`Candidate.taskId`, `Candidate.taskTitle`)— dentro de
`conditionResult` o en columnas propias.

**Mientras tanto.** El Bloque 6 muestra regla, estado, motivo legible y momento, y **borra** la
lectura de `taskTitle` en vez de dejar un campo que nunca se rellena.

### Hueco 4 — El resumen de la revisión no distingue por qué no pasó nada *(severidad: baja)*

**Qué falta.** `reviewProject` devuelve `{ rules, candidates, succeeded, failed }`. Las
ejecuciones `SKIPPED` (condiciones no cumplidas) y las descartadas por idempotencia (`causeKey`
ya visto, `continue` sin crear fila) no se cuentan.

**Por qué lo necesita el frontend.** «5 candidatas, 0 avisos» tiene dos causas opuestas —las
condiciones no se cumplen, o ya se avisó antes— y el usuario necesita saber cuál para creerse la
demo. Con lo que hay, el frontend solo puede decir «5 candidatas, 0 avisos» y callarse.

**Cambio mínimo.** Añadir `skipped` y `deduped` al objeto de retorno; ambos ya existen como
ramas del bucle.

**Mientras tanto.** El Bloque 6 enseña los cuatro números que hay y **no inventa** la
interpretación; el detalle de por qué se omitió cada una se lee en la lista de ejecuciones, donde
`SKIPPED` sí aparece por fila.

### Hueco 5 — Cada ejecución arrastra un volcado completo de la regla *(severidad: baja)*

`ruleSnapshot` guarda la regla entera y `recent()` la devuelve. Son 20 volcados en cada carga de
la pestaña, y el frontend no usa ninguno. Cambio mínimo: excluir `ruleSnapshot` del `select` de
`recent()`. Mientras tanto: no es bloqueante, solo peso.

---

## 3. Decisiones cerradas

Se toman aquí para que ningún bloque las vuelva a abrir.

### D1 — La pestaña se llama «Reglas» y conserva el enlace viejo

`TABS` pasa de `{ id: 'automatizaciones', label: 'Automatizaciones' }` a
`{ id: 'reglas', label: 'Reglas' }`. La resolución de `activeTab` acepta `automatizaciones` como
alias y lo trata como `reglas`, para que un enlace compartido siga aterrizando donde debe. Son
tres líneas y evita romper marcadores.

### D2 — El catálogo es **datos**, no ramas de JSX

Un módulo `lib/automation-catalog.ts` describe cada trigger: etiqueta, explicación, campos de
config, campos de condición con su tipo y operadores, y acciones admitidas. Los componentes
**recorren** ese catálogo. Añadir un trigger nuevo = una entrada en el array. Añadir un tipo de
valor nuevo (`kind`) = una rama en un único componente, `ValueField`.

Esa es toda la abstracción: un catálogo y un renderizador por tipo de valor. **No** se construye
un motor de formularios genérico, ni un editor de nodos, ni un sistema de plugins — el MVP tiene
dos triggers y una acción, y el requisito es que crecer sea localizado, no que la pantalla se
autogenere desde un esquema arbitrario.

```
lib/automation-catalog.ts        ← se toca al añadir trigger / condición / acción
components/…/ValueField.tsx      ← se toca solo al añadir un TIPO de valor nuevo
resto de componentes             ← no se tocan
```

### D3 — La forma del `kind` de valor

```
'enum'    → Select con opciones del catálogo   (priority)
'integer' → Input type=number con min/max      (assigneeCount, staleDays, leadTimeMinutes, days)
'date'    → SelectorDeFecha, emite YYYY-MM-DD  (dueDate)
'boolean' → Select «Sí» / «No», nunca Checkbox (overdue, withoutHistory)
```

**Booleano como `Select` y no como `Checkbox` a propósito.** Un checkbox sin marcar **no se envía
en el `FormData`**, y como las condiciones viajan en arrays paralelos (D4), una fila que no emita
su valor desplaza todas las siguientes: la condición 2 se guardaría con el operador de la 3. Eso
no da error de tipos, no da 400 y produce una regla plausible y equivocada. Un `Select` siempre
emite.

### D4 — Las condiciones viajan en arrays paralelos de `FormData`

La convención de la zona es `FormData` plano con `getAll` (`readPermissions`, `assigneeIds`,
`labelIds`), no JSON en un campo oculto. Se mantiene:

```
conditionField[]     conditionOperator[]     conditionValue[]
```

Con dos invariantes que el componente debe garantizar y una prueba debe fijar:

1. **Cada fila emite exactamente un input por cada uno de los tres nombres**, siempre, aunque
   esté vacío. Es lo que mantiene alineados los tres `getAll`.
2. **`conditionValue` lleva siempre una sola cadena.** Para `IN`, esa cadena es un array JSON
   (`["HIGH","URGENT"]`) que produce el cliente y parsea `coerceConditionValue` en el servidor. Un
   `<select multiple>` emitiría N valores bajo un nombre y rompería la invariante 1.

Las acciones viajan como `actionType[]`. Su `config` **no se envía**: hoy `recipientSelector`
está determinado por el trigger, así que el servidor lo deriva del catálogo. Mandarlo desde el
cliente sería dejar que el navegador elija un campo que el validador ya tiene decidido.

### D5 — El estado del formulario vive en el cliente; el contrato, en un módulo puro

El diálogo mantiene un `RuleDraft` en `useState`. Al enviar, el `FormData` se serializa según D4;
en la Server Action, `bodyFromDraft()` construye el body **exacto** del DTO. Ese módulo es el
único sitio del frontend que conoce la forma del contrato, y es lo que se prueba en unitarias.

### D6 — Se valida en cliente y se confirma contra el `data`

`validateAutomationDraft()` reproduce las reglas de `rule-definition.ts` para dar el mensaje antes
y sobre el campo. La Server Action valida otra vez —el `FormData` no es de fiar— y **confirma
contra el `data` de la respuesta**, no contra el status: que exista `id` y que `name` y
`trigger.type` sean los que se pidieron.

### D7 — La lista de acciones es lista, pero hoy no ofrece «añadir»

El modelo admite hasta 5 acciones y el borrador las guarda como array. Pero con el catálogo
actual **solo hay una acción posible y su único campo lo fija el trigger**, así que dos acciones
en una regla son dos avisos idénticos a las mismas personas. El botón «Añadir acción» se renderiza
solo cuando el catálogo ofrece más de una variante para el trigger elegido; hoy no aparece, y la
sección explica en una línea a quién avisará y por qué no se elige.

Es la lectura honesta del requisito «una o más acciones»: la estructura soporta N, la interfaz no
promete algo que hoy solo produciría ruido duplicado. El día que entre una acción nueva al
catálogo, el botón aparece solo.

### D8 — Suspensión y permiso son mensajes distintos

`canManageAutomations === false` con `effective.projectStatus === 'SUSPENDED'` → mensaje de
suspensión con `suspendedReason`, reutilizando `SuspendedProjectNotice`. Sin suspensión → mensaje
de permiso. Y en las escrituras, un `ApiError` con `code === PROJECT_SUSPENDED_CODE` se distingue
de un `FORBIDDEN` normal: uno se arregla pidiendo permiso, el otro hay que esperarlo.

### D9 — Avisos de regla que no puede coincidir

`assigneeCount EQUALS 0` con `TASK_DUE_SOON` **nunca dispara**: `dueSoonCandidates` descarta las
tareas sin encargados antes de evaluar. El validador lo acepta y la regla se guarda tan feliz. El
formulario lo advierte —aviso, no bloqueo— porque es exactamente el tipo de regla que se crea en
una demo y no hace nada sin decir por qué. El catálogo declara estos avisos por trigger, así que
añadir otro es una línea de datos.

---

## 4. Archivos

```
apps/frontend/commons/api/domain.ts                    (M) tipos espejo del contrato
apps/frontend/projects-front/
├─ package.json                                        (M) vitest + script test
├─ vitest.config.ts                                    (N)
├─ src/lib/
│  ├─ automation-catalog.ts                            (N) el catálogo — D2
│  ├─ automation-catalog.spec.ts                       (N)
│  ├─ automation-draft.ts                              (N) draft ⇄ DTO, coerción, resumen
│  ├─ automation-draft.spec.ts                         (N)
│  ├─ validation.ts                                    (M) + validateAutomationDraft
│  ├─ validation.spec.ts                               (N)
│  └─ action-state.ts                                  (M) + AutomationRuleState, ReviewState
├─ src/app/(private)/[id]/
│  ├─ actions.ts                                       (M) 4 acciones nuevas, 3 viejas fuera
│  └─ page.tsx                                         (M) pestaña «Reglas» → organismo
└─ src/components/organisms/ProjectRules/
   ├─ ProjectRules.tsx        (N) servidor: cabecera, lista, vacío, permiso, suspensión
   ├─ RuleCard.tsx            (N) servidor: resumen legible + controles
   ├─ RuleDialog.tsx          (N) cliente: constructor guiado
   ├─ TriggerSection.tsx      (N) cliente
   ├─ ConditionsSection.tsx   (N) cliente
   ├─ ActionsSection.tsx      (N) cliente
   ├─ ValueField.tsx          (N) cliente: renderizador por `kind` — D3
   ├─ RuleStatusToggle.tsx    (N) cliente
   ├─ DeleteRuleButton.tsx    (N) cliente
   ├─ RuleExecutions.tsx      (N) servidor: «Revisar ahora» + auditoría
   └─ index.ts                (N)
e2e/tests/ui/07-reglas.spec.ts                         (N)
e2e/tests/api/17-automatizaciones.spec.ts   (M) casos de validación
docs/frontend/PENDIENTES-BACKEND-AUTOMATIZACION.md     (N) los 5 huecos de §2
docs/frontend/CONTRATO-API.md                          (M) catálogo exacto y trampas
docs/frontend/ESTADO-ACTUAL.md                         (M) sección del apartado
```

Nada sube a `commons/organisms/`: solo `projects-front` usa Reglas. Los **tipos** sí van a
`commons/api/domain.ts`, que es donde vive el espejo del contrato completo.

---

## 5. Bloques

---

### Bloque 1 — Contrato verificado y huecos documentados

*Tamaño: pequeño. Sin código de producto.*

**Objetivo.** Que los seis bloques siguientes se construyan sobre comportamiento comprobado y no
sobre la lectura del código, y dejar los huecos de §2 donde el equipo de backend los va a ver.

**Áreas afectadas.** `docs/frontend/PENDIENTES-BACKEND-AUTOMATIZACION.md`,
`docs/frontend/CONTRATO-API.md` §Automatizaciones, `e2e/tests/api/15-…spec.ts`.

**Implementación.**
1. Levantar el stack y ejercitar las siete rutas contra un proyecto sembrado, anotando la forma
   real de cada respuesta (una regla con condiciones, una ejecución `SUCCEEDED`, una `SKIPPED`).
2. Comprobar los rechazos que la interfaz va a tener que evitar: clave de más en
   `trigger.config`, `recipientSelector` cruzado con el trigger, `IN` con escalar, `EQUALS` con
   array, `status: 'INVALID'`, cero acciones, seis acciones, campo de condición del otro trigger.
3. Añadir a `17-automatizaciones.spec.ts` los casos de rechazo que hoy no cubre. Fijan
   el contrato que el catálogo del Bloque 2 copia: si backend lo cambia, salta aquí y no en la UI.
4. Escribir los cinco huecos en `PENDIENTES-BACKEND-AUTOMATIZACION.md`, archivo aparte del
   `PENDIENTES-BACKEND.md` general, con el mismo formato del documento (qué falta, por qué,
   cambio mínimo, severidad, reproducción).
5. Ampliar `CONTRATO-API.md` §Automatizaciones con la tabla exacta de §1.2 y las trampas: el enum
   más ancho que el validador, `hasOnlyKeys`, `PATCH` como reemplazo total, `days` opcional con
   defecto 7.

**Dependencias.** Ninguna.

**Pruebas.** `pnpm e2e:api --grep automatiz` en verde, incluidos los casos nuevos.

**Criterios de finalización.** Los casos de rechazo pasan; la tabla del contrato coincide con lo
observado; los cinco huecos están escritos con reproducción.

**Fuera de alcance.** Cualquier cambio en `apps/backend/`. Los huecos se documentan, no se cierran.

---

### Bloque 2 — Tipos, catálogo y traducción del contrato

*Tamaño: mediano. Sin interfaz.*

**Objetivo.** Concentrar en módulos puros y probados todo lo que sabe del contrato: qué opciones
existen, cómo se traduce un borrador a body y al revés, qué es válido y cómo se lee una regla en
español. Es la pieza que hace que el resto sea extensible.

**Áreas afectadas.** `commons/api/domain.ts`, `projects-front/src/lib/*`,
`projects-front/package.json`, `vitest.config.ts`.

**Implementación.**
1. **Runner.** Vitest en `projects-front`, `vitest.config.ts` mínimo, script `test`. Ver §1.4.
2. **Tipos** en `commons/api/domain.ts`, espejo del contrato con la nota de rigor:
   `AutomationRule`, `AutomationTrigger`, `AutomationCondition`, `AutomationAction`,
   `AutomationRuleStatus`, `AutomationExecution`, `AutomationExecutionStatus`,
   `AutomationReviewSummary`. Junto a los `AUTOMATION_*` de notificaciones que ya están ahí.
3. **`lib/automation-catalog.ts`** — D2. Un array de `TriggerSpec`, cada uno con etiqueta,
   explicación, campos de config, campos de condición (`field`, etiqueta, `kind`, operadores
   admitidos, ayuda), acciones admitidas con su config fija, y los avisos de D9. Encabezado que
   apunte a `rule-definition.ts` y al hueco 1.
4. **`lib/automation-draft.ts`**:
   - `emptyDraft(triggerType)` — borrador con los valores por defecto del catálogo.
   - `draftFromRule(rule)` — quita `id`, `ruleId` y `position`, que el DTO no acepta.
   - `bodyFromDraft(draft)` — el body exacto: solo campos declarados, `description` solo si tiene
     contenido, `action.config` derivada del catálogo (D4).
   - `coerceConditionValue(field, operator, raw)` — cadena → entero, booleano, fecha o lista,
     según el `kind`.
   - `describeRule(rule)` — «Cuando una tarea vence en menos de 24 h, si la prioridad es Alta,
     avisa a los responsables». Es lo que pinta la tarjeta del Bloque 3.
5. **`lib/validation.ts`** — `validateAutomationDraft(draft)`, mismo estilo que `validateRole`:
   devuelve el primer mensaje por campo o `null`.

**Dependencias.** Bloque 1 (los casos de rechazo son la especificación de lo que se valida).

**Pruebas.** TDD sobre los cuatro módulos, ejecutando `pnpm --filter @praxis/projects-front test`:
- `bodyFromDraft` no emite ninguna clave que el DTO no declare, para los dos triggers.
- `draftFromRule(regla del GET)` → `bodyFromDraft` → cuerpo aceptable (ida y vuelta sin pérdida).
- `coerceConditionValue` con los seis campos y los tres operadores, incluidos `IN` con lista de un
  elemento y el rechazo de `IN` con escalar.
- `validateAutomationDraft` rechaza cada caso de rechazo del Bloque 1 **con el mismo criterio que
  el backend** — es la prueba que evita que la UI ofrezca algo que dará 400.
- `describeRule` con las dos reglas de referencia y con una sin condiciones.

**Criterios de finalización.** `pnpm --filter @praxis/projects-front test` en verde; `tsc` limpio;
ningún componente importado (los módulos no dependen de React).

**Fuera de alcance.** Componentes, acciones y pantalla. Nada de esto se ve todavía.

---

### Bloque 3 — Apartado «Reglas»: listado, vacío, permiso y suspensión

*Tamaño: mediano.*

**Objetivo.** Que la pestaña exista con su nombre, cargue las reglas y las explique en español,
con sus estados de vacío, permiso y suspensión bien diferenciados — y sin perder ninguna
capacidad de las que hay hoy.

**Áreas afectadas.** `page.tsx`, `components/organisms/ProjectRules/{ProjectRules,RuleCard,index}`.

**Implementación.**
1. `TABS`: «Reglas» con alias del id viejo (D1). El contador sigue siendo el número de reglas.
2. `ProjectRules` (Server Component) recibe `projectId`, `rules`, `canManage`, `isSuspended`,
   `suspendedReason`. Cabecera con título, explicación de una línea y el disparador de creación
   (Bloque 5; en este bloque, el formulario que ya existe, movido tal cual).
3. `RuleCard`: nombre, `Badge` de estado, resumen de `describeRule()` y hueco para los controles
   del Bloque 4. Un `<ul>`/`<li>` como `ProjectRoles`, no `<article>` sueltos.
4. Estado vacío con la frase que enseña qué es una regla, no solo «no hay nada».
5. D8: suspensión con `SuspendedProjectNotice`, permiso con su propio mensaje.
6. La carga sigue en `page.tsx` (la lógica de negocio vive en las pages), condicionada a la
   pestaña activa como ahora, y con `.catch(() => [])` para que un fallo del servicio de
   automatización no se lleve por delante el proyecto entero.
7. **Migrar, no borrar**: el formulario de alta actual y sus acciones se mueven dentro del
   organismo sin cambios funcionales. Este bloque no puede dejar la aplicación con menos
   capacidades de las que tenía.

**Dependencias.** Bloque 2 (`describeRule`, tipos).

**Pruebas.** `e2e/tests/ui/07-reglas.spec.ts`, primeros casos: la pestaña se llama «Reglas»;
`?tab=automatizaciones` sigue aterrizando en ella; con reglas sembradas se ve el nombre y el
resumen; sin reglas se ve el vacío; sin `canManageAutomations` se ve el mensaje de permiso; con
el proyecto suspendido se ve el de suspensión y **no** el de permiso.

**Criterios de finalización.** Los seis casos en verde; `page.tsx` sin marcado de reglas;
`pnpm e2e:regresion` sin regresiones.

**Fuera de alcance.** Crear, editar, eliminar y el panel de ejecuciones (siguen como están).

---

### Bloque 4 — Habilitar, deshabilitar y eliminar

*Tamaño: pequeño.*

**Objetivo.** Cerrar las dos operaciones de ciclo de vida que no necesitan constructor, con
espera, confirmación y errores visibles — que es justo lo que hoy no tienen.

**Áreas afectadas.** `actions.ts`, `action-state.ts`, `RuleStatusToggle`, `DeleteRuleButton`,
`RuleCard`.

**Implementación.**
1. `AutomationRuleState { error, done }` en `action-state.ts`.
2. `toggleAutomationRuleAction(prev, formData)`: lee la regla, reenvía la definición completa con
   el `status` cambiado (hueco 2), confirma contra `data.status` y revalida. Mensaje propio para
   el 400 de revalidación y para `PROJECT_SUSPENDED_CODE`, vía `describe()`.
3. `deleteAutomationRuleAction`: `DELETE`, confirma, revalida.
4. `RuleStatusToggle` con `useAccion`, `isLoading` en el botón y el error `role="alert"`.
5. `DeleteRuleButton` calcado de `DeleteRoleButton`: `Dialog` de confirmación, `variant="danger"`,
   «no se puede deshacer», cierre al confirmar.
6. Ambos solo se renderizan con `canManage`.

**Dependencias.** Bloque 3.

**Pruebas.** UI: activar refleja «Activa» tras el refresco; desactivar vuelve; eliminar pide
confirmación, y al cancelar la regla sigue ahí; al confirmar desaparece. API: la regla queda con
el `status` correcto y con sus condiciones intactas tras el toggle — la prueba que destaparía que
el lee-modifica-escribe se dejó algo por el camino.

**Criterios de finalización.** Casos en verde; ningún botón se queda girando; un 403 se ve.

**Fuera de alcance.** Crear y editar.

---

### Bloque 5 — Constructor guiado: crear y editar

*Tamaño: mediano-grande. Es el bloque central.*

**Objetivo.** Definir una regla completa —trigger, condiciones, acciones— sin conocer un solo
identificador técnico, con validación antes de enviar, y con el diálogo recorriendo el catálogo en
vez de ramificando por tipo.

**Áreas afectadas.** `RuleDialog`, `TriggerSection`, `ConditionsSection`, `ActionsSection`,
`ValueField`, `actions.ts`, `ProjectRules`, `RuleCard`.

**Implementación.**
1. `saveAutomationRuleAction(prev, formData)`: reconstruye el borrador desde los arrays paralelos
   (D4), lo valida con `validateAutomationDraft`, arma el body con `bodyFromDraft`, hace `POST` o
   `PATCH` según venga `ruleId`, **confirma contra el `data`** (D6) y revalida. Los mensajes de
   `error.validationErrors` se muestran tal cual cuando llegan: el gateway ya señala el campo.
2. `RuleDialog` (cliente): `Dialog` `size="lg"`, `useAccion`, borrador en `useState`, cierre al
   confirmar, `noValidate` y `preventDefault` si hay error de cliente — el patrón exacto de
   `RoleDialog`. Sirve para crear y para editar; con `rule` precarga vía `draftFromRule`.
3. Tres secciones con el lenguaje **Cuando / Si / Entonces**, cada una un `<fieldset>` con su
   `<legend>`:
   - **Cuando**: `Select` de trigger recorriendo el catálogo, y debajo sus campos de config
     renderizados con `ValueField`. Cambiar de trigger **descarta condiciones y acciones** —son de
     otro catálogo y darían 400— avisando antes en vez de perderlas en silencio.
   - **Si**: filas `campo · operador · valor`, con «Añadir condición» y quitar por fila. Los
     campos y operadores salen del trigger elegido. La sección dice explícitamente que **se
     cumplen todas**, que es lo que significa `AND` y lo que nadie adivina. Sin condiciones, la
     regla se aplica a toda candidata, y se dice.
   - **Entonces**: la acción con su destinatario derivado del trigger y explicado; «Añadir acción»
     según D7.
4. `ValueField`: un `switch` sobre `kind` (D3). **Único punto de extensión para tipos nuevos.**
5. Avisos de D9 bajo la sección correspondiente, en tono de aviso y sin bloquear el envío.
6. El botón «Nueva regla» de la cabecera y «Editar» en cada tarjeta abren el mismo diálogo.
7. Se retiran `createAcademicAutomationAction` y el formulario provisional del Bloque 3.

**Dependencias.** Bloques 2, 3 y 4.

**Pruebas.**
- Unitarias (ya en el Bloque 2) sobre el borrador y la validación; aquí se añade la reconstrucción
  desde `FormData`, con el caso que fija la invariante de D4: **tres condiciones, la del medio
  booleana con valor «No», y las tres se guardan en su fila**.
- UI: crear una `TASK_DUE_SOON` con condición de prioridad y verla en la lista con su resumen;
  editarla y ver el cambio; cambiar de trigger avisa y limpia; dejar el nombre vacío marca el
  campo y no envía; un 400 del servidor se ve dentro del diálogo sin cerrarlo ni perder lo escrito.
- API: la regla creada desde la UI tiene exactamente la forma que espera `rule-definition.ts`.

**Criterios de finalización.** Se crean y editan los dos tipos de regla; ninguna combinación
ofrecida por la interfaz produce un 400; nada se pierde al fallar el envío; `describeRule` de la
tarjeta coincide con lo definido.

**Fuera de alcance.** `OR`, grupos anidados, plantillas de regla, duplicar una regla, reordenar
acciones por arrastre.

---

### Bloque 6 — Revisión manual y auditoría

*Tamaño: pequeño-mediano.*

**Objetivo.** Que «Revisar ahora» diga qué hizo y que la lista de ejecuciones permita comprobarlo
— sin prometer observabilidad que no existe.

**Áreas afectadas.** `RuleExecutions`, `actions.ts`, `action-state.ts`, `page.tsx`.

**Implementación.**
1. `reviewAutomationsAction` devuelve el resumen en el estado en vez de descartarlo, y `ReviewState`
   lo transporta. La UI lo dice en una frase: «3 reglas revisadas · 5 candidatas · 2 avisos · 0
   fallos». Sin `skipped` ni `deduped`, que no vienen (hueco 4), y **sin inventarlos**.
2. `RuleExecutions`: por fila, nombre de regla, `Badge` por estado con etiqueta en español
   (`SUCCEEDED` «Avisó», `SKIPPED` «No cumplía las condiciones», `FAILED` «Falló», `RUNNING` «En
   curso»), y la hora en formato local.
3. Se retira la lectura de `conditionResult.context.taskTitle` (hueco 3) y en su lugar se resume
   el `context` con las etiquetas del catálogo: «prioridad Alta, vence 2026-08-21». Es información
   que sí existe y que identifica la evaluación.
4. Vacío propio: «Aún no se ha revisado nada» + qué hace el botón.
5. Una línea explicando que la revisión es manual a propósito, para que nadie espere un cron.
6. Un `FAILED` muestra el mensaje de `actionResults[].error.message`, truncado.

**Dependencias.** Bloque 3.

**Pruebas.** UI: con una regla habilitada y una tarea candidata, «Revisar ahora» muestra el
resumen y aparece una ejecución; **una segunda revisión no crea otra** (idempotencia visible);
una regla cuyas condiciones no se cumplen deja una fila «No cumplía las condiciones». API: el
`grep automatiz` sigue verde.

**Criterios de finalización.** Los tres casos en verde; ningún campo pintado que el backend no
mande; el botón muestra su espera.

**Fuera de alcance.** Reintento manual, replay, filtrar por regla, paginar, exportar, métricas.

---

### Bloque 7 — Pulido, accesibilidad y documentación viva

*Tamaño: mediano.*

**Objetivo.** Dejar el apartado presentable y dejado por escrito.

**Áreas afectadas.** Todos los componentes del apartado, `ESTADO-ACTUAL.md`, `CONTRATO-API.md`.

**Implementación.**
1. Recorrido completo con teclado: foco visible, `Dialog` con foco atrapado y `Esc`, orden lógico
   entre secciones, `aria-label` en la sección y `role="alert"` en cada error.
2. Tema claro y oscuro con los tokens de `theme.css`; ningún color a mano. Repasar que las
   utilidades usadas se generan (el aviso de `@source` de CLAUDE.md).
3. Responsive: móvil, tableta y escritorio. Las filas de condición pasan a apiladas en estrecho.
4. Cerrar el diálogo con cambios sin guardar pide confirmación.
5. `useRefrescoAgrupado` donde haya que refrescar fuera de una Server Action.
6. Repaso de prosa: todo lo que ve el usuario en español, sin identificadores técnicos crudos.
7. `ESTADO-ACTUAL.md`: sección nueva con el mapa del apartado, el catálogo, la decisión del
   catálogo-como-datos y las trampas de D3/D4. `CONTRATO-API.md`: cerrar lo que quedara del
   Bloque 1.
8. Guion breve de demostración: qué sembrar, qué pulsar, qué debe verse.

**Dependencias.** Bloques 3 a 6.

**Pruebas.** `pnpm e2e:regresion` completo, `pnpm --filter @praxis/projects-front test`,
`pnpm format:check`, `tsc` de la zona. Repaso manual de teclado y de los dos temas.

**Criterios de finalización.** Todo lo anterior en verde y la documentación actualizada. Se cierra
con `/requesting-code-review` y `/verification-before-completion`.

**Fuera de alcance.** Rediseño visual del resto de la página de proyecto.

---

## 6. Mapa de dependencias

```
Bloque 1 ─ contrato verificado + huecos documentados
   │
   └─► Bloque 2 ─ tipos, catálogo, borrador, validación   (módulos puros + Vitest)
          │
          └─► Bloque 3 ─ pestaña «Reglas»: listado, vacío, permiso, suspensión
                 │
                 ├─► Bloque 4 ─ habilitar / deshabilitar / eliminar
                 │      │
                 │      └─► Bloque 5 ─ constructor guiado: crear y editar
                 │             │
                 ├─► Bloque 6 ─ revisión manual y auditoría   (independiente del 4 y del 5)
                 │             │
                 └─────────────┴─► Bloque 7 ─ pulido, accesibilidad y documentación
```

| Bloque | Depende de | Habilita | Se puede revisar solo |
|---|---|---|---|
| 1 | — | 2 | Sí |
| 2 | 1 | 3 | Sí (unitarias, sin UI) |
| 3 | 2 | 4, 6 | Sí |
| 4 | 3 | 5 | Sí |
| 5 | 2, 3, 4 | 7 | Sí |
| 6 | 3 | 7 | Sí |
| 7 | 3, 4, 5, 6 | — | Sí |

**4 y 6 son paralelizables** si trabajan dos personas: tocan archivos distintos y ambos solo
dependen del 3. El 5 necesita el 4 porque reutiliza el estado y los mensajes de error de las
acciones de ciclo de vida.

**Ningún bloque deja la aplicación peor que antes.** El 3 mueve el formulario provisional en vez
de borrarlo, y el 5 solo lo retira cuando el constructor ya funciona.
