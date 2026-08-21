# Plan de Automatización — motor reactivo, asistente que siempre responde y poder para administración

> Etapa en curso. Se lee al retomar y se marca al terminar cada tarea.
> Continúa a [PLAN-REDISENO.md](PLAN-REDISENO.md), que quedó cerrado, y recoge
> además la deuda encontrada al auditar `feature/automation-service` el
> 2026-08-20.

## Dónde estamos

| Stack | Qué es | Estado |
|---|---|---|
| S1 | PRAX responde siempre | ✅ **hecho** (2026-08-20) |
| S2 | Motor de automatización | ✅ **hecho** (2026-08-20) |
| S3 | Interfaz de Automatización | ✅ **hecho** (2026-08-20) |
| S4 | Tablero — el slideout tras crear | ✅ **hecho** (2026-08-20) |
| S5 | Administración con más poder | ✅ **hecho** (2026-08-20) |
| S6 | Cierre — documentación, e2e, regresión | 🟡 **a medias** — ESTADO-ACTUAL §46 hecho |
| S7 | Pulido y capacidades nuevas | ⬜ pendiente |

**Cada stack termina con un aviso a quien encarga esto y una prueba manual desde
el frontend antes de pasar al siguiente.** Las pruebas de regresión
(`pnpm e2e:regresion`) **no se ejecutan hasta S6**: tardan demasiado para
correrlas entre stacks.

### Registro

| Fecha | Stack | Commit | Qué entró |
|---|---|---|---|
| 2026-08-20 | S3 | (pendiente) | «Automatización», iconos, constructor desplegable en vez de modal, catálogo del servidor, ejecuciones desplegables, y fuera los diálogos del navegador |
| 2026-08-20 | S2 | (pendiente) | El motor: 10 disparadores, 7 acciones que escriben, 8 operadores, catálogo por API, reglas reactivas de verdad, y la deuda de retención y duplicación saldada |
| 2026-08-20 | S1 | (pendiente) | El asistente deja de tragarse el motivo real, reintenta lo transitorio, responde en su burbuja cuando no puede pensar, y sabe escribir tablas y gráficas |

---

## El encargo, en una línea

Que las automatizaciones sirvan para algo —reaccionando a lo que pasa, no solo a
un botón—, que el asistente no vuelva a dejar a nadie sin respuesta, y que quien
administra la plataforma pueda borrar de verdad.

---

## Decisiones cerradas

Se cerraron en conversación el 2026-08-20. No se reabren sin un motivo nuevo.

### D1 — Las reglas reaccionan a eventos, no solo al botón

La tubería ya estaba construida y **desconectada**: `tasks-service` y
`projects-service` escriben en su `DomainOutbox`, un publicador la vuelca en el
stream de Redis `praxis:domain-events`, y `InboundEventConsumer` la copia a la
tabla `automation.inbound_events`… **que no lee nadie**. Se conecta.

«Revisar ahora» **no se retira**: sigue siendo la única forma de disparar los
triggers de barrido, y es lo que hace la sección demostrable sin esperar a que
ocurra algo.

### D2 — El actor de una acción es quien escribió la regla *(revisada al implementar)*

> ⚠️ **Esta decisión cambió al implementarla, y a mejor.** Lo acordado era un
> actor «sistema» con el permiso comprobado solo al guardar. Al escribir las
> acciones apareció que **`tasks-service` ya comprueba permisos por
> `requesterId` en cada escritura** (`assertPermission` →
> `project_check_permission`): no es el gateway quien los aplica, es el propio
> servicio. Así que las acciones viajan con `requesterId = rule.createdBy` y la
> comprobación en vivo sale gratis. Lo de abajo se conserva porque el candado al
> guardar **sigue existiendo** — ya no como única defensa, sino para dar el error
> cuando la persona está mirando.

### D2 (original) — El actor de una acción es el sistema, con el permiso comprobado al guardar

Una regla que mueve o asigna escribe **sin sesión de usuario detrás**. Las dos
salidas malas eran: un actor «sistema» que todo lo puede —un bypass de permisos
con corbata— o resolver permisos en cada ejecución, que es una llamada más por
tarea candidata.

Lo que se hace: **actor `SYSTEM`** (el `DomainEventActorType` ya lo contempla),
pero al **guardar** la regla se comprueba que quien la crea tiene el permiso que
cada acción necesita:

| Acción | Permiso exigido al creador |
|---|---|
| `CREATE_NOTIFICATION` | ninguno más allá de `canManageAutomations` |
| `ASSIGN_TASK`, `MOVE_TASK`, `SET_PRIORITY`, `ADD_LABEL` | `canEditTask` |
| `ADD_COMMENT`, `POST_CHAT_MESSAGE` | `canComment` |
| `CREATE_TASK` | `canCreateTask` |

Si el creador pierde ese permiso más tarde, la regla **se pausa sola** con
`status = PAUSED_SYSTEM` y un `pauseReason` que lo explica. El esquema ya traía
los dos campos: estaban esperando exactamente esto.

⚠️ **No es lo mismo que ligar la acción a una persona.** No se ejecuta «como»
nadie: se ejecuta como el sistema, y `createdBy` queda solo para auditoría y
para este candado.

### D3 — «Reglas» pasa a llamarse «Automatización», y la URL va en inglés

En pantalla, **Automatización**. En la URL, `?tab=automation`. Los dos alias
anteriores (`?tab=reglas`, `?tab=automatizaciones`) siguen aterrizando ahí: un
enlace compartido no puede morir por un renombre. Las e2e se actualizan.

### D4 — Nada de diálogos del navegador, nada de modales para crear

`confirm()` y `alert()` fuera. Todo se resuelve **dentro del propio elemento**:
la confirmación de borrado vive en la tarjeta de la regla, y el aviso de cambios
sin guardar vive en el pie del formulario. El constructor deja de ser un modal y
pasa a ser **una sección que se despliega animada dentro de Automatización**,
con el estándar de la página de proyecto (secciones Espacios y Equipo son la
referencia). Lo mismo para Ejecuciones: fila que se despliega con el detalle, no
una tabla plana.

### D5 — Markdown seguro, sin motor de terceros

`ModelText.tsx` ya pinta encabezados, viñetas, numeraciones, negrita, cursiva y
bloques de código, y lo hace **sin interpretar HTML en ningún punto** — es la
razón de que no haya una librería. Se amplía con **tablas** y con un bloque
cerrado de **gráfica** que se pinta en SVG. Se mantiene la regla: ni un solo
`dangerouslySetInnerHTML`, y lo que no se reconoce se deja como texto.

### D6 — Un usuario borrado se borra; su trabajo se queda

Borrado **real** de la fila de `credentials`, pero las tareas, comentarios y
mensajes que dejó **no se tocan**: se leen como «Usuario eliminado». Borrar en
cascada rompería tableros de proyectos ajenos que no tienen nada que ver.

---

## Invariantes — lo que este trabajo NO puede romper

1. **La IA propone; nunca ejecuta.** Vale también para las acciones de una
   regla: una regla no abre ninguna ruta de escritura nueva, llama a las que ya
   existen. Si una capacidad nueva necesita un endpoint nuevo de escritura, está
   mal planteada.
2. **Una regla no puede dar más poder del que tiene quien la creó.** D2.
3. **Ningún recorte mudo.** Si una revisión ignora candidatas, la interfaz lo
   dice. `tareasOmitidas` existe por esto.
4. **El código en inglés, los comentarios en español.** Y no se renombra con
   `sed` global: «regla» es una palabra del español corriente.
5. **Confirmar contra el `data` de la respuesta, no contra el status.**
6. **El asistente responde siempre.** Un fallo de infraestructura se cuenta en
   la burbuja de PRAX, no como un error rojo que deja la conversación muda.

---

## S1 — PRAX responde siempre

> El más urgente y el más aislado. Sale de un caso real: en local tres
> conversaciones seguidas sin un fallo; en la versión desplegada, **ni una sola
> respuesta**, desde el primer «Hola».

### El diagnóstico, entero

1. `gemini.client.ts` lanza `GeminiError` cuando Google falla, con un mensaje
   específico por caso —503, timeout de 45 s, bloqueo de seguridad, 429 por
   minuto y 429 por tope de gasto, que **no son el mismo problema**.
2. `assistant.service.ts:385` lo captura y, como `GeminiError` **no** es
   `RpcException`, lo tira y lanza `RpcException({ statusCode: 500, message:
   'Error del asistente.' })`.
3. `AssistantService.comoRpc()` (línea 1410) existe justo para traducir
   `GeminiError` → **502 con el mensaje real**. Nunca llega a verlo.
4. `commons/assistant/helpers.ts:43`: `if (error.status >= 500 && error.status
   !== 502) return fallback`. El 502 habría pasado el mensaje. El 500 lo
   sustituye por «El asistente no ha podido responder. Inténtalo otra vez.»

Es exactamente el texto de las capturas. **El trabajo fino de
`mensajeDelFallo()` es código muerto en el camino del chat.**

Y encima **no hay ni un reintento**: una sola llamada, y un 503 transitorio de
`gemini-flash-latest` sale como un error en la cara.

### Sobre la versión desplegada

Descartado: la salida a internet. El `README` de despliegue avisa de que sin NAT
no se puede llamar a Gemini; `praxis-nat` existe y está activo en
`praxis-router` / `us-east1`.

El modelo es el mismo en los dos sitios (`gemini-flash-latest`). Lo único
distinto es **la clave**: la desplegada sale de Secret Manager
(`praxis-gemini-api-key`, versión 2 del 2026-08-07). Si está caducada,
restringida o con el tope de gasto agotado, el síntoma es exactamente «no
responde nunca» — y el bug del punto 2 es lo que impide verlo.

**Comprobación pendiente (la corre quien administra, no el agente):**

```bash
gcloud secrets versions access latest --secret=praxis-gemini-api-key | head -c 8
grep '^GEMINI_API_KEY=' apps/backend/services/assistant/.env | cut -d= -f2- | head -c 8
```

No bloquea S1: el arreglo del tragado revela la causa por sí solo.

### Tareas

- [x] **S1.1** Quitar el `catch` que traga en `chat()`. Que `GeminiError` llegue
      a `comoRpc()` y salga como 502 con su mensaje. Conservar el
      `conversationId` en `details`, que es para lo que estaba ahí.
- [x] **S1.2** ~~Lo mismo en `borradorDePlantilla()`~~. **No hacía falta**: ese
      método no envuelve la llamada a Gemini en ningún `try`, así que el
      `GeminiError` ya subía hasta el controlador y salía como 502 con su
      mensaje. El camino roto era solo el de `chat()`.
- [x] **S1.3** Reintento con espera creciente y jitter en `GeminiClient.chat()`,
      **solo** para lo que es transitorio: 503, 500 de Google, timeout, red
      caída. Un 429 por tope de gasto o un bloqueo de seguridad **no se
      reintentan** — reintentar contra un muro es peor que decir que no.
- [x] **S1.4** Modelo de respaldo: si el primario sigue caído tras los
      reintentos, un segundo modelo configurable (`GEMINI_MODEL_FALLBACK`).
      Silencioso para quien pregunta.
- [x] **S1.5** Última red: si aun así no hay respuesta, PRAX contesta **en su
      burbuja**, con lo que de verdad ha pasado, en vez de dejar la
      conversación muda con un error rojo. Sin consumir cuota.
- [x] **S1.6** Registro estructurado del motivo real (status de Google,
      `finishReason`, `blockReason`, modelo, intentos) para que la próxima vez
      no haya que deducirlo.
- [x] **S1.7** El turno de recuperación cuesta una llamada extra; que quede en
      el log cuándo salta, porque hoy no se ve y es el doble de factura.
- [x] **S1.8** Tablas en `ModelText.tsx`, con el mismo método seguro.
- [x] **S1.9** Gráficas: bloque cerrado que PRAX emite y el cliente pinta en
      SVG. Nada de librerías ni de HTML interpretado.
- [x] **S1.10** Quitar el botón «Seguir aquí con X» de `ProposalCard.tsx:1788`.
      Un proyecto recién creado no tiene contexto del que hablar.
- [x] **S1.11** Pruebas de los caminos de fallo: 503 reintentado, 429 no
      reintentado, tope de gasto con su mensaje propio.

### Apuntes

**El `catch` era el fallo, no el modelo.** El arreglo de fondo es una línea:
`AssistantService.comoRpc(error, { conversationId })` en vez de un
`RpcException` de 500 escrito a mano. `comoRpc` ya sabía clasificar; nadie la
dejaba llegar. El resto del stack existe para que ese motivo, ahora que llega,
valga para algo.

**El 502 no es un detalle de estilo.** `describe()` en el cliente deja pasar el
mensaje del servidor en los 4xx y en el 502, y lo sustituye por uno genérico en
el resto de los 5xx. El código de estado es literalmente lo que decide si el
mensaje llega a la pantalla. Queda anotado en el JSDoc de `comoRpc` para que
nadie lo «simplifique» a un 500.

**Un 4xx de Gemini no se reintenta, y es deliberado.** La tentación era
reintentarlo todo. Pero una clave inválida o restringida no cambia entre dos
intentos separados por medio segundo: reintentarla solo esconde el diagnóstico
detrás de tres veces más de espera — que es exactamente el caso de la versión
desplegada. Ahora ese caso dice «El asistente no está bien configurado en esta
instalación», que es una frase con la que alguien puede hacer algo.

**Los dos 429 siguen separados** —límite por minuto y tope de gasto— y ninguno
se reintenta: el primero no se pasa en los dos segundos que dura un backoff.

**La burbuja degradada no se guarda.** El turno fallido no llega a la base:
`guardarTurno` va al final de `chat()` y nunca se alcanza. Al recargar no está,
que es lo correcto — no pasó nada. Lo que sí queda es el botón «Reintentar»
mientras la pantalla siga abierta, con la pregunta y los archivos intactos.

**Las gráficas necesitaban la regla del prompt para existir.** El cliente podía
pintarlas desde el primer commit y no habría salido ni una: el modelo no puede
adivinar qué entiende el otro lado. La regla lleva freno explícito —tabla o
gráfica solo a partir de tres cosas comparables— porque un modelo al que le
dices que sabe dibujar dibuja siempre, y eso se paga en tokens en cada turno.

**Comprobado:** `pnpm --filter @praxis/assistant-service test` → 9 de 9 en
verde, y son las **primeras pruebas que tiene el servicio**. `tsc` del servicio,
0 errores. `tsc` de `commons`, 36 errores, exactamente los mismos 36 que había
antes de tocar nada (`exactOptionalPropertyTypes`, todos en código ajeno a este
trabajo).

**Sigue pendiente y no lo puede hacer el agente:** comparar la clave desplegada
con la local. El clasificador bloquea la lectura del secreto, con razón.

---

## S2 — Motor de automatización

### Tareas

- [x] **S2.1** El race del `causeKey`. `direct-execution.ts:107` hace
      `findUnique` y luego `create` sin transacción ni captura del P2002: dos
      «Revisar ahora» a la vez y el segundo revienta con un 500. Se resuelve con
      la restricción única como árbitro, no con una lectura previa. **Con prueba
      de concurrencia**, que hoy no hay ninguna.
- [x] **S2.2** Conectar el consumidor: que un evento de `inbound_events` busque
      reglas del proyecto y las evalúe. Es el corazón de D1.
- [x] **S2.3** Triggers de barrido nuevos: `TASK_OVERDUE`, `TASK_UNASSIGNED`.
- [x] **S2.4** Triggers reactivos sobre eventos que **ya se emiten**:
      `task.created`, `task.moved`, `task.completed`, `task.reopened`,
      `task.assignees-changed`.
- [ ] **S2.5** ⚠️ **No entró, y se decidió a la vista del código.** Emitir
      «prioridad cambiada» y «comentario añadido» obliga a tocar las
      transacciones de `tasks-service`, que es el servicio más caliente del
      sistema, para dos disparadores que ninguna regla ha pedido todavía. Los
      diez que sí entraron van sobre hechos **que ya se emiten**, así que el
      riesgo era todo para el lado de estos dos. Queda anotado y es media hora
      cuando se quieran.
- [x] **S2.6** Condiciones nuevas, emparejadas con cada trigger, y operadores
      que faltan: hoy solo hay `EQUALS`, `NOT_EQUALS` e `IN`, así que una
      condición sobre `staleDays` obliga a acertar el número exacto. Entran
      `GT`, `GTE`, `LT`, `LTE`, `CONTAINS`.
- [x] **S2.7** Las siete acciones nuevas, con el candado de permisos de D2 y
      llamando a los endpoints que ya existen.
- [x] **S2.8** Auto-pausa con motivo cuando el creador pierde un permiso.
- [x] **S2.9** Endpoint de catálogo (`GET .../automations/catalog`), que retira
      el catálogo quemado del frontend. Pendiente §1 del documento de pendientes.
- [x] **S2.10** El título de la tarea en `RuleExecution`, y contar las saltadas
      en el resumen de la revisión. Pendientes §3 y §4.
- [x] **S2.11** Dejar de guardar el volcado completo de la regla en cada
      ejecución. Pendiente §5.
- [x] **S2.12** Retención: `domain_outbox` no se purga nunca tras publicar,
      `inbound_events` tampoco, y el `xadd` va sin `MAXLEN` (un `XACK` no borra
      del stream). Tres depósitos que solo crecen.
- [x] **S2.13** El publicador del outbox está duplicado **byte a byte** entre
      `tasks` y `projects` —difieren en el nombre de la clase— más sus dos specs
      de 250 líneas. A un sitio compartido.
- [x] **S2.14** `purgeProject` borra las reglas de un proyecto eliminado pero
      deja sus `inbound_events`.

### Apuntes

**El catálogo es ahora la fuente única.** `catalog.ts` en el servicio: qué
disparadores hay, de qué familia es cada uno, qué campos admite filtrar, con qué
operadores, y qué acciones existen con el permiso que exigen. Lo leen el
validador, el motor y —por `GET .../automations/catalog`— el frontend. Antes eso
vivía en tres sitios que tenían que coincidir sin que nada lo comprobara.

**La correspondencia hecho → disparador estaba mal escrita.** El mapa anterior
decía que `TASK_DUE_SOON` reaccionaba a cinco hechos, y es un disparador de
**barrido**: describe un estado, no un instante. Con el flujo conectado, esa
entrada habría hecho que «va a vencer» se disparara al crear cualquier tarea,
tuviera fecha o no. Hay una prueba que cruza los `eventType` del catálogo contra
lo que `tasks-service` emite de verdad — es la avería más cara posible aquí,
porque no da ningún error: la regla se ve habilitada y no salta nunca.

**Un campo que no existe en el contexto no cumple ninguna condición**, ni
siquiera negada. `undefined !== 'HIGH'` es cierto en JavaScript, así que una
condición sobre un campo mal escrito habría pasado **siempre** y la regla habría
actuado sobre el proyecto entero.

**El freno de bucle.** Una regla que mueve una tarea emite un hecho de
movimiento, que despierta a las reglas de movimiento. Dos reglas que se empujan
giran para siempre, y la idempotencia por causa no las para: cada vuelta tiene un
contexto distinto, así que es una causa distinta de verdad. No hay forma barata
de detectar el ciclo —`causationId` no sobrevive al salto por RPC— así que hay un
techo de 20 automatizaciones por tarea y hora. **No es correctitud, es un
fusible**, y cuando salta lo deja escrito en la ejecución.

**Asignar y etiquetar acumulan.** `task_assign` y `labelIds` sustituyen la lista
entera —es lo que hace un selector múltiple al cerrarse—, así que mandar solo el
nuevo habría echado en silencio a todos los demás encargados.

**Mover resuelve antes si la columna es de cierre.** El color vive en
`projects-service` y `tasks-service` no lo ve; en la pantalla ese cruce lo hace
el gateway. Sin él, mover a la columna verde deja `completedAt` sin poner: la
tarea se ve terminada, **no cuenta como cerrada en los informes** y sigue
avisando de que va a vencer.

**Guardar y actuar son dos pasos.** El consumidor copia el hecho y confirma al
stream; evaluar las reglas se hace después, leyendo de la tabla. Si fueran lo
mismo, un `tasks-service` lento bloquearía la lectura del stream, el `XACK` no
llegaría, Redis daría el mensaje por huérfano y otro consumidor lo reclamaría
**mientras el primero sigue ejecutando acciones**.

**Tres depósitos dejaron de crecer sin fin:** `domain_outbox` purga lo publicado
a los 7 días, `inbound_events` purga lo atendido igual, y el `xadd` lleva
`MAXLEN ~ 50000` — un `XACK` **no borra del stream**, y este Redis es también el
de las sesiones.

**Comprobado:** automation 96/96 (antes 41), `@praxis/domain-events` 7/7, tasks
20/20, projects 59/59. `tsc` limpio en gateway, tasks, projects, automation y
assistant.

---

## S3 — Interfaz de Automatización

### Tareas

- [x] **S3.1** Renombre a «Automatización» y `?tab=automation`, con los dos
      alias vivos. D3.
- [x] **S3.2** Iconos a la izquierda del nombre en las cuatro secciones:
      Espacios, Equipo, Roles y Automatización — esta última con un rayo o un
      flujo. `TabNav` vive en `commons`: la prop es opcional para no tocar a las
      demás zonas que lo usan.
- [x] **S3.3** El constructor deja de ser un modal: sección desplegable animada
      dentro de la propia pestaña, al estándar de Espacios y Equipo. D4.
- [x] **S3.4** El constructor, más claro: qué dispara, qué filtra, qué hace —
      leyéndose como una frase, con el catálogo del backend (S2.9) mandando.
- [x] **S3.5** Fuera el aviso de cambios sin guardar del navegador; en su lugar,
      un pie dentro del propio formulario.
- [x] **S3.6** Ejecuciones: fila desplegable con el detalle —qué tarea, qué
      condición falló, qué acción se ejecutó—, no una tabla plana.
- [x] **S3.7** Que el servicio caído deje de parecer «no tienes reglas».
      `page.tsx:206` hace `.catch(() => [])`, que es el recorte mudo que este
      repositorio prohíbe en cualquier otro sitio.

### Apuntes

**🔴 La animación de Equipo llevaba meses sin existir.** El panel de «Invitar
persona» —la referencia de diseño que se pidió imitar— usa `animate-in
slide-in-from-top-4 fade-in duration-300`, que son utilidades del plugin
`tailwindcss-animate`… **que este repositorio no tiene instalado**. Tailwind no
genera nada para una utilidad que no conoce y no avisa: el código decía que se
deslizaba y aparecía de golpe. Se sustituyó por `.animate-desplegar-panel` en
`theme.css`, que anima `grid-template-rows` de `0fr` a `1fr` —abre hasta el alto
real sin medirlo en JavaScript ni fijar un `max-height` a ojo— y se aplicó
también al de Equipo.

**El catálogo del frontend era un espejo, y los espejos se rompen.**
`automation-catalog.ts` tenía la lista de disparadores escrita otra vez a mano.
Cuando el servidor pasó de dos a diez, este archivo seguía ofreciendo dos y
**nada fallaba** — no hay compilación que avise de que un formulario ofrece de
menos. Ahora llega por `GET .../automations/catalog` y aquí solo quedan los tipos
y las lecturas. Lo mismo en `commons/api/domain.ts`: `AutomationTriggerType` y
`AutomationActionType` pasan de unión cerrada a `string`, a propósito.

**El catálogo no viaja del cliente al servidor.** `saveAutomationRuleAction` lo
vuelve a pedir en el servidor en vez de aceptar el que mande el formulario:
recibirlo del navegador sería dejar que quien envía redefina las reglas con las
que se valida su propio envío.

**Las acciones llevan su configuración como JSON, en una entrada por acción.**
Se recomponen por posición, igual que las condiciones; emitir un campo por cada
clave rompe la alineación en cuanto dos acciones tienen distinto número de
campos — que es lo normal con siete.

**Los disparadores van agrupados por familia** («pasa solo» / «al revisar») y no
en un desplegable único. La diferencia entre reactivo y de barrido no se deduce
del nombre —«se mueve una tarea» y «lleva parada» se leen igual de inmediatos— y
mezclarlos hacía que media regla naciera esperando algo que no iba a ocurrir.

**Un id crudo en una frase la vuelve inservible.** «Columna es 3f2a…-9c11» es
cierto y no sirve para comprobar nada, así que las columnas, etiquetas y personas
se resuelven a su nombre con las listas que la página ya tiene. Ninguna consulta
nueva: las columnas vienen embebidas en `GET /projects/:id` y el resto ya se pedía.

**Una regla pausada por el sistema dice por qué.** Sin el texto de
`pauseReason`, `PAUSED_SYSTEM` se ve igual que «alguien la apagó» — así que se
volvería a activar para volver a pausarse en la siguiente ejecución.

**Comprobado:** `projects-front` 62/62. `tsc` de `projects-front`, 0 errores;
`commons`, los mismos 36 de siempre.

---

## S4 — Tablero: el slideout tras crear

- [x] **S4.1** Al crear una tarea —que solo pide nombre—, abrir su panel de
      detalle con la tarea ya seleccionada.
- [x] **S4.2** Lo mismo en móvil.

### Apuntes

**No hizo falta navegar a `?task=`.** El panel no se abre por la URL: `?task=`
solo **siembra** el estado inicial de `BoardColumns`, y a partir de ahí abrir y
cerrar es estado local. Meter una navegación por medio habría metido un render
del App Router —y su cola, la del girador eterno— en un gesto que no lo
necesita.

**El id no basta para abrir el panel.** La acción confirma con el id, pero el
panel pinta la columna, las etiquetas y los encargados: necesita la tarea
entera, que llega con el siguiente render del Server Component. Se apunta el id
y se abre en cuanto aparece en `tasks`; si no llegara nunca, se queda a `null` y
no hay panel a medio abrir esperando datos que no vienen.

**Móvil y escritorio salen del mismo cambio.** Los dos diseños montan
`ColumnTasks` y los dos abren con `setOpenTask`, así que el aviso de creación se
enchufa una vez por diseño y el panel es el mismo componente.

⚠️ **Esto cambia un gesto deliberado.** El alta rápida vaciaba el campo y
devolvía el foco para escribir varias seguidas sin tocar el ratón. Seguía
funcionando —cerrar el panel deja el formulario abierto y con el foco— pero es
una tecla más por tarea. A cambio, ninguna tarea se queda con solo el título.

---

## S5 — Administración con más poder

- [x] **S5.1** `DELETE /admin/users/:id`, conservando su trabajo.
- [x] **S5.2** `DELETE /admin/projects/:id`, con la purga de los otros servicios.
- [x] **S5.3** Confirmación escribiendo el nombre, con el inventario delante.
- [x] **S5.4** El icono de acciones pasa de tres puntos a un engranaje.

### Apuntes

**Borrar una cuenta se niega si todavía es dueña de algún proyecto, y dice
cuáles.** Un proyecto sin dueño **sí** rompe cosas: `ownerId` es lo que resuelve
los permisos, lo que decide a quién avisan las automatizaciones y lo que la
pantalla de administración enseña en su columna. Un id que no existe deja ese
proyecto sin nadie que pueda administrarlo y sin forma de arreglarlo desde la
interfaz. Hizo falta un `project_find_owned` para poder comprobarlo — y devuelve
el nombre, porque el mensaje tiene que decir cuáles.

**Su trabajo se queda, y la interfaz tenía que saber leerlo.** Varios sitios
caían al UUID cuando el perfil no resolvía, y en pantalla eso es «3f2a…-9c11
salió del proyecto». Ahora hay `PERSONA_ELIMINADA` en commons y esos tres sitios
la usan. `TaskCard` y los informes ya lo hacían bien por su cuenta.

**El diálogo enumera lo que se lleva y lo que se queda.** «Esta acción no se
puede deshacer» no dice nada útil: quien administra ya sabe que un borrado no se
deshace; lo que no sabe es hasta dónde llega. Y lo que se **conserva** es la
mitad del mensaje — sin ella, quien administra cree que borrar una cuenta vacía
los tableros donde esa persona trabajó, y no borra nunca.

**El borrado de proyecto reutiliza `TaskPurgeService` y `AutomationPurgeService`**,
los mismos que usa el `DELETE` del dueño. Repetir las llamadas habría dejado dos
sitios que olvidar cuando aparezca un tercer servicio con datos de proyecto.

**Dos verbos nuevos en el registro de administración** (`USER_DELETED`,
`PROJECT_DELETED`) con su migración: sin ellos, el borrado más grave que existe
no dejaría rastro o se confundiría con archivar.

---

## S6 — Cierre

- [ ] **S6.1** ESTADO-ACTUAL, CONTRATO-API y CLAUDE.md al día. La línea de
      puertos de CLAUDE.md todavía no menciona `automation :3008`; el README sí.
- [ ] **S6.2** Marcar en PENDIENTES-BACKEND-AUTOMATIZACION lo que este plan
      resuelve.
- [ ] **S6.3** e2e actualizadas: las 24 de Automatización buscan el texto
      «Reglas», y hay dos ficheros con el prefijo `15-`.
- [ ] **S6.4** Revertir el `.gitignore` que se coló en la rama: ignora `.claude`
      y saca `skills-lock.json` del control de versiones, y no tiene nada que ver
      con automatizaciones.
- [ ] **S6.5** Separar las specs de integración de las unitarias. Desde esta
      rama exigen Postgres y Redis vivos y están en el mismo `jest`, así que
      `pnpm test` dejó de correr en seco — en `main` no había ninguna.
- [ ] **S6.6** `pnpm e2e:regresion` y `pnpm e2e:seguridad`. **Solo aquí.**

### Apuntes

_(se rellena conforme se trabaja)_

---

## S7 — Pulido y capacidades nuevas

> Sale de probar S1–S5 en vivo el 2026-08-20. Cada punto lleva **lo que ya está
> hecho** y **lo que cuesta**, porque dos de los cinco eran preguntas y una ya
> estaba resuelta a medias.

### S7.1 — El rayo y el color, también en el toast

- [ ] Los diez tipos `AUTOMATION_*` en `PRESENTACION_POR_TIPO`
      (`commons/organisms/LiveNotices/styles.ts`).

**Estado: medio hecho, y la otra mitad es barata.** En la **bandeja** del panel
ya está: `TypeIcon` tiene su rama `AUTOMATION_` con el rayo y `TYPE_TONE` da un
tono por tipo (S1 de esta etapa).

Lo que falta es el **toast**. `PRESENTACION_POR_TIPO` es un diccionario por tipo
de aviso, y los diez de automatización no están en él: caen a
`PRESENTACION_POR_DEFECTO`, que es `tipo: 'info'` y título «Aviso». Así que un
aviso de automatización sale con el mismo aspecto que cualquier otro.

⚠️ **No se resuelve con `startsWith('AUTOMATION_')`.** El diccionario decide
cuatro cosas —estado de color, título, duración y ritmo de despliegue— y no todas
se parecen: `AUTOMATION_TASK_OVERDUE` quiere `warning` y quedarse; uno de tarea
creada es `info` y pasa. Son diez entradas de cuatro líneas, y por eso el fichero
es un diccionario y no un `switch`: es exactamente el caso para el que existe.

**Coste: bajo.** Un archivo, sin migración, sin contrato.

### S7.2 — La lista de reglas no tiene límite

- [ ] Decidir un techo y decirlo, o paginar.

**Respuesta: no, ninguno.** `RulesService.list()` hace
`findMany({ where: { projectId } })` sin `take`, y el gateway lo devuelve entero.

No es urgente —un proyecto con más de veinte reglas no es realista hoy— pero **es
un listado sin techo que además se pide en cada carga de la página de proyecto**
desde que el contador de la pestaña se resuelve siempre (S7 de la corrección de
S3). Lo barato es un `take` generoso con aviso cuando se alcanza: la regla de
esta casa es que **un recorte mudo es peor que no recortar**, así que si se
acota, la pantalla lo dice.

**Coste: bajo si es un techo con aviso. Medio si se pagina de verdad** —el
constructor y la tarjeta viven en la misma lista, así que paginar obliga a
decidir qué pasa al editar la última de una página.

### S7.3 — Las ejecuciones no tienen paginador

- [ ] Paginar, o al menos decir que se está viendo un recorte.

**Respuesta: no.** `AutomationEngineService.recent()` acepta `limit` con tope de
50, pero **el gateway lo fija en 20** y no expone el parámetro. No hay `page`, no
hay `total`, y la pantalla no dice que sean las últimas veinte de un histórico
más largo.

🔴 **Esto sí es un recorte mudo**, y es de los que engañan: quien mire las
ejecuciones para comprobar por qué una regla no actuó puede estar mirando una
ventana que no llega hasta el caso que busca, y nada se lo dice. Con el motor
reactivo el histórico crece mucho más deprisa que antes —una fila por hecho, no
por pulsación de botón— así que el problema es nuevo y va a doler pronto.

**Lo mínimo:** que el listado diga «las últimas 20» y traiga el total.
**Lo bueno:** paginar, y filtrar por regla y por estado — «enséñame los fallos»
es la consulta que de verdad se hace.

**Coste: medio.** Toca `recent()`, el gateway, el tipo del cliente y la pantalla.
Sin migración.

### S7.4 — Que PRAX ayude a escribir automatizaciones

- [ ] Herramienta `proponer_automatizacion`, con su validación y su tarjeta.

Es la más grande de las cinco y la que más aporta. La forma **ya está decidida
por las reglas de la casa**: el asistente propone, nunca ejecuta. Así que:

1. Una herramienta nueva en `tools.ts` que devuelve **la misma forma que acepta
   `POST /automations`**: nombre, disparador con su configuración, condiciones y
   acciones.
2. Validarla en `assistant-service` contra el **catálogo real**, igual que
   `validarPropuesta` valida hoy los ids contra el briefing. Una regla con un
   disparador inventado o una columna que no existe se descarta antes de llegar
   a la pantalla.
3. Una tarjeta de propuesta que enseñe la regla **en la frase de siempre**
   —«Cuando…, si…, entonces…»— y no un JSON, y un botón que llama a
   `POST /projects/:id/automations` con la sesión de quien acepta, por el mismo
   endpoint y con el mismo permiso que el constructor.

⚠️ **El catálogo tiene que viajar en el prompt, y eso se paga en cada turno.**
Diez disparadores con sus campos y siete acciones no son gratis. Antes de darlo
por bueno hay que medirlo:
`pnpm --filter @praxis/assistant-service medir-prompt <projectId>`. Si pesa
demasiado, la salida es mandar **solo los nombres** y que el modelo pida el
detalle del disparador que ha elegido — pero eso es un turno más, así que se
decide con el número delante, no antes.

⚠️ **Y solo en el modo con proyecto.** Una regla cuelga de un proyecto, sus
columnas y su gente; sin foco no hay contra qué validarla. La herramienta lleva
`ambito: 'proyecto'`.

⚠️ **Exige `canManageAutomations`, no `canViewReports`.** El chat de proyecto se
abre con lo segundo, así que la herramienta se filtra por permisos como las otras
doce: quien no pueda administrar automatizaciones no debe ver la tarjeta —
aceptarla le daría un 403 y una explicación que no puede resolver.

**Coste: alto.** Contrato, servicio, prompt, validación, tarjeta, acción de
aceptar y pruebas. Es un stack por sí solo.

### S7.5 — La burbuja de no leídos del chat

- [ ] Mismo estilo que el resto de contadores, y que se actualice al instante.

Dos cosas distintas metidas en una:

- **El estilo** es barato: hay un patrón de contador en `TabNav` (la píldora
  `bg-primary-muted`) y otro en la bandeja. Unificar es elegir uno y usarlo.
- **«Al instante» no lo es tanto.** Ese número sale del render del servidor, así
  que hoy se actualiza cuando la página se revalida. Para que cambie solo hace
  falta engancharlo al flujo de eventos en vivo, que **ya existe y ya recibe los
  mensajes de chat** (`useLiveEvent`, `CHAT_MESSAGE`). Es leer lo que ya llega y
  llevar la cuenta en el cliente hasta la siguiente revalidación.

⚠️ **`CHAT_MESSAGE` viaja por el flujo de avisos pero NO es un
`NotificationType`** y no deja fila en la bandeja (CLAUDE.md, trampa 14). Quien
enganche esto tiene que tratar el `type` del flujo como texto libre.

**Coste: bajo el estilo, medio lo instantáneo.**

### S7.6 — «Automatización» → «Automatizaciones»

- [ ] La etiqueta de la pestaña, en plural.

**La URL no cambia.** `?tab=automation` es un identificador y va en inglés; lo
que se renombra es lo que se lee. Cambia una línea de `TABS` en `page.tsx` y los
textos de las e2e que buscan la pestaña por su nombre.

**Coste: mínimo.**

---

## Cómo retomar esto en frío

1. Leer «Dónde estamos» y el registro.
2. Las migraciones de automatización **tienen que estar aplicadas** o las
   pruebas del servicio fallan con `The table automation.inbound_events does not
   exist in the current database`. Se arregla con `pnpm prisma:deploy`, nunca
   con `prisma:reset` (borra las tablas) ni con `db:push` (no existe en este
   repositorio).
3. El stack en curso es el primero sin marcar. Dentro de un stack, la primera
   tarea sin marcar.
4. No ejecutar la regresión hasta S6.
