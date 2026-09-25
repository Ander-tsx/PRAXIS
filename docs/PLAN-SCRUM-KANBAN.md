# Plan Scrum + Kanban — multi-metodología

> Etapa **abierta**, arrancada el 2026-09-22. Rama `feature/scrum-kanban`.
>
> ✅ **Fases 0 a 3 entregadas el 2026-09-23** (ver Registro). Falta que el dueño
> del producto lo pruebe y decida si se fusiona; lo que queda abierto está al
> final: la fase futura de Espacios y Documentos, que requiere discutirse.
>
> 🔴 **Auditoría del 2026-09-24** —cuatro fallos daban datos equivocados sin
> ningún error—. ✅ **Corregida el 2026-09-25** con un rediseño de la
> interfaz (D17–D20): el Bloque 1 entero y casi todo el 2 están cerrados;
> lo que queda abierto está marcado sin casilla en [la auditoría](#auditoría-2026-09-24)
> y resumido en [su registro](#2026-09-25--rediseño-tras-la-auditoría).
>
> ⚠️ **D14, D15 y D16 quedan sustituidas por D17–D20.** Se conservan porque
> explican de dónde se venía.
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
  `scrumEnabled`.
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

### D13 — El límite de WIP es blando: se avisa, no se bloquea

`BoardColumn.wipLimit: Int?`. Al pasarlo, el contador de la columna pasa a
«6/5» en tono de aviso; ningún movimiento se rechaza.

**Por qué.** Tomada sin preguntar en la sesión autónoma del 2026-09-23, y
anotada para revisarla. Rechazar un arrastre porque la columna está llena
castiga justo el momento en que el equipo tiene prisa, y lo que un límite de
WIP busca es que alguien lo vea y hable de ello, no cerrar la puerta. Es como
lo hacen Jira y Linear. Si algún día se quiere duro, es una comprobación más en
`moveTask` — el dato ya está.

### D14 — El backlog es un panel lateral, y solo lleva al sprint en curso

Decidido por el dueño del producto al probarlo (2026-09-23), y sustituye a la
vista «Backlog»: un botón «Backlog · N» en la franja del sprint abre un panel
por la derecha, como el de la tarea. Desde él se **arrastra** una tarea a una
columna y entra en el sprint en curso, en esa columna — un solo `PATCH` con
`sprintId`, `columnId` y `status`. En el móvil, donde arrastrar pelea con el
desplazamiento, cada tarea lleva un «→ columna».

Solo al sprint en curso, a propósito: planear sprints futuros tarea a tarea
era la parte que más complicaba la pantalla y la que menos se usa. El alta
desde el panel pide lo básico de una tarea Scrum: título, descripción,
prioridad, puntos y encargado.

### D15 — Una franja encima del tablero dice qué sprint es

Respuesta a «¿cómo se distingue cuándo acaba un sprint y empieza otro?». El
Kanban de un tablero Scrum **es** el sprint en curso; la franja lo nombra, con
sus fechas, los días que quedan y cuánto va hecho. Al cerrarlo desaparece y el
tablero se queda vacío; al empezar el siguiente, la franja cambia de nombre.

### D16 — Empezar un sprint es un paso, y cerrarlo puede abrir el siguiente

La vista Sprint ya no separa «planear» e «iniciar»: un formulario con nombre,
meta y fechas, y un botón. Al cerrar, si alguna pendiente pasa al siguiente,
se le pone nombre y fechas en el mismo diálogo y arranca en cuanto este se
cierra. El backend sigue teniendo `PLANNED`; la interfaz encadena las
llamadas.

La vista se reorganizó para leerse sola: dos barras que se comparan —tiempo
gastado y trabajo hecho— con una frase («vais al ritmo»), el reparto por
columna, el burndown explicado en una línea y el historial como barras.

### D17 — El backlog es un panel lateral que forma parte del arrastre del tablero

Sustituye a D14. Decidido con el dueño del producto tras la auditoría
(2026-09-25): «un componente similar al desplegable de editar una tarea».

El panel es el mismo `SlideOver` que el de la tarea, empuja el tablero en vez
de taparlo y **no se cierra al hacer clic fuera** —soltar una tarea en el
tablero es un clic fuera—. Dentro, las tarjetas son las del tablero
(`ColumnTasks`), y el panel se registra en el motor de arrastre como **una
columna más** (`BACKLOG` en `scrum.ts`). De ahí sale todo lo demás sin código
propio:

- arrastrar del backlog a una columna, de una columna al backlog y reordenar
  el backlog son **el mismo gesto**, con el mismo fantasma, el hueco exacto y
  el movimiento optimista del tablero (el de antes era arrastre HTML5 nativo:
  fantasma translúcido, ningún hueco y esperar al servidor);
- una tarea del backlog se **abre** con un clic y se refina en su panel;
- en el móvil, la pulsación larga abre la hoja de mover con «Backlog» como
  destino más, y el panel de la tarea tiene «Pasar al sprint» /
  «Devolver al backlog».

Arriba del panel se escribe una tarea nueva con solo el título, como un paso
del checklist. Volver al backlog lleva la tarea a la primera columna: el
backlog es trabajo por empezar, y lo terminado no se enseña en él.

### D18 — No hay vista «Sprint»: todo el sprint va en la franja

Sustituye a D15 y D16. La vista tenía cuatro cosas y obligaba a salir del
tablero para verlas. La franja encima del tablero (`SprintStrip`) lleva el
nombre, la **meta**, las fechas, los días que quedan, el progreso y el botón
del backlog; lo demás se abre encima sin perder el sitio:

- **Progreso** (clic en la barra): tiempo frente a trabajo, el burndown y los
  sprints anteriores.
- **Empezar** y **Editar**: un diálogo con nombre, meta y fechas.
- **Cerrar**: en el menú `⋯`, y como botón visible cuando ya toca (se acabó
  el tiempo o está todo hecho).

El selector de vistas vuelve a ser Kanban / Calendario / Tabla. Una
`?vista=sprint` de un enlace viejo cae al Kanban.

### D19 — El tablero enseña «el sprint de ahora», y entre dos sprints se planifica

Contesta a «¿cómo se ven varios sprints en un mismo tablero?».

- **El tablero es siempre el mismo** —mismas columnas— y enseña un solo
  sprint: el que está en curso o, si no hay, el **planeado** (el siguiente).
  Solo puede haber uno de cada.
- **Planificar es arrastrar**: con el sprint planeado en el tablero, se
  sueltan tareas del backlog en sus columnas. «Empezar sprint» fija ahí el
  compromiso (`Sprint.startedAt`); lo que entre después es alcance añadido en
  el burndown. Esto es lo que arregla S1 de raíz.
- **Al cerrar**, lo terminado se queda en el sprint cerrado —es su historial
  y su velocidad— y **desaparece del tablero**: Done empieza vacío en el
  sprint siguiente. Lo que no se terminó pasa por defecto al siguiente, **en
  la misma columna en la que estaba** (si iba por Doing, sigue en Doing), con
  una marca ↻ en la tarjeta que dice que viene arrastrado
  (`Task.carryOverCount`). También se puede mandar al backlog.
- **El siguiente nace planeado, no en marcha.** El equipo lo ve en el
  tablero con lo arrastrado, añade lo que quiera y lo empieza. Antes el
  cierre lo arrancaba al instante y todo lo que se añadía después contaba
  como alcance añadido.
- Sin ningún sprint, la franja ofrece «Planear sprint», y soltar la primera
  tarea en una columna también lo crea.

### D20 — Encender Scrum con trabajo en columnas pregunta

Encender no mueve nada, pero lo que el equipo *ve* es su tablero en blanco
(S7). Si hay tareas abiertas en las columnas, un diálogo ofrece **llevarlas
al Sprint 1** (planeado, no en marcha) o dejarlas todas en el backlog.
Apagar Scrum con un sprint en marcha no se puede: primero se cierra (S8).

### D21 — Sprint y Backlog son dos paneles gemelos, y nunca se apilan

Pedido por el dueño del producto al probar D18 (2026-09-25): el `⋯` del
sprint, a un palmo del `⋯` del tablero, eran dos menús iguales para cosas
distintas; y abrir una tarea desde el backlog apilaba los dos paneles.

- La franja tiene **dos botones iguales**, «Sprint» y «Backlog», y cada uno
  abre su panel lateral. Solo uno a la vez.
- El panel del sprint (`SprintPanel`) lo tiene todo: nombre, meta y fechas
  editables en el sitio, cómo va, el burndown, **quién lleva qué** (R4) y los
  sprints anteriores con lo que dejó cada cierre (S15, `Sprint.closeSummary`).
  Empezar, cerrar y descartar siguen siendo diálogos: son decisiones.
- **`SlideOver` solo enseña el de encima.** Si se abre una tarea con el
  backlog abierto, el backlog se esconde —sin perder su estado— y la tarea
  ofrece «‹ Backlog» para volver. Vale para cualquier pareja de paneles de la
  aplicación, no solo para estos.
- Los diálogos van en la paleta cálida (`Dialog tone="dark"`, título en sans).

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
| 1 | ✅ P1.1 | `Board.scrumEnabled`, `Sprint` (id, boardId, name, goal, startDate, endDate, status), `Task.sprintId`, `Task.sprintAssignedAt` | projects-service, tasks-service |No hasta P1.3 |
| 1 | ✅ P1.2 | `canManageSprint` en el enum; endpoints crear/iniciar/cerrar sprint, con la resolución de D6 en el cierre; el Kanban filtra por sprint activo y ata las tareas nuevas a él (D12) | gateway |No hasta P1.3 |
| 1 | ✅ P1.3 | Interruptor "Scrum" en configuración del tablero; pestañas Backlog y Sprint condicionadas a `scrumEnabled`; drag-to-reorder del backlog; estado vacío del Kanban sin sprint activo (D12) | frontend | Sí |
| 2 | ✅ P2.1 | `Task.estimatePoints`, editable en el panel de tarea | tasks-service, frontend | Sí — visible en cualquier tablero, con o sin Scrum |
| 2 | ✅ P2.2 | Burndown en vivo con scope creep + velocidad de sprints cerrados (D9) | reports-service, frontend | Sí |
| 2 | ✅ P2.3 | `sprintId` como filtro en los 7 agregados de Análisis, con clave de Redis actualizada | reports-service | Sí |
| 3 | ✅ P3.1 | Límite de WIP por columna (independiente de sprints) | projects-service, frontend | Sí |
| 3 | ✅ P3.2 | Duración por defecto de sprint (plantilla, ej. 2 semanas) al iniciar uno | frontend | Sí |
| 3 | ✅ P3.3 | Sugerencia de capacidad de PRAX al armar un sprint (D10) | assistant-service | Sí |

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

### 2026-09-23 — Fase 1 (sesión autónoma, el dueño del producto dormía)

- ✅ **P1.1** — `Board.scrumEnabled`, `Sprint` y `SprintStatus` en
  projects-service (`20260923055428_add_scrum_sprint`); `Task.sprintId` y
  `Task.sprintAssignedAt` en tasks-service (`20260923055433_add_sprint_id`).
  Nada existente cambia: todo nace en `false`/`null`.
- ✅ **P1.2** — `canManageSprint` (implicado por `canEditBoard`, y en el rol
  «Administrador» por defecto); `/boards/:boardId/sprints` en el gateway
  (listar, planear, iniciar, pendientes, cerrar). El cierre orquesta los dos
  servicios desde el gateway y marca el sprint cerrado **el último**.
  Verificado con curl contra el stack construido: crear sin Scrum → 400;
  segundo activo → 409; tarea creada en el Kanban se ata sola al activo y con
  `sprintId: null` explícito no; cerrar sin resolver → 409 con la lista;
  resolver a medias → 409 con la que falta; mandar a un sprint cerrado → 400 y
  **ninguna tarea se mueve**; un sprint de otro tablero → 404.
- ✅ **P1.3** — Interruptor «Trabajar por sprints (Scrum)» en el menú del
  tablero (sin confirmación, ver `ScrumToggle`); vistas Backlog y Sprint en el
  selector solo con Scrum; Kanban, Calendario y Tabla filtran al sprint en
  curso y sin él enseñan `SinSprintActivo`. El backlog se reordena con
  flechas (mejor en el móvil que arrastrar) reusando `POST /tasks/:id/move`
  con la misma columna, como decía D5.
- ✅ **P3.2 adelantado** — las fechas de un sprint nuevo salen por defecto a
  dos semanas (`fechasPorDefecto` en `scrum.ts`). Era una línea.
- ✅ e2e `e2e/tests/ui/09-scrum.spec.ts`: el recorrido entero en Chromium.

**Trampas que aparecieron:**

- 🔴 **La caché `tasks:board:<id>` solo se borraba por clave exacta**, y ya
  había una variante con `:col:<id>` que nadie invalidaba. Con los filtros de
  sprint y backlog habría sido lo mismo tres veces. `RedisService.delByPrefix`
  (con `SCAN`, no `KEYS`) y los diez sitios de invalidación pasan a usarlo.
- ⚠️ **Los ids de tarea de las semillas no son UUID** (`task0001-…`). El DTO de
  resoluciones del cierre los rechazaba con `@IsUUID`; ahora es `IsString`,
  sin abrir nada (solo cuentan ids que estén en la lista de pendientes).
- ⚠️ **Matar un servicio arrancado con `pnpm start:backend` tumba los diez**
  (turbo sale con 137). Para reiniciar uno suelto hay que levantarlos por
  separado.
- ⚠️ **Probar desde el móvil con `next dev`** exige `allowedDevOrigins`; se
  añadió leyendo `DEV_ORIGINS` en `next.config.ts` para no fijar una IP.

### 2026-09-23 — Fases 2 y 3 (misma sesión autónoma)

- ✅ **P2.1** — `Task.estimatePoints` (`20260923063101_add_estimate_points`),
  editable en el panel de tarea («Estimación (puntos)»; vacío = sin estimar),
  insignia «5 pt» en la tarjeta y totales en el Backlog.
- ✅ **P2.2** — Burndown con scope creep y velocidad. ⚠️ **Se calcula en el
  cliente, no en reports-service** como decía la tabla: la pantalla ya tiene
  todas las tareas del tablero con `completedAt`, `sprintAssignedAt` y
  `estimatePoints`, y pedirlas otra vez al servidor era un viaje para nada. La
  lógica es pura y está aislada en `WorkspaceCanvas/burndown.ts`. Unidad: puntos
  si alguna tarea del sprint está estimada; si no, tareas. El gráfico lleva
  leyenda, trazo distinto para «ideal», tooltip por día y tabla alternativa.
- ✅ **P2.3** — `sprintId` como filtro de Análisis, en la clave de Redis
  (`claveDeFiltros`) desde el mismo commit. Sin pantalla —Análisis está
  archivada—: lo usan la API y, a través del briefing, PRAX.
- ✅ **P3.1** — `BoardColumn.wipLimit` (`20260923063552_add_column_wip_limit`),
  blando (D13). Menú de columna › «Límite de trabajo en curso»; el contador
  pasa a «3/5» y a tono de aviso al pasarlo.
- ✅ **P3.3** — Bloque `scrum` en el briefing (sprint en curso: comprometido y
  hecho; velocidad media de hasta 3 cerrados), solo en tableros con Scrum, y
  una regla al final de la lista (para no mover las que se citan por número).
  `medir-prompt` contra el proyecto de las semillas: 34 312 caracteres por
  turno; el bloque ocupa ~170 y la regla ~290.
- ✅ e2e: segundo caso en `09-scrum.spec.ts` (estimación y WIP).

**Un fallo previo que apareció por el camino, y se arregló:**

- 🔴 **Los filtros de Análisis se rechazaban todos en cuatro rutas.** El
  controlador importaba `type ReportFiltersQueryDto`; con `type`, el
  `@Query()` queda tipado en runtime como `Function` y el `ValidationPipe`
  (`forbidNonWhitelisted`) responde 400 «property boardId should not exist» a
  cualquier filtro en `snapshot` y las otras tres rutas que usan la clase base.
  Las que usan una subclase (`flow`, con `days`) sí funcionaban, por eso no se
  notó. Es la trampa 3 de `CLAUDE.md` con otra cara. Import de valor y listo.

**La regresión completa, bajo presión de memoria:** 8 GB, emulador de Android
abierto y 15 de 16 GB de swap. Fallaron `06-chat` (busca el título «Tus
mensajes», que esa pantalla solo pinta en una de sus dos ramas desde
`9b6343c`; sin cambios en esta rama) y `07-reglas` Bloque 5 (tiempo agotado).
Ninguna toca Scrum; las dos de `09-scrum` pasan con la máquina descargada.

**Pendiente de mirar, sin urgencia:** `desde`/`hasta` del bloque `scrum` se
recortan de la fecha en UTC; en México un sprint que acaba a las 23:59 del 5
sale como «hasta 6». Un día de desfase en una cifra que PRAX solo nombra.

**Decisión tomada sin preguntar**, anotada para revisarla: mover una tarea
entre backlog y sprint pide `canEditTask` (es un `PATCH` de la tarea), no
`canManageSprint`. Planificar qué entra es trabajo del equipo; arrancar y
cerrar el reloj es de quien lleva el proceso.

---

## Auditoría (2026-09-24)

> Pedida por el dueño del producto: código, lógica de negocio, interfaz y si
> sirve de verdad a un equipo Scrum. Sin suavizar. Cada hallazgo lleva casilla:
> **se marca al cerrarlo**, como en `AUDITORIA-ORGANIZACION-CHAT-MOVIL.md`.

### Cómo se hizo

- Lectura del diff entero de la rama contra `main` en lo que es de Scrum
  (backend, contratos, gateway, las acciones y los once componentes).
  Documentos queda fuera: tiene su propio plan.
- **Reproducción por API** contra el stack construido: un proyecto de prueba
  («Auditoria Scrum B», en el espacio personal de `sofia@praxis.dev`) con
  columnas To Do / Doing / Review / Done, dos sprints y ocho tareas estimadas.
- **Capturas** con Playwright en 1440×900 y 390×844: Kanban con franja, panel
  del backlog, vista Sprint, cierre y menú del tablero.

### Veredicto

La base es buena y las decisiones de fondo aguantan: Scrum como capa (D1), el
backlog como `sprintId = null` (D2), un solo activo (D3), cierre que pregunta
(D6) y WIP blando (D13). **Lo que falla es lo que un equipo mira cada día**:
el burndown sale mal en el flujo normal, las cifras se truncan en silencio
cuando el tablero crece —y un tablero Scrum crece por diseño—, el historial se
puede reescribir, y faltan tres gestos básicos: sacar una tarea del sprint,
ordenar el backlog y abrir una tarea del backlog para refinarla.

Hoy sirve para **enseñarlo en una demo**. No aguanta dos sprints de un
equipo real sin dar un número falso.

### Hallazgos

Severidad: 🔴 dato equivocado o pérdida sin error · 🟠 impide un flujo
Scrum básico · 🟡 confunde o es inconsistente · ⚪ higiene.

#### 🔴 Críticos

- [x] **S1 — El burndown da alcance original 0 en el flujo normal.**
  `fechasDelFormulario` fija `startDate` a las 00:00 del día elegido, y desde
  D14/D16 una tarea **solo puede entrar en un sprint que ya está en curso**
  (no hay planificación previa). Así que todo `sprintAssignedAt` es posterior
  al inicio y `calcularBurndown` lo cuenta como *añadido después*.
  Reproducido: *«Alcance al arrancar: 0 puntos · añadido después: 18 puntos»*
  y la línea ideal plana en 0. El gráfico dice que todo el sprint es scope
  creep y el veredicto de ritmo no significa nada.
  **Arreglo:** o se vuelve a poder planear antes de empezar (ver P1 abajo), o
  como mínimo lo que entra **durante el primer día** cuenta como alcance
  original. Con test unitario de `burndown.ts` para los dos casos.

- [x] **S2 — Todo Scrum se calcula sobre las primeras 100 tareas del tablero.**
  `page.tsx` pide `/boards/:id/tasks?limit=100`, ordenado por `order`, y con
  eso se calculan el burndown, la velocidad, el backlog, los contadores de la
  franja y la lista local del cierre. Un tablero Scrum **acumula** tareas
  cerradas sprint tras sprint: pasado el centenar, la velocidad de los sprints
  viejos cae a cero, el backlog pierde filas y el Kanban del sprint puede
  perder tarjetas — sin ningún aviso. Y *cuáles* caen es arbitrario (`order`
  es por columna, así que se intercalan). Nota: el bloque de PRAX sí cuenta
  en el servidor (`task_sprint_summary`), así que **pantalla y PRAX darán
  números distintos**. Es la regla de `CLAUDE.md` —«un recorte mudo es peor
  que no recortar»— rota en la pantalla principal.
  **Arreglo:** pedir por alcance —`?sprintId=<activo>` y `?backlog=true`, que
  ya existen— y sacar burndown y velocidad a una ruta del servidor
  (`GET /boards/:id/sprints/:sid/stats` y `/velocity`) sobre la misma
  consulta que ya usa PRAX. La pantalla deja de depender de tener todas las
  tareas en memoria.

- [x] **S3 — Un sprint cerrado no es de solo lectura.** Reproducido por API:
  `PATCH /tasks/:id {sprintId: <cerrado>}` → 200, y `PATCH {sprintId: null}`
  sobre una tarea de un sprint cerrado → 200. Cualquiera con `canEditTask`
  reescribe la velocidad histórica. `assertSprintInBoard` solo mira el
  tablero, no el estado; `POST /boards/:id/tasks` con `sprintId` explícito
  tiene el mismo hueco. Contradice el comentario de `SprintCloseAction` («un
  sprint que va a quedar `CLOSED` y de solo lectura»).
  **Arreglo:** en tasks-service, rechazar con 409 entrar en un sprint
  `CLOSED` y salir de uno; `sprint_find_by_ids` ya devuelve el `status`.

- [x] **S4 — «Cerrar y empezar el siguiente» no es atómico, y puede dejar
  tareas invisibles.** `closeSprintAction` encadena tres llamadas desde el
  servidor de Next: crear el siguiente (`PLANNED`) → cerrar → arrancarlo.
  - Si el cierre responde 409 (alguien movió una tarea entre medias), el
    sprint recién creado **queda huérfano**, y el reintento crea otro.
  - Si el arranque falla después de cerrar, las tareas pasadas «al
    siguiente» quedan en un sprint `PLANNED` que **ninguna pantalla enseña**:
    no están en el backlog (`sprintId ≠ null`) ni en el Kanban (no es el
    activo). Desaparecen para el equipo.
  - Los huérfanos inflan el nombre sugerido (`Sprint ${sprints.length + 1}`)
    y el texto de `SinSprintActivo` («N sprints planeados esperando»), que
    ofrece «Iniciar un sprint» sin forma de iniciarlos.
  **Arreglo:** el cierre del gateway acepta `next: {name, goal, startDate,
  endDate}` y orquesta crear → reasignar → cerrar → arrancar en ese orden,
  deshaciendo la creación si algo falla. Y mientras existan sprints
  `PLANNED`, la interfaz los enseña.

#### 🟠 Altos

- [x] **S5 — No se puede sacar una tarea del sprint desde la interfaz, ni ver
  en cuál está.** El panel de tarea no tiene campo de sprint. Recortar
  alcance a mitad de sprint —el gesto más normal de un equipo que va tarde—
  solo se puede cerrando el sprint. `UpdateTaskBodyDto` lo documenta («devolver
  al backlog desde el tablero») y la pantalla no lo implementa.
  **Arreglo:** en el panel de tarea, una línea «Sprint: S2 · Devolver al
  backlog»; y en el menú de la tarjeta, lo mismo.

- [x] **S6 — El backlog no es un product backlog.**
  - **No se ordena.** P1.3 tenía flechas; D14 las perdió. El orden que se
    ve es el `order` de columnas distintas mezclado con `backlog.length` de
    las altas nuevas: no significa nada. Un backlog sin prioridad explícita
    no es un backlog.
  - **Las filas no se abren.** No se puede leer la descripción, cambiar la
    estimación ni refinar nada sin meter la tarea en el sprint primero.
  - **Enseña tareas terminadas** (reproducido: «Tarea A», completada, está en
    el backlog). Al encender Scrum en un tablero viejo, todo lo que estaba en
    Done aparece como trabajo pendiente.
  - Sin búsqueda, filtro por etiqueta/prioridad ni total de puntos por
    selección.
  **Arreglo:** excluir `completedAt ≠ null`; fila clicable que abre el panel
  de tarea de siempre; asa para reordenar (y flechas en el móvil) reusando
  `POST /tasks/:id/move`; buscador arriba.

- [x] **S7 — Encender Scrum vacía el Kanban de todo el equipo de golpe.**
  `ScrumToggle` no confirma «porque no mueve nada», pero lo que **ve** el
  equipo es que su tablero se queda en blanco y lo que tenía en Doing pasa a
  un backlog. El dato no se pierde; la confianza sí.
  **Arreglo:** diálogo al encender que diga qué va a pasar y ofrezca *«Empezar
  el primer sprint con las N tareas abiertas que ya están en columnas»*.

- [x] **S8 — Apagar Scrum no se comporta como dicen D1 y el invariante 3.**
  - Reproducido: `POST …/start` con Scrum **apagado** → 201. `createSprint`
    lo comprueba; `startSprint` no.
  - Apagar con un sprint activo lo deja `ACTIVE` y con el reloj corriendo;
    al volver a encender, la franja dice «terminó hace 30 días».
  - **El historial no es consultable con Scrum apagado**, contra el
    invariante 3: `page.tsx` solo pide sprints si `scrumEnabled` y la vista
    Sprint desaparece del selector.
  **Arreglo:** comprobar `scrumEnabled` al iniciar; al apagar con un sprint
  activo, pedir cerrarlo antes (o avisar); mantener la vista Sprint en solo
  lectura si hay sprints cerrados.

- [x] **S9 — Dos sprints activos por carrera.** `startSprint` hace
  comprobar-y-luego-escribir sin transacción ni índice. Dos clics o dos
  personas a la vez dejan dos `ACTIVE` y `sprintActivo()` elige uno al azar.
  **Arreglo:** `CREATE UNIQUE INDEX … ON sprints("boardId") WHERE status =
  'ACTIVE'` y traducir el P2002 a 409.

- [x] **S10 — La velocidad mezcla unidades y compara contra cero.**
  - `calcularVelocidad` decide su unidad sobre los sprints cerrados;
    `SprintEnCurso` la imprime con la unidad **del sprint actual**.
    Reproducido: *«terminó de media 0 puntos»* cuando la media era en tareas.
  - Con media 0 dispara *«este va más cargado de lo habitual»*: cualquier
    número es mayor que 0 × 1,2.
  - Pantalla promedia 5 sprints; PRAX, 3. Dirán medias distintas.
  - Cuenta como hecho lo que se completó **antes** de entrar en el sprint.
  **Arreglo:** una sola unidad por tablero, calculada en el servidor (S2);
  no comparar hasta tener 2–3 sprints cerrados con algo hecho; misma ventana
  en los dos sitios; contar solo `completedAt ≥ startDate`.

- [x] **S11 — En el móvil, la vista Sprint no tiene puerta.** El selector de
  vistas es `hidden sm:flex` (`TableroExpandible`). Solo se llega tocando el
  nombre del sprint en la franja —sin nada que diga que es un botón— o desde
  el vacío sin sprint. Cerrar un sprint en el móvil es un acertijo. Y el panel
  del backlog dice «Arrastra una tarea a una columna» en una pantalla donde
  no se puede arrastrar.

#### 🟡 Medios

- [x] **S12 — Un sprint no se edita.** Ni nombre, ni meta, ni fechas
  (alargar una semana es habitual), ni se borra uno creado por error. El
  cierre crea el siguiente **sin meta** y no deja ponérsela.
- [x] **S13 — Tres cifras que no casan en la misma pantalla.** La franja
  cuenta **tareas** («1/4 hechas»), la vista Sprint **puntos** («3 de 18 ·
  17 %»), y la pestaña del tablero cuenta **todo el historial** («Equipo Web
  11» con 4 en el Kanban).
- [x] **S14 — Calendario y Tabla filtradas al sprint esconden las fechas
  límite del backlog**, y no queda ninguna vista con todas las tareas del
  tablero. Para un equipo, la Tabla es justo donde se refina el backlog.
- [x] **S15 — Cerrar un sprint no deja nada que revisar.** Sin resumen al
  cerrar (qué se terminó, qué pasó al siguiente, alcance añadido), el
  historial son barras sin enlace y un sprint cerrado no se puede abrir.
  La *Sprint Review* no tiene soporte.
- [x] **S16 — «Vais al ritmo».** Voseo peninsular en una aplicación que
  formatea en `es-MX` y trata de tú: *«Van al ritmo»*, *«van bien»*.
- [x] **S17 — Colores a pelo, contra la regla de `CLAUDE.md` (hallazgo E4).**
  `bg-[#161616]` y `bg-[#1c1c1b]` en `BacklogDrawer` y `SprintPanel`,
  `stroke="#191919"` y `background: '#1c1c1b'` en `BurndownChart`,
  `text-white` y `bg-[#191919]` en el formulario de WIP de `ColumnMenu`.
- [x] **S18 — PRAX con información vieja.** Su regla, que viaja en **cada
  turno de todos los proyectos**, manda a «la vista Sprint o Backlog»: el
  Backlog ya no es una vista. Ventana de 3 frente a 5 (S10). Y al insertar
  `scrumDeTableros` en `reports.service.ts` quedó debajo del JSDoc del método
  siguiente, que se quedó sin el suyo.

#### ⚪ Bajos

- [x] **S19 — Ni una prueba unitaria.** `burndown.ts` es lógica pura y
  aislada precisamente para probarla; `SprintsService` y el cierre del
  gateway orquestan dos servicios. Solo hay e2e del camino feliz. S1 y S10
  no habrían llegado aquí con tres casos de `burndown.spec.ts`.
- [x] **S20 — Textos y documentos desfasados tras D14.** `ScrumToggle`
  («Backlog y Sprint activos»), JSDoc de `VistaSelector` («añade Backlog y
  Sprint»), `SinSprintActivo` («Planear un sprint», planeados), el comentario
  de `CreateTaskBodyDto` («desde el Backlog»), la tabla de fases (P1.3
  «pestañas Backlog»), y las decisiones fuera de orden (D12 antes de D10, D11
  al final).
- [x] **S21 — «→ columna» deja meter una tarea directamente en Done.** Entra
  completada y cuenta como hecha el mismo día sin haberse trabajado en el
  sprint. Ofrecer solo columnas que no cierran.
- [x] **S22 — Estimar es escribir un número a mano.** D4 se mantiene (sin
  escala impuesta), pero unos atajos 1·2·3·5·8·13 junto al campo, y poder
  estimar desde el backlog, ahorran la mitad de una sesión de refinamiento.

### Lo que un equipo Scrum necesita y aquí no está

| Ceremonia / artefacto | Qué hay | Qué falta |
|---|---|---|
| **Product backlog** | Lista sin orden, de solo lectura | Orden, refinamiento en el sitio, búsqueda (S6) |
| **Sprint planning** | Empezar vacío y arrastrar después | Planear antes de arrancar, con los puntos del carrito frente a la velocidad (P1) |
| **Sprint goal** | Se escribe al empezar, se ve solo en la vista Sprint | Siempre visible en la franja; editable (S12, R1) |
| **Daily** | Kanban del sprint | Agrupar por persona, y qué lleva días sin moverse — el dato ya existe en Análisis (`blocked`) |
| **Sprint review** | Nada | Resumen al cerrar y sprint cerrado navegable (S15) |
| **Retrospectiva** | Nada | Un documento de retro por sprint, creado al cerrar: encaja con Documentos si se fusiona |
| **Scrum Master** | `canManageSprint`, acotado | Un papel predefinido «Scrum Master» para no montarlo a mano |
| **Avisos** | Ninguno | Aviso a los miembros al empezar y al cerrar un sprint; disparadores de automatización |

### Lo que se mueve de sitio (UX)

- [x] **R1 — La meta del sprint va en la franja**, junto al nombre. Es el
  artefacto que más se tiene que ver y hoy solo está en la vista Sprint.
- [x] **R2 — «Cerrar sprint» sube a la franja**, en un menú `⋯` del sprint
  junto a «Editar sprint». Hoy está al fondo de la vista Sprint, debajo del
  burndown, y en el móvil casi no se encuentra.
- [x] **R3 — La franja da la puerta a la vista Sprint en el móvil**: un botón
  «Sprint» explícito, no el nombre como enlace invisible (S11).
- [x] **R4 — La vista Sprint enseña las tareas**, agrupadas por persona, entre
  las barras y el burndown. Hoy dice cuántas hay por columna pero no cuáles,
  que es lo primero que se pregunta en la daily.
- [x] **R5 — El panel del backlog cambia «→ columna» por «Al sprint»**
  (entra en la primera columna), con la columna como opción secundaria; las
  filas se abren con un clic (S6).
- [x] **R6 — La pestaña del tablero cuenta lo del sprint en curso**, no el
  historial (S13).
- [x] **R7 — Tabla con selector de alcance**: *Sprint en curso · Backlog ·
  Todo · Sprint X*. El Kanban sigue siendo solo el sprint (D12 no se toca);
  Tabla y Calendario pasan a ser donde se ve el resto (S14).

### Decisiones que esta auditoría reabre (las toma el dueño del producto)

- **P1 — ¿Se vuelve a poder planear un sprint antes de empezarlo?** Reabre
  D14 y D16. **Recomendado: sí.** Cuando no hay sprint en curso, la vista
  Sprint pasa a ser *Planificar el siguiente*: backlog a un lado, el sprint a
  otro, con la suma frente a la velocidad, y «Empezar» fija el compromiso.
  Arregla S1 de raíz y da soporte al sprint planning, que hoy no existe.
  Si no, el mínimo es la gracia del primer día de S1.
- **P2 — ¿Tabla y Calendario enseñan todo el tablero con filtro (R7), o
  siguen solo con el sprint?** Recomendado: con filtro.
- **P3 — ¿Se fusiona antes de cerrar los críticos?** Recomendado: **no**. S1
  a S4 dan números falsos sin error, y S3 no se puede deshacer una vez que
  haya historial real reescrito.

### Orden propuesto

| Bloque | Qué | Por qué primero |
|---|---|---|
| **1 — Datos correctos** | S1, S2, S3, S4, S8, S9, con S19 (pruebas) a la vez | Dan números falsos o pierden tareas sin error. Condición para fusionar |
| **2 — Flujo básico** | S5, S6, S7, S10, S11, R1–R5 | Sin ellos un equipo no pasa del segundo sprint |
| **3 — Pulido** | S12–S18, S20–S22, R6, R7 | Inconsistencias y deuda de estilo |
| **4 — Lo que falta** | La tabla de arriba: daily por persona, review, retro, papel de Scrum Master, avisos | Producto nuevo; cada uno se decide aparte |

⚠️ **Datos de prueba que dejó la auditoría:** tres proyectos «Auditoria
Scrum…» en el espacio personal de `sofia@praxis.dev`, en la base local. Se
pueden borrar sin consecuencias.

### 2026-09-25 — Rediseño tras la auditoría

El dueño del producto pidió trabajar sobre las recomendaciones (P1: planear
antes de empezar, sí; P2: Tabla con filtro, sí; P3: no fusionar antes del
Bloque 1). Sale en D17–D20.

**Backend**

- `Sprint.startedAt` y el índice único parcial `sprints_one_active_per_board`
  (`20260925000000_sprint_started_at`); `Task.carryOverCount`
  (`20260925000001_task_carry_over`).
- `startSprint` exige Scrum encendido y traduce el P2002 a 409; un solo
  sprint planeado por tablero; `PATCH` y `DELETE` de sprint (de uno en curso
  solo el final; descartar solo uno planeado, devolviendo antes sus tareas al
  backlog).
- tasks-service: un sprint cerrado no admite tareas ni las suelta (409); el
  backlog excluye lo terminado; `task_sprint_metric_rows` sin tope de página.
- Gateway: el cierre orquesta crear-el-siguiente → reasignar → cerrar en una
  llamada y deshace el sprint creado si la reasignación falla; `GET
  …/sprints/metrics`; `POST …/sprints/:id/tasks` para meter en bloque; una
  tarea creada en una columna va al sprint en curso o, sin él, al planeado.
  Apagar Scrum con un sprint en marcha da 409.
- PRAX: regla actualizada (ya no hay vista Backlog); ventana de velocidad de
  3 sprints, la misma que la pantalla.

**Frontend**

- La página pide por alcance los tableros Scrum (sprint del tablero, backlog
  y métricas) en vez de las cien primeras tareas.
- `BacklogPanel`, `SprintStrip` y `SprintDialogs` sustituyen a
  `BacklogDrawer`, `SprintBanner`, `SprintPanel` y `SinSprintActivo`.
- `SlideOver`: `closeOnOutsideClick`, y dos paneles a la vez ya no se pisan
  el margen del `body` ni se cierran juntos con un Escape.
- El motor de arrastre ya no desplaza el tablero con el puntero fuera de la
  pista (sobre el panel).

**Pruebas:** `burndown.spec.ts` (8) y `sprints.service.spec.ts` (7), nuevas;
`09-scrum.spec.ts` reescrita para el flujo nuevo (3 casos). Pasan también
`08-panel-de-tarea` y `10-documentos`, y las suites unitarias de projects,
tasks, gateway, reports y web.

**Trampa que apareció:** marcar el `SlideOver` cerrado como `inert` rompe
`08-panel-de-tarea`, que comprueba el formulario del panel ya cerrado. Se
quitó; el backlog, en cambio, no pinta su contenido cerrado.

**Queda abierto**, a propósito:

- **S14 / R7** — Tabla con selector de alcance (sprint · backlog · todo). Hoy
  Tabla y Calendario enseñan el sprint del tablero.
- **S8, la mitad** — con Scrum apagado el historial de sprints no se ve (se
  conserva y vuelve al encender).
- **S15** — resumen de *sprint review* al cerrar y sprint cerrado navegable.
  El diálogo de cierre ya cuenta terminadas y pendientes, y Progreso enseña
  los anteriores.
- **S22** — atajos de estimación 1·2·3·5·8·13.
- **R4** — la daily agrupada por persona.
- Los contadores de la franja se actualizan al revalidar (~1 s tras soltar),
  no en el mismo fotograma que la tarjeta.
- La tabla «Lo que un equipo Scrum necesita» (retro, papel de Scrum Master,
  avisos) sigue siendo producto por decidir.

### 2026-09-25 — Pendientes cerrados (bloque 0 de la etapa 2 de Documentos)

- D21: panel del sprint, paneles que no se apilan, diálogos cálidos.
- S8: los sprints cerrados de un tablero sin Scrum se leen en su menú
  («Sprints anteriores»). S14/R7: Tabla y Calendario con Sprint · Backlog ·
  Todo. S15: `closeSummary` al cerrar. S22: atajos 1·2·3·5·8·13. R4: quién
  lleva qué, en el panel del sprint.
- **Arrastrar desde el backlog ya no desplaza el tablero solo.** Se entraba a
  la pista por su borde derecho, que es la franja de autodesplazamiento. Ahora
  se **arma** al pasar por el interior de la pista, o tras 450 ms quieto en el
  borde (`armarHorizontal` en `useArrastreDeTablero`).
- La cabecera del proyecto tenía `gap-3` en Espacios y `gap-6` en el resto:
  saltaba al cambiar de sección. `gap-4` en todas.
- ⚠️ **`biome check --write` sobre una carpeta entera reformatea archivos
  ajenos.** Se pasa solo sobre los archivos tocados.

