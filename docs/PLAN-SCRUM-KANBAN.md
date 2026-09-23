# Plan Scrum + Kanban — multi-metodología

> Etapa **abierta**, arrancada el 2026-09-22. Rama `feature/scrum-kanban`.
>
> Nace de una necesidad propia del dueño del producto: tiene un proyecto real
> donde su equipo trabaja con Scrum + Kanban a la vez, y Praxis hoy solo tiene
> Kanban — con un tablero *llamado* "Sprint de Lanzamiento" que no es más que
> un nombre puesto a columnas corrientes.
>
> 📍 Vive en `docs/` y no en `docs/frontend/`: **toca el backend**, por la
> misma excepción acordada que [PLAN-ORGANIZACION-ACTIVA.md](PLAN-ORGANIZACION-ACTIVA.md)
> y [PLAN-ASIENTOS-CONGELADOS.md](PLAN-ASIENTOS-CONGELADOS.md). El equipo de
> frontend lo trabaja directo, sin pasar por
> [PENDIENTES-BACKEND.md](frontend/PENDIENTES-BACKEND.md).
>
> **Este documento se sigue estrictamente en sesiones futuras.** Si una sesión
> nueva retoma esta feature, empieza leyendo este archivo entero antes de tocar
> código — es la fuente de verdad de qué se decidió y por qué, no la memoria de
> la conversación que lo originó.

---

## El encargo, en una frase

Volver Praxis multi-metodología, empezando por hacer que Scrum + Kanban
convivan de verdad en un mismo tablero — sin romper ni un tablero existente, y
dejando el sitio abierto para que una metodología futura (Waterfall, listas
simples, lo que sea) se enchufe sin rehacer esto.

---

## La aclaración conceptual que corrige el planteamiento inicial

La primera versión de este plan proponía `Board.method: 'KANBAN' | 'SCRUM'`
como un enum excluyente — cada tablero elige uno de los dos. **Está mal
planteado, y se corrige aquí antes de que nadie lo implemente así.**

Kanban es el hecho de tener columnas de estado. Scrum es organizar el trabajo
en bloques de tiempo (sprints) con una meta y una fecha de cierre. Son dos ejes
independientes, no dos alternativas: un tablero Scrum de verdad **sigue
teniendo columnas** — To Do, Doing, Review, Done — porque si no las tuviera no
sería un tablero, sería una lista. Lo que un equipo Scrum+Kanban hace es
agrupar esas mismas columnas dentro de una ventana de tiempo, y eso es
exactamente lo que ya practica el dueño del producto con su equipo.

**Por eso `Board.method` se descarta y se reemplaza por `Board.scrumEnabled:
boolean`** (ver D1). Ningún tablero deja de ser Kanban nunca; algunos, además,
tienen Scrum encendido.

---

## Qué hay hoy, verificado en código y en producción (2026-09-22)

- `Project → Workspace → Board → Column → Task`. Un proyecto tiene varios
  tableros; cada tablero es Kanban con columnas fijas por defecto (To Do,
  Doing, Review, Done) más las que se le añadan.
- Los tableros ya tienen pestañas de vista: **Kanban / Calendario / Tabla**.
  Este plan añade **Backlog** y **Sprint** al mismo lugar, condicionadas a
  `sprintsEnabled`.
- `Task` tiene: título, descripción, prioridad (Baja/Media/Alta/Urgente),
  fecha límite, etiquetas, encargados, checklist, notas, adjuntos PDF. **No**
  tiene estimación — eso sí falta y lo trae D4.
- ⚠️ **Corrección sobre la primera lectura de este plan (2026-09-22): dos
  cosas que se creían pendientes ya estaban resueltas en el código**, y era
  `PENDIENTES-BACKEND.md` el que estaba desactualizado, no el backend:
  - **`Task.order` ya existe** desde el `init` de tasks-service, `MoveTaskDto`
    lo acepta, y el frontend ya reordena arrastrando dentro de una columna
    (`BoardColumns.tsx`, con renumeración de las tareas intermedias). D5 se
    reescribe para **reusar `order`**, no para crear un `Task.position` nuevo.
  - **`Task.completedAt` ya existe** desde la migración
    `20260730182029_historial_de_tareas`, y tasks-service ya lo escribe al
    entrar a una columna de cierre. Solo faltaba en el tipo `Task` del
    frontend y en `BoardCalendar.tsx` — corregido ya, fuera de fases (ver
    Registro). `PENDIENTES-BACKEND.md §27` queda cerrado.
- **No existe ninguna entidad de sprint, backlog separado, estimación,
  velocidad ni burndown** en ningún microservicio. `grep` de
  sprint/scrum/backlog/velocity/burndown/story point/standup/retro contra
  todo el repo no devuelve nada salvo "Scrum Master" como *nombre libre* de
  rol de proyecto en `permissions.md` — sin lógica asociada. Esta parte del
  diagnóstico original sí era correcta.
- Los permisos de proyecto son un diccionario de booleanos con jerarquía
  implícita (`canEditX` implica `canCreateX`, etc.), y los permisos nuevos se
  han ido añadiendo acotados (`canComment`, `canManageLabels`) en vez de
  reusar uno más ancho. Este plan sigue el mismo patrón para `canManageSprint`
  (D7).
- Los 7 agregados de Análisis filtran por `boardId`, `assigneeId`, `labelId`,
  `priority`, `from`/`to` — y **la clave de caché de Redis debe incluir cada
  filtro nuevo**, o quien filtra hereda el gráfico de quien no filtra
  (`CLAUDE.md`, trampa de Análisis §1). `sprintId` como filtro futuro (D9)
  hereda esta obligación.
- El asistente PRAX **propone, nunca ejecuta** (`CLAUDE.md`). Cualquier
  sugerencia de capacidad que este plan le añada respeta esa regla sin
  excepción.

---

## Las decisiones

### D1 — Todo tablero es Kanban. Scrum es una capa que se enciende, no un modo alterno

`Board.scrumEnabled: boolean`, default `false`. No hay `Board.method`. Las
columnas existen siempre, se comporten igual esté Scrum encendido o no.
Editable en cualquier momento del tablero, no solo al crearlo: apagarlo no
borra nada (invariante 3), así que fijarlo para siempre no daría ninguna
seguridad extra y sí le quitaría margen a un equipo que quiere probar.

**Por qué el nombre es "Scrum" y no "Sprints".** El interruptor no prende un
campo suelto: prende el paquete completo (sprint + backlog + burndown +
velocidad), y "Scrum" es el término que ya reconoce quien lo va a usar. Es el
mismo recorte que hace Jira al llamar "Scrum" a su tipo de tablero con
sprints, sin exigir roles ni ceremonias tampoco allá.

**Por qué editable siempre y no solo al crear.** Con el diseño de D2 y D3, el
backlog y los sprints ya son seguros de esconder y volver a mostrar: apagar
Scrum solo oculta las pestañas Backlog/Sprint y bloquea iniciar uno nuevo,
nunca borra ni mueve una tarea. Fijarlo al crear el tablero sería más simple
de explicar, pero más caro para el equipo: hoy no hay forma de mover tareas
entre tableros, así que un tablero mal elegido obligaría a recrearlo a mano.

### D2 — El backlog es "lo que no tiene sprint", dentro del mismo tablero

No hay una entidad `Backlog` aparte. `Task.sprintId = null` **es** el backlog
de ese tablero. La pestaña "Backlog" es una vista filtrada, no un espacio de
datos distinto.

**Por qué.** Mover una tarea del backlog a un sprint es entonces una sola
escritura (`sprintId`), no un movimiento entre dos colecciones. Y una tarea
nunca queda "huérfana": si se cierra un sprint sin decidir qué hacer con ella
(D6), sigue siendo una tarea del tablero, solo que sin sprint.

### D3 — Como mucho un sprint `ACTIVE` por tablero

`Sprint.status: PLANNED | ACTIVE | CLOSED`. El backend rechaza iniciar un
segundo sprint mientras haya uno activo en el mismo tablero.

**Por qué.** Es la definición de sprint: un bloque de tiempo, no varios
compitiendo. Sin este límite, "Sprint" pasaría a significar "otra etiqueta
más", que es justo el problema que tiene hoy el tablero llamado "Sprint de
Lanzamiento".

### D4 — La estimación es un campo genérico, sin escala impuesta

`Task.estimatePoints: Int?`, nullable, sin validar contra Fibonacci ni ninguna
otra escala. Un tablero Kanban puro puede usarlo como "talla" sin tener
sprints encendidos; no le estorba a nadie.

**Por qué.** Imponer una escala es una decisión de proceso de cada equipo, no
del producto. Lo único que Praxis necesita del campo es que sea un número
sumable para calcular velocidad (D9).

### D5 — El backlog reusa `Task.order`; no nace ningún campo de orden nuevo

`Task.order` ya existe, ya lo acepta `MoveTaskDto`, y ya lo maneja el drag-and-
drop de columna (`BoardColumns.tsx`). El backlog (D2) es una lista de tareas
con `sprintId = null` **del mismo tablero**, así que ordenarla a mano es
exactamente el mismo mecanismo: mandar un nuevo `order` a las tareas que
cambiaron de posición, sin columna de por medio.

**Corrección sobre la primera versión de este plan.** Proponía un
`Task.position` nuevo, exclusivo de este trabajo. Estaba mal informado: el
campo y el endpoint ya existían antes de que este plan se escribiera, y el
hueco de "no se pueden reordenar tareas dentro de una columna"
(`PENDIENTES-BACKEND.md`, resumen viejo) ya estaba resuelto en el código, solo
que el documento no se había actualizado. Verificado el 2026-09-22 leyendo
`tasks.service.ts`, `move-task.dto.ts` y `BoardColumns.tsx` directamente, no
la documentación.

**Lo único que sí falta, y es más pequeño de lo que parece.** `order` solo se
escribe hoy a través de `POST /tasks/:id/move`, y ese endpoint exige
`columnId` — pero una tarea de backlog **ya tiene** un `columnId` (el campo
sigue siendo obligatorio en `Task`; el backlog no le quita la columna, solo
la saca de la vista Kanban vía D12 mientras `sprintId` sea `null`). Reordenar
el backlog es entonces **el mismo mecanismo que ya usa `BoardColumns.tsx`
para renumerar**: mandar `POST /tasks/:id/move` con el `columnId` sin cambiar
y el `order` nuevo. Cero endpoint nuevo, cero campo nuevo — solo la pantalla
de Backlog en P1.3 llamando a algo que ya existe.

### D6 — Cerrar un sprint con tareas sin terminar siempre pregunta

Nunca se mueven en silencio. `POST /boards/:id/sprints/:id/close` exige que el
cliente resuelva, tarea por tarea o en bloque, entre **"al backlog"** o **"al
siguiente sprint"** (si ya existe uno `PLANNED`). Sin esa resolución, el
endpoint devuelve las tareas pendientes y no cierra.

**Por qué.** Confirmado con el dueño del producto: mover en automático es el
mismo tipo de sorpresa silenciosa que ya costó caro con el reseteo de
formularios no controlados (`CLAUDE.md`). Cerrar un sprint es una decisión de
producto de quien lo dirige, no una regla que el sistema deba adivinar.

### D7 — El permiso nuevo es `canManageSprint`, implicado por `canEditBoard`

Sigue el patrón ya usado para `canComment` y `canManageLabels`: un permiso
acotado en vez de reusar uno más ancho, e implicado por jerarquía desde el que
ya administra la estructura del tablero.

**Por qué.** Un equipo puede querer que alguien edite tareas sin poder
iniciar o cerrar sprints —esa decisión suele ser de quien lleva el proceso,
no de todo el equipo—, y el patrón de permisos acotados ya está establecido en
este backend.

### D8 — La metodología se decide por tablero, nunca en cascada

Ni el proyecto ni la organización imponen nada. Un proyecto puede tener un
tablero con sprints (producto) y uno sin ellos (soporte) al mismo tiempo.

**Por qué.** Casi ningún equipo real corre *todo* su trabajo dentro de
sprints — bugs, soporte y administración no encajan ahí — y obligar a elegir
a nivel de proyecto sería menos real que lo que ya se descartó en la primera
ronda de este plan.

### D9 — Burndown y velocidad, con el scope creep incluido desde la Fase 2

El burndown compara, día a día del rango `[sprint.startDate, sprint.endDate]`,
la suma de `estimatePoints` de tareas con `completedAt` dentro de ese sprint
contra el total de puntos del sprint. Sin tabla de snapshot: alcanza un campo
nuevo, `Task.sprintAssignedAt`, que se pisa cada vez que cambia `sprintId`.

Con eso el gráfico separa dos líneas sin duplicar nada:

- **Alcance original** — tareas con `sprintAssignedAt <= sprint.startDate`.
- **Añadido después** — tareas con `sprintAssignedAt > sprint.startDate`,
  que es justo el scope creep: trabajo que entró al sprint después de
  arrancarlo.

Quitar una tarea del sprint a mitad de camino (`sprintId` vuelve a `null`)
se refleja solo: deja de sumar en cualquiera de las dos líneas porque el
cálculo siempre lee el estado actual, no una copia congelada.

**Regla que hereda de Análisis:** `sprintId` como filtro entra en la clave de
caché de Redis desde el primer commit que lo use. Ya mordió con otros filtros
y está escrito en `CLAUDE.md`.

### D12 — Crear una tarea en el Kanban la ata al sprint activo; sin sprint activo, el tablero se ve vacío

Con Scrum encendido y un sprint `ACTIVE`, la vista Kanban muestra **solo** las
tareas de ese sprint, y "Añadir tarea" desde una columna crea la tarea ya con
`sprintId = <sprint activo>` — no hace falta pasar por el Backlog para el caso
rápido ("surgió un bug, lo meto ya en Doing").

Sin sprint activo, la vista Kanban no tiene nada honesto que mostrar: las
columnas siguen ahí pero vacías, con un aviso — *"No hay sprint activo. Ve al
Backlog o inicia uno."*

**Por qué no dejarlo libre.** Sin esta regla, columnas como "Doing" mezclarían
tareas que nadie comprometió a ningún sprint — el mismo problema que tiene hoy
el tablero llamado "Sprint de Lanzamiento", que es lo que este plan existe
para arreglar. Y por qué no forzar todo por el Backlog: crear una tarea
urgente durante el sprint es un caso real y frecuente: no hay que castigarlo
con un paso de más.

### D10 — PRAX puede sugerir capacidad; nunca fija cupo ni bloquea nada

Si se le pide, el asistente puede comentar algo como "tu velocidad media es de
28 puntos y llevas 34 planificados" al armar un sprint. Nunca impide iniciar
un sprint, nunca quita ni añade tareas por su cuenta.

**Por qué.** Es la regla ya escrita para todo el asistente en `CLAUDE.md`: "el
asistente propone, nunca ejecuta". Esta capacidad no es una excepción.

### D11 — Se implementa tocando `apps/backend/` directo, en esta rama

Sin pasar por `PENDIENTES-BACKEND.md`: el equipo de frontend lo trabaja con
autorización explícita del dueño del producto, igual que ya hizo con roles,
invitaciones y estado de proyecto. Toda la feature vive en
`feature/scrum-kanban` hasta que se decida fusionar.

---

## Los invariantes

1. **Ningún tablero existente cambia de comportamiento.** `scrumEnabled` nace
   en `false` para todo lo que ya existe; nadie ve una pestaña nueva sin
   pedirlo.
2. **Encender Scrum en un tablero nunca mueve ni borra tareas.** Todas nacen
   en el backlog (`sprintId = null`) del tablero que las tenía.
3. **Apagar Scrum no borra el historial.** Los sprints cerrados siguen
   consultables de solo lectura; lo único que se pierde es poder iniciar uno
   nuevo mientras esté apagado. Se puede volver a encender en cualquier
   momento (D1).
4. **Como mucho un sprint `ACTIVE` por tablero** (D3).
5. **Cerrar un sprint con pendientes siempre pregunta** (D6); nunca hay un
   movimiento automático y silencioso.
6. **El asistente no inicia, cierra ni reordena un sprint por su cuenta**
   (D10).

---

## El orden de trabajo

| Fase | # | Qué | Dónde | Visible? |
|---|---|---|---|---|
| 0 | ✅ P0.1 | Corregir `PENDIENTES-BACKEND.md §6` (ya resuelto, doc desactualizado) | doc | No |
| 0 | ✅ P0.2 | `completedAt` en el tipo `Task` del frontend + `BoardCalendar.tsx` usándolo (el campo y la escritura ya existían en tasks-service; el hueco era solo de frontend) | frontend | Sí — arregla el calendario ya (§27 cerrado) |
| 0 | ~~P0.3~~ | ~~`Task.position` + reorden~~ — **ya existía por completo** (`Task.order`, `MoveTaskDto`, drag-and-drop en `BoardColumns.tsx`). Sin trabajo pendiente; se retira de esta lista | — | — |
| 1 | P1.1 | `Board.scrumEnabled`, `Sprint` (id, boardId, name, goal, startDate, endDate, status), `Task.sprintId`, `Task.sprintAssignedAt` | projects-service, tasks-service |No hasta P1.3 |
| 1 | P1.2 | `canManageSprint` en el enum; endpoints crear/iniciar/cerrar sprint, con la resolución de D6 en el cierre; el Kanban filtra por sprint activo y ata las tareas nuevas a él (D12) | gateway |No hasta P1.3 |
| 1 | P1.3 | Interruptor "Scrum" en configuración del tablero; pestañas Backlog y Sprint condicionadas a `scrumEnabled`; drag-to-reorder del backlog; estado vacío del Kanban sin sprint activo (D12) | frontend | Sí |
| 2 | P2.1 | `Task.estimatePoints`, editable en el panel de tarea | tasks-service, frontend | Sí — visible en cualquier tablero, con o sin Scrum |
| 2 | P2.2 | Burndown en vivo con scope creep + velocidad de sprints cerrados (D9) | reports-service, frontend | Sí |
| 2 | P2.3 | `sprintId` como filtro en los 7 agregados de Análisis, con clave de Redis actualizada | reports-service | Sí |
| 3 | P3.1 | Límite de WIP por columna (independiente de sprints) | projects-service, frontend | Sí |
| 3 | P3.2 | Duración por defecto de sprint (plantilla, ej. 2 semanas) al iniciar uno | frontend | Sí |
| 3 | P3.3 | Sugerencia de capacidad de PRAX al armar un sprint (D10) | assistant-service | Sí |

**Fase 0 completa.** Los tres puntos eran de bajo riesgo y ya están cerrados
(ver Registro). Lo que sigue es todo Fase 1 en adelante — el trabajo real de
esta feature.

---

## Cómo queda abierto para metodologías futuras

`scrumEnabled` es el primer ejemplo de un patrón, no un caso especial: una
metodología nueva se enchufa como una **capa opcional** sobre
`Board → Column → Task`, nunca como un reemplazo. Dos ejemplos de qué tan
barato queda con este diseño:

- **Waterfall/Gantt**: pediría `Task.dependsOnTaskIds` + fechas de inicio/fin
  + una vista Gantt nueva. No toca `Sprint` ni obliga a tener columnas de una
  forma concreta.
- **Lista simple** para un proyecto pequeño: ya existe hoy sin código nuevo —
  es un tablero Kanban de una sola columna con `scrumEnabled: false`.

Las pestañas de vista del tablero (`Kanban / Calendario / Tabla / Backlog /
Sprint`) siguen el mismo principio: cada capacidad registra las suyas: Scrum
añade Backlog y Sprint sin tocar las de Kanban, y una metodología futura
añadiría las suyas sin tocar ninguna de las dos.

---

## Las cinco preguntas de la primera revisión, contestadas (2026-09-22)

1. **¿Editable siempre o fijo al crear el tablero?** Editable siempre —
   convertido en D1.
2. **¿Cómo se llama en la interfaz?** "Scrum", no "Sprints" — también en D1,
   con el porqué del nombre.
3. **¿El scope creep entra ya?** Sí, en la Fase 2, con `Task.sprintAssignedAt`
   en vez de una tabla de snapshot — convertido en D9.
4. **¿El límite de WIP por columna va en este plan?** Sí, se queda en la
   Fase 3 (P3.1), tal como estaba.
5. **¿Se puede crear una tarea directo en una columna con Scrum encendido?**
   Sí, y se ata sola al sprint activo; sin sprint activo el Kanban se ve
   vacío con un aviso — convertido en D12.

No quedan preguntas abiertas de esta ronda. La siguiente revisión, si aparece
una antes de empezar a picar código, se añade aquí con el mismo formato.

---

## Fase futura (a discutir) — Espacios como contenedor multi-tipo + Documentos

> No entra en el alcance de este plan. Anotado el 2026-09-22 para no perderlo,
> a propuesta del dueño del producto. Se retoma como su propio documento
> cuando esta feature esté entregada.

**El problema, dicho llanamente.** Hoy `Project → Workspace ("Espacio") →
Board` mete un nivel de navegación entre proyecto y tablero que casi siempre
contiene un solo Espacio con todo dentro — sobra en el caso común y solo se
nota en proyectos grandes y multi-departamento (Kyloo: "Web y Producto" vs
"Legal y Administración"). Un contenedor de un solo tipo de contenido rara vez
justifica ser una entidad de navegación aparte.

**La idea a explorar.** Que un Espacio deje de ser "una carpeta de tableros" y
pase a ser "una carpeta de trabajo": capaz de contener tableros **y**
documentos de texto enriquecido, al estilo Notion. Es el mismo recorte que ya
resuelven ClickUp (`Space → Folder → List/Doc`) y Linear (`Project` con
`Documents` al lado de sus `Issues`) — ahí el nivel extra deja de ser ruido
porque agrupa cosas de verdad distintas, no copias del mismo tipo.

**Por qué queda fuera de este plan y no se cuela dentro.** Un motor de
documentos pide editor de texto enriquecido, versionado, permisos por
documento — un producto nuevo, no una pestaña más de un tablero. Mezclarlo
con Scrum/Kanban arriesgaría los dos.

**Lo que haría falta decidir cuando se retome**, sin resolver aquí:

1. Si Espacio se renombra en la interfaz al ganar un segundo tipo de
   contenido, o se queda con el mismo nombre y solo gana la capacidad.
2. Si un documento puede vivir suelto en un proyecto sin Espacio, igual que
   hoy puede pasar con un tablero.
3. Qué tan "Notion" hace falta que sea el editor — bloques anidados, o alcanza
   con texto enriquecido plano por ahora.
4. Si esto es la ocasión para replantear si Espacio debe seguir existiendo
   como nivel obligatorio, o pasar a ser opcional incluso para tableros.

---

## Registro

### 2026-09-22 — Fase 0

- ✅ **P0.1** — `PENDIENTES-BACKEND.md §6` corregido: el `@@unique([ownerId,
  name])` ya existe en el schema (`20260730020000_project_name_unique_per_owner`),
  el documento seguía diciendo que estaba abierto.
- ✅ **P0.2** — Al explorar el schema de tasks-service para P0.3 apareció
  `Task.completedAt` ya escrito y ya usado por `MoveTaskDto.isClosingColumn`.
  El único hueco real era de frontend: `completedAt` no estaba en el tipo
  `Task` (`commons/api/domain.ts`) y `BoardCalendar.tsx` seguía usando
  `updatedAt`. Corregido en los dos archivos; `updatedAt` queda solo como
  respaldo para tareas cerradas antes del 2026-07-30. `PENDIENTES-BACKEND.md
  §27` corregido a resuelto.
- ✅ **P0.3, retirado** — al ir a crear `Task.position` se encontró que
  `Task.order` ya existe desde el `init`, que `MoveTaskDto` ya lo acepta y que
  `BoardColumns.tsx` ya arrastra y renumera tareas dentro de una columna. No
  había nada que construir. `PENDIENTES-BACKEND.md` (resumen) corregido: ya no
  dice que reordenar sea un hueco.
- **Lección para las siguientes fases:** este plan se escribió apoyado en
  `PENDIENTES-BACKEND.md`, y ese documento tenía tres afirmaciones falsas
  (§6, §27, y el resumen de reordenado). **Se verifica contra el código antes
  de diseñar sobre un documento**, no solo al ejecutar — ya cambió D5 una vez
  por esto. Antes de la Fase 1, se irá igual de despacio: confirmar que no
  existe ya nada parecido a `Sprint`, `scrumEnabled` o `estimatePoints` antes
  de escribir la migración.

*(sigue vacío de aquí en adelante — se llena a medida que avanza la Fase 1)*
