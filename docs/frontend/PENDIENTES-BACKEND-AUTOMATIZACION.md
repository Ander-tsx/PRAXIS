# Pendientes del equipo de backend — Automatizaciones académicas

> Igual que [PENDIENTES-BACKEND.md](PENDIENTES-BACKEND.md), pero acotado al MVP de
> automatizaciones (Reglas). Se separa aparte porque nace de una sola tarea —el
> apartado Reglas del proyecto— y así se puede pasar al equipo de backend sin
> arrastrar el resto de pendientes del frontend.
>
> Escrita por el equipo de frontend; **no modificamos `apps/backend/`** salvo
> autorización explícita y cambios mecánicos sin decisión de negocio.
>
> Última revisión: 2026-08-20 · gateway en `localhost:3000` · verificado contra
> el stack levantado con `e2e/tests/api/17-automatizaciones.spec.ts`.
>
> **Estado: 4 de 6 resueltos** (§1, §3, §4 y §5, en `4a2f26a`). Los dos que
> quedan no bloquean nada: el §2 obliga a un rodeo —lee-modifica-escribe para
> activar o desactivar— y el §6 deja `TASK_STALE` sin prueba de punta a punta.

---

## Cómo leer esta lista

| Severidad | Significado |
|---|---|
| 🔴 Crítico | Fallo de seguridad o de corrección. Debe arreglarse antes de producción |
| 🟠 Alto | Bloquea o deforma una pantalla que tenemos que construir |
| 🟡 Medio | Nos obliga a un rodeo, pero hay forma de avanzar |
| 🔵 Bajo | Inconsistencia o deuda. No bloquea nada |

**La numeración es estable y no se reordena.** Se cita desde el código y desde
`.planning/PLAN-FRONTEND-REGLAS-IMPLEMENTACION.md` (`Ver
PENDIENTES-BACKEND-AUTOMATIZACION.md §2`), así que los puntos nuevos se añaden
al final con su severidad en el título.

---

## Resumen

Los cinco primeros son de 2026-08-19, detectados al construir el apartado
Reglas de automatización (`.planning/PLAN-FRONTEND-REGLAS-IMPLEMENTACION.md`,
Bloque 1). Ninguno bloqueaba: el 1 y el 2 obligaban a un rodeo (catálogo
duplicado en el frontend, lee-modifica-escribe para activar/desactivar); el 3 al
5 eran huecos de auditoría, que se mostraba recortada mientras tanto.

**El 1, el 3, el 4 y el 5 los cerró la etapa de automatización** (`4a2f26a`,
S2.9 a S2.11 de [PLAN-AUTOMATIZACION.md](PLAN-AUTOMATIZACION.md)), y con
autorización para tocar `apps/backend/` — igual que el resto de esa etapa. Cada
uno lo explica en su punto.

El 6 es de 2026-08-20 y salió al revisar el apartado terminado
(`.planning/PLAN-CORRECCION-REGLAS.md`, corrección C3): `TASK_STALE` no se
puede llevar hasta el aviso desde una prueba, así que la mitad del catálogo
del MVP se queda sin verificación de punta a punta. Tampoco bloquea, pero es
el que más pesa en una demostración.

Un sexto hallazgo de la misma sesión —`task_inventory` cambió de array a
`{ tareas, omitidas }` sin que `automation-service` se actualizara, y tronaba
con 500 en toda revisión `TASK_DUE_SOON`— **no está en esta lista**: era un
bug, no un hueco de diseño, y era un cambio mecánico sin decisión de negocio,
así que se arregló directo. Ver PENDIENTES-BACKEND.md, tabla «Cambios que
hicimos en `apps/backend/`, con autorización», fila `57f33d4`.

---

## ✅ 1. ~~No hay endpoint de catálogo para triggers, condiciones y acciones de automatización~~

> **Resuelto** en `4a2f26a`. `GET /projects/:projectId/automations/catalog`, con
> `canManageAutomations`, servido desde `catalog.ts` del propio servicio — el
> mismo módulo que leen el validador y el motor, no una copia. El frontend
> retiró su catálogo quemado y lo pide al abrir la sección.
>
> Lo que se llevó por delante: la correspondencia hecho → disparador vivía en
> tres sitios que tenían que coincidir sin que nada lo comprobara, y **estaba
> mal escrita** —`TASK_DUE_SOON` figuraba como reactivo cuando es de barrido—.
> Ahora hay una prueba que cruza los `eventType` del catálogo contra lo que
> `tasks-service` emite de verdad.

El catálogo real —qué triggers existen, qué campos de condición admite cada
uno, con qué tipo y qué operadores, y qué acciones acepta— vive **solo dentro
de `rule-definition.ts`** (`automation-service`). No es el enum de
`@praxis/contracts`: el enum declara `GITHUB_PULL_REQUEST_OPENED`, `MOVE_TASK`
y `SEND_EMAIL`, y el validador los rechaza con «no soportado en el MVP
académico» — verificado en runtime, ver `e2e/tests/api/15-…spec.ts`.

**Por qué importa en el frontend.** El apartado Reglas del proyecto tiene que
construirse para que un trigger, condición o acción nuevos no obliguen a
rehacer la pantalla. Sin catálogo servido, el frontend duplica el de
`rule-definition.ts` en un módulo propio: el día que backend añada un trigger,
la interfaz no lo ofrece hasta que alguien se acuerde de tocarla; el día que
backend retire un campo, la interfaz lo sigue ofreciendo y el usuario se come
un 400 sobre algo que la propia pantalla le propuso.

**Qué haría falta.** `GET /projects/:projectId/automations/catalog`, con
`canManageAutomations`, derivado de las mismas constantes de
`rule-definition.ts` — no una copia. Por cada trigger: su config, sus campos de
condición con tipo y operadores admitidos, y sus acciones con la config fija.
Alternativa más barata: mover ese descriptor a `@praxis/contracts` y espejarlo
en `commons/api/domain.ts`, como ya se hace con `LABEL_COLORS` — sin ruta
nueva, pero sin evitar del todo la duplicación.

Mientras tanto el frontend aísla la duplicación en un solo archivo de datos
(`lib/automation-catalog.ts`), con una nota que apunta aquí y a
`rule-definition.ts`.

## 🟡 2. `PATCH` de una regla de automatización es reemplazo total, no parcial

`UpdateAutomationRuleBodyDto extends CreateAutomationRuleBodyDto`: `name`,
`trigger`, `conditions` y `actions` son obligatorios en cada `PATCH`. No se
puede cambiar solo `status`.

**Por qué importa en el frontend.** Habilitar y deshabilitar una regla es la
operación más frecuente del apartado y hoy cuesta dos viajes (`GET` + `PATCH`
con la definición completa reenviada), con tres consecuencias: una carrera de
lectura-escritura que puede revertir la edición de otra persona; un `version`
incrementado por un cambio que no tocó la definición; y, lo peor, que una
regla guardada antes de un endurecimiento del validador **no se pueda ni
desactivar**, porque el reenvío completo la vuelve a validar entera y da 400.

**Qué haría falta.** `PATCH /automations/:id/status` con
`{ status: 'ENABLED' | 'DISABLED' }`; o hacer opcionales los campos de
`UpdateAutomationRuleBodyDto` y fusionar contra lo guardado en
`rules.service.ts`.

Mientras tanto el frontend conserva el lee-modifica-escribe, centralizado en
una sola acción, con un mensaje propio para el 400 de revalidación.

## ✅ 3. ~~Una ejecución de automatización no dice sobre qué tarea fue~~

> **Resuelto** en `4a2f26a`. `RuleExecution` guarda `triggerType`, `subjectId` y
> `subjectTitle`, y la pantalla de ejecuciones los despliega por fila.
>
> El título va **copiado, no referenciado**: la tarea puede renombrarse o
> borrarse, y una auditoría que cambia cuando cambia el presente no es una
> auditoría.

`RuleExecution.conditionResult` guarda `{ matched, context }`, y `context`
solo trae los campos de condición del trigger (`priority`/`dueDate`/… o
`staleDays`/`overdue`/…). El `taskId` viaja incrustado en `causeKey`
(`manual:<version>:<taskId>:<huella>`), una cadena pensada para deduplicar, no
para leerse. `taskTitle` no se persiste en ningún sitio.

**Por qué importa en el frontend.** La auditoría es el único lugar donde se
demuestra que la automatización hizo algo. «Regla X · SUCCEEDED · hace 2 min»
no permite comprobar nada; «Regla X avisó sobre *Preparar la exposición*» sí.
La integración previa ya intentaba leer
`conditionResult.context.taskTitle` y siempre valía `undefined`.

**Qué haría falta.** Añadir `taskId` y `taskTitle` a lo que persiste
`direct-execution.ts` en `reviewProject` — el `Candidate` ya los tiene en
memoria (`candidate.taskId`, `candidate.taskTitle`) — dentro de
`conditionResult` o en columnas propias de `RuleExecution`.

Mientras tanto el frontend muestra regla, estado, momento y un resumen del
`context` con las etiquetas del catálogo («prioridad Alta, vence
2026-08-21»), y no vuelve a intentar leer `taskTitle`.

## ✅ 4. ~~El resumen de «Revisar ahora» no distingue por qué no hubo avisos~~

> **Resuelto** en `4a2f26a`. El resumen trae `filtered` —candidatas que no
> cumplían las condiciones— y `repeated` —candidatas cuya causa ya se había
> atendido—, además de `rules`, `candidates`, `succeeded` y `failed`.
>
> Sin esos dos, «0 acciones» se leía igual con la regla mal escrita que con todo
> funcionando y ya actuado ayer: dos situaciones opuestas que piden decisiones
> opuestas.

`reviewProject` devuelve `{ rules, candidates, succeeded, failed }`. Las
evaluaciones `SKIPPED` (condiciones no cumplidas) y las descartadas por
idempotencia (`causeKey` ya visto, se continúa sin crear fila) no se cuentan
en ningún campo del resumen — solo se ven, una por una, en
`GET /automations/executions`.

**Por qué importa en el frontend.** «5 candidatas, 0 avisos» tiene dos causas
opuestas —las condiciones no se cumplen, o ya se avisó antes— y quien revisa
necesita saber cuál para creerse el resultado. Con lo que hay, la interfaz
solo puede mostrar los cuatro números y callarse sobre el resto.

**Qué haría falta.** Añadir `skipped` y `deduped` al objeto que devuelve
`reviewProject`; las dos ramas ya existen dentro del bucle, solo falta
contarlas.

Mientras tanto el frontend muestra los cuatro números que hay, sin inventar la
interpretación, y deja el detalle por regla en la lista de ejecuciones.

## ✅ 5. ~~Cada ejecución arrastra un volcado completo de la regla que nadie usa~~

> **Resuelto** en `4a2f26a`. `ruleSnapshot` pasa a ser el resumen que
> `resumenDeRegla()` compone —id, nombre, versión, disparador y los tipos de
> acción—, no la definición entera.
>
> Se conserva el campo y no se retira: sin *algo* de la regla, una ejecución de
> hace un mes no se puede leer después de editarla, que es justo cuando hace
> falta mirarla.

`RuleExecution.ruleSnapshot` guarda la regla entera en cada fila, y
`GET /automations/executions` lo devuelve tal cual — 20 volcados completos en
cada carga del apartado, y el frontend no usa ninguno.

**Qué haría falta.** Excluir `ruleSnapshot` del `select` de
`AutomationEngineService.recent()`.

No bloquea nada, es solo peso de sobra en cada respuesta.

## 🟡 6. Una tarea estancada no se puede preparar por la API, así que `TASK_STALE` no se puede probar

De los dos triggers del MVP, `TASK_DUE_SOON` se puede llevar hasta el aviso
desde una prueba: se crea la tarea, se le pone fecha y prioridad y se le
asignan responsables, todo con llamadas al gateway. **`TASK_STALE` no.**

`StatsService` calcula el estancamiento contra el último evento de la tarea:

```sql
diasParada = floor(EXTRACT(EPOCH FROM (now() - COALESCE(MAX(e."occurredAt"), t."createdAt"))) / 86400)
…
HAVING diasParada >= ${dias}
```

y `rule-definition.ts` exige `days >= 1`. Una tarea recién creada tiene
`diasParada = 0`, y además emite un evento `CREATED` con `occurredAt = now()`,
así que ni siquiera bastaría con poder retrasar `createdAt`. **Ninguna
combinación de llamadas al gateway produce una candidata**: haría falta
esperar un día de reloj.

**Por qué importa en el frontend.** La mitad del catálogo del MVP no tiene
forma de verificarse de punta a punta. De `TASK_STALE` se puede probar que se
crea, se edita, se describe y se valida —y todo eso está cubierto—, pero no
que llegue a disparar un aviso. En una demostración eso significa que si no
dispara, no hay manera de distinguir si falla la regla o faltan los datos.

**Qué haría falta.** Alguna de estas, por orden de preferencia:

1. Que `task_stats_stale` acepte un umbral en **horas** además de en días, o
   que `days` admita `0`. Con `>= 0` una tarea recién creada ya sería
   candidata y la prueba se escribiría entera contra la API.
2. Una utilidad de siembra fuera de la API de producto —un script de `seed`—
   que deje un proyecto con tareas antiguas de verdad.

**Mientras tanto**, la prueba de UI cubre el caso vacío: con una regla
`TASK_STALE` habilitada, «Revisar ahora» responde limpiamente con 0
candidatas y sin fallos. ⚠️ **Eso no demuestra que el trigger dispare**, y no
debe leerse así; el disparo real se comprueba a mano, con una tarea
envejecida en la base, y así está anotado en el guion de demostración.

⚠️ Este hueco es la razón por la que **no** se añadió una segunda escritura
directa a la base en `e2e/fixtures/`. `verificacion.ts` lo deja escrito: es lo
único que las pruebas hacen sin pasar por la API, y «si algún día hay que
tocar la base para otra cosa, es señal de que falta un endpoint, no de que ese
archivo tenga que crecer». Esto es esa señal.
