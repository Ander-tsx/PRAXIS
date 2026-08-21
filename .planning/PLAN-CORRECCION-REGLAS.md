# Plan de corrección — apartado «Reglas»

Sale del informe de revisión integral del Bloque 7, contrastado contra el código de
`feature/automation-service` a `6b47752`. Cubre **solo** lo que el informe marcó como «No cumple»,
«Cumple parcialmente» o riesgo parcialmente mitigado, más el defecto reproducido en su §3.

**No se reabre ninguna decisión de diseño.** D1-D9 del
[plan original](PLAN-FRONTEND-REGLAS-IMPLEMENTACION.md) siguen en pie; esto corrige la distancia
entre lo decidido y lo implementado, no lo decidido.

No se implementa nada en este documento. Se ejecuta bloque a bloque con `/executing-plans`,
`/automation-development` y `/frontend-development`; se verifica con
`/verification-before-completion`.

---

## 1. Los hallazgos, en una tabla

| # | Hallazgo | Origen | Bloque de corrección |
|---|---|---|---|
| D1 | El diálogo «Nueva regla» conserva el borrador anterior al reabrirse | Bloque 5 | **C1** — bloqueante |
| N1 | Cerrar el diálogo con cambios sin guardar no pide confirmación (Bloque 7, ítem 4) | Bloque 7 | **C2** |
| R1 | Riesgo «sin perder silenciosamente lo editado»: mitigado a medias | Bloques 5 y 7 | **C1 + C2** |
| REC1 | `TASK_STALE` nunca se ha visto disparar, ni en pruebas ni a mano | Bloque 1 | **C3** |
| N3 | No hay guion de demostración (Bloque 7, ítem 8) | Bloque 7 | **C4** |
| N2 | `ESTADO-ACTUAL.md` sin la sección del apartado (Bloque 7, ítem 7) | Bloque 7 | **C5** |
| P1 | Falta el `aria-label` de la sección (Bloque 7, ítem 1) | Bloque 7 | **C6** |
| P2 | «Tipo de trigger» es anglicismo crudo (Bloque 7, ítem 6) | Bloque 5 | **C6** |
| P3 | `saveAutomationRuleAction` no confirma `trigger.type`, que D6 sí pide | Bloque 5 | **C6** |

---

## 2. Bloques de corrección

---

### C1 — El borrador de creación se reinicia al abrir

*Tamaño: pequeño. Bloqueante para la demo.*

**Hallazgo.** §3 del informe, y la mitad del riesgo R1 («Cambios concurrentes o reglas invalidadas
necesitan una recuperación comprensible sin perder silenciosamente lo editado»). Reproducido
contra el stack levantado: tras crear una regla, reabrir «Nueva regla» devuelve el formulario con
el nombre y las condiciones de la anterior.

```
<input type="text" name="name" … value="Primera mt1aecek-q4zy" …/>
- textbox "Nombre": Primera mt1aecek-q4zy
  - button "Quitar"    ← la condición de la regla anterior también sigue ahí
```

**Causa raíz.** `RuleDialog.tsx:53` inicializa el borrador con un *initializer* de `useState`, que
solo corre en el montaje. El efecto de `state.done` (`:65-70`) cierra el diálogo y limpia
`touched`, pero no toca `draft`. El componente **nunca se desmonta**: no lleva `key`, su posición
en el árbol no cambia y `revalidateProject` re-renderiza el Server Component padre sin forzar un
remontaje del hijo cliente. El estado sobrevive al cierre por diseño de React, no por accidente.

**Corrección propuesta.** El cambio mínimo es reiniciar el borrador **al abrir**, no al cerrar:
al abrir se sabe con certeza qué debe haber dentro —`draftFromRule(rule)` si hay regla,
`emptyDraft('TASK_DUE_SOON')` si no—, mientras que al cerrar hay dos motivos distintos (guardado y
cancelación) que en C2 dejarán de tener el mismo comportamiento.

Dos formas, y la elección importa:

1. **Reiniciar en el manejador que abre** — el `onClick` del disparador vuelve a sembrar el
   borrador antes de `setOpen(true)`. Explícito, sin efectos, y deja el borrador vivo mientras el
   diálogo está abierto, que es lo que C2 necesita para saber si hay cambios.
2. `key` sobre el `<Dialog>` para forzar el remontaje. Más corto, pero remonta también
   `ConditionsSection` y `useAccion`, y tira el `state.error` que el test 9 comprueba que
   sobrevive. **Descartada por eso.**

Se toma la 1.

⚠️ **No hay efecto en cascada.** El diálogo de edición ya se comporta bien —cada `RuleCard` monta
el suyo con su propia regla— y este cambio lo deja igual: reiniciar al abrir con `rule` presente
recalcula exactamente el mismo `draftFromRule(rule)`.

**Componentes afectados.** `RuleDialog.tsx`, solo.

**Riesgo de la corrección.** Toca el estado del componente que sostiene los criterios 3, 4 y 6,
todos en «Cumple». Dos regresiones concretas a vigilar:

- Si el reinicio se colara en el camino de guardado, un error de servidor borraría lo escrito y
  rompería el test 9 («un error del servidor se ve dentro del diálogo, sin cerrarlo ni perder lo
  escrito»). Por eso se reinicia **al abrir** y en ningún otro sitio.
- El reinicio debe llevar también `touched` a `false`; si no, un diálogo recién abierto y vacío
  aparecería con el nombre en rojo.

**Pruebas.**

- UI nueva en `07-reglas.spec.ts`: crear una regla con condición, reabrir «Nueva regla», y afirmar
  que el nombre está vacío y que no queda ninguna fila de condición. Es la sonda del informe,
  convertida en prueba permanente.
- UI nueva: abrir «Editar» sobre una regla, cancelar, y reabrir — sigue precargada con **su** regla
  y no con lo que quedara de otra tarjeta.
- Los 15 casos actuales de `07-reglas.spec.ts` en verde, con atención particular al 9.
- Las 54 unitarias en verde: no las toca, pero fijan que `emptyDraft` y `draftFromRule` siguen
  siendo lo que el reinicio invoca.

**Criterio de finalización.** Las dos pruebas nuevas en verde; los 15 casos previos sin cambios;
crear dos reglas seguidas a mano parte de un formulario limpio la segunda vez.

**Fuera de alcance.** La confirmación al cerrar, que es C2.

---

### C2 — Cerrar con cambios sin guardar pide confirmación

*Tamaño: pequeño. Recomendado antes de la demo.*

**Hallazgo.** Bloque 7, ítem 4, «No cumple». Es la otra mitad del riesgo R1.

**Causa raíz.** `RuleDialog.tsx:91` (`onClose`) y `:195` («Cancelar») llaman a `setOpen(false)`
directo. El Bloque 7 nunca llegó a ejecutarse: sus ocho ítems se revisaron, no se implementaron.

**Corrección propuesta.** Una función `intentarCerrar()` que compare el borrador actual contra el
borrador de referencia —el mismo que C1 calcula al abrir— y solo pregunte si difieren. Las tres
vías de cierre pasan por ella: `onClose` del `Dialog` (que cubre `Esc` y el clic en el fondo),
«Cancelar», y nada más — el cierre por guardado correcto **no** pregunta, porque no hay nada que
perder.

Para la confirmación se usa `window.confirm`, igual que el cambio de trigger ya hace en
`handleTriggerTypeChange:74`. **No se introduce un segundo `Dialog` anidado**: el `Dialog` de
commons usa `showModal()` nativo y dos modales nativos superpuestos tienen su propio
comportamiento de pila de foco que este apartado no necesita estrenar.

⚠️ **Depende de C1.** Sin un borrador de referencia definido al abrir, «¿hay cambios?» no tiene
respuesta: hoy el borrador arrastra lo de la sesión anterior y cualquier comparación daría
«cambiado» siempre, convirtiendo la confirmación en un estorbo que se aprende a ignorar.

**Componentes afectados.** `RuleDialog.tsx`, solo.

**Riesgo de la corrección.** Alto para las pruebas existentes, bajo para el producto:

- ⚠️ **El test 11** (`eliminar una regla pide confirmación, y al cancelar sigue ahí`) y el
  **test 7** (`cambiar de trigger avisa y descarta`) ya manejan diálogos nativos. Un `confirm`
  nuevo en el camino de cierre puede colgar cualquier test que cierre el diálogo de reglas sin
  haberlo registrado — Playwright descarta los diálogos no manejados, así que el riesgo real es
  un cierre que **no ocurre** y una aserción posterior que falla lejos de la causa.
- El test 9 cierra el diálogo con error visible: hay que comprobar si su flujo termina cerrando.

**Pruebas.**

- UI nueva: escribir un nombre, pulsar «Cancelar», rechazar la confirmación — el diálogo sigue
  abierto con el nombre intacto; aceptarla — se cierra.
- UI nueva: abrir el diálogo y cerrarlo **sin tocar nada** — no pregunta.
- UI nueva: guardar correctamente — no pregunta, y el diálogo se cierra solo.
- Los 15 casos previos más los dos de C1, revisando uno a uno cuáles cierran el diálogo.

**Criterio de finalización.** Las tres pruebas nuevas en verde; ningún caso previo colgado
esperando un `confirm` sin manejar; cerrar sin cambios sigue siendo un clic, no dos.

**Fuera de alcance.** Confirmar al salir de la página con el diálogo abierto (`beforeunload`). No
lo pide el plan y añade un aviso del navegador que nadie puede redactar.

---

### C3 — `TASK_STALE` ensayado con datos preparados

*Tamaño: pequeño, pero con una decisión que no es técnica. Recomendado antes de la demo.*

**Hallazgo.** REC1 del informe. El plan base pide en su Bloque 7 «ensayar un vencimiento próximo
**y una tarea estancada** con datos preparados». El primero está cubierto por el caso 12 de
`07-reglas.spec.ts`; el segundo **no se ha visto disparar nunca**, ni automática ni manualmente.
Lo que sí está probado de `TASK_STALE` es crearla, editarla, describirla y validarla.

**Causa raíz.** No es un fallo de implementación: es que una tarea estancada **no se puede sembrar
por la API**. `stats.service.ts:659-674` calcula

```sql
diasParada = floor(EXTRACT(EPOCH FROM (now() - COALESCE(MAX(e."occurredAt"), t."createdAt"))) / 86400)
…
HAVING diasParada >= ${dias}
```

y `rule-definition.ts:70` exige `days >= 1`. Una tarea recién creada tiene `diasParada = 0` —y
además emite un evento `CREATED` con `occurredAt = now()`, así que ni siquiera bastaría con
retrasar `createdAt`—. **Ninguna combinación de llamadas al gateway produce una candidata.**

**Corrección propuesta.** Tres caminos, con el coste real de cada uno:

| Opción | Qué implica | Coste |
|---|---|---|
| **A. Ensayo manual, prueba automática del caso vacío** | Una prueba UI que crea la regla `TASK_STALE`, revisa y afirma «0 candidatas» limpiamente; el disparo real se comprueba a mano una vez, con una tarea antigua sembrada a mano en la base | Bajo. No toca ninguna convención |
| **B. Retrasar `createdAt` y `occurredAt` desde una fixture de pruebas** | Segunda escritura directa a la base en `e2e/fixtures/` | ⚠️ Choca con lo que el propio repo dejó escrito |
| **C. Pedir a backend un endpoint de siembra** | Puerta trasera en la API | Alto, y desaconsejado por el mismo comentario |

⚠️ **B tiene un precedente que dice explícitamente que no crezca.**
`e2e/fixtures/verificacion.ts:19-23`:

> **Esto es lo único que las pruebas hacen sin pasar por la API.** […] Si algún día hay que tocar
> la base para otra cosa, es señal de que falta un endpoint, no de que este archivo tenga que
> crecer.

**Se recomienda A**, y que la imposibilidad de sembrar una tarea estancada por la API se anote como
**hueco 6** en `PENDIENTES-BACKEND-AUTOMATIZACION.md` — es exactamente lo que ese comentario llama
«señal de que falta un endpoint», y el documento existe para eso.

> **Decisión abierta.** A es lo que este plan asume. Si se prefiere B, afecta solo a este bloque:
> una fixture nueva, la prueba pasa a afirmar el disparo real, y el hueco 6 no se escribe.

**Componentes afectados.** `e2e/tests/ui/07-reglas.spec.ts`,
`docs/frontend/PENDIENTES-BACKEND-AUTOMATIZACION.md`. Con la opción B, además una fixture nueva en
`e2e/fixtures/`.

**Riesgo de la corrección.** Ninguno sobre código de producto: no lo toca. Con la opción A el
riesgo es de honestidad, y se cubre escribiendo el hueco 6: una prueba que afirma «0 candidatas»
**no debe leerse como que el trigger funciona**, y el guion de C4 tiene que decir cuál de los dos
caminos se demuestra.

**Pruebas.** La prueba nueva descrita arriba, más los 10 casos de la API en verde.

**Criterio de finalización.** Con la opción A: la prueba del caso vacío en verde, el hueco 6
escrito con su reproducción, y el disparo real comprobado a mano una vez y anotado en el guion.

**Fuera de alcance.** Cerrar el hueco 6. Se documenta, no se resuelve —misma regla que los cinco
anteriores—.

---

### C4 — Guion de demostración

*Tamaño: pequeño. Sin código. Recomendado antes de la demo.*

**Hallazgo.** Bloque 7, ítem 8, «No cumple». Entregable comprometido en el plan base
(«Pruebas focales y un guion breve de demostración»).

**Causa raíz.** El Bloque 7 no se ejecutó.

**Corrección propuesta.** Un documento breve con: qué sembrar, en qué orden pulsar, y qué debe
verse en cada paso. La secuencia ya está reconstruida en §7 del informe de revisión y sale de las
pruebas que corren, así que no hay que inventarla —hay que escribirla y **comprobar que se puede
seguir de principio a fin sin desviarse**, que es lo que ninguna prueba hace—.

Tiene que decir, además, dos cosas que el informe dejó claras y que en una demostración importan:
la revisión es manual a propósito, y cuál de los dos triggers se demuestra en vivo según lo que se
decida en C3.

**Componentes afectados.** Un documento. Sitio a decidir al ejecutar: `docs/frontend/` si se
considera documentación viva, `.planning/` si se considera material de esta tarea.

**Riesgo de la corrección.** Ninguno. No toca código.

**Pruebas.** Seguir el guion completo a mano, sobre el stack levantado, sin saltarse ningún paso.

**Criterio de finalización.** El guion se ejecuta entero de principio a fin sin encontrar un paso
que falte o que no produzca lo que dice.

---

### C5 — `ESTADO-ACTUAL.md`, la sección del apartado

*Tamaño: pequeño-mediano. Sin código. Mejorable a futuro.*

**Hallazgo.** Bloque 7, ítem 7, «No cumple». `CONTRATO-API.md` **sí** quedó completo en el
Bloque 1 (§1471-1530: tabla del catálogo y las cinco trampas); lo que falta es la sección de
`ESTADO-ACTUAL.md`.

**Causa raíz.** El Bloque 7 no se ejecutó. El Bloque 1 sí cerró su mitad de la documentación.

**Corrección propuesta.** Una sección `## 45` —la última es la 44— con lo que el plan pidió: el
mapa del apartado, el catálogo, la decisión del catálogo-como-datos (D2) y las trampas de D3 y D4.
Lo que hace falta añadir y no está en ningún otro documento:

- Por qué el catálogo es un archivo de datos y qué se toca al añadir un trigger, una condición o un
  tipo de valor (D2, con el diagrama de tres líneas del plan original).
- Por qué los booleanos son `Select` y no `Checkbox` (D3), que es la trampa con peor forma de
  fallar: un checkbox sin marcar no viaja en el `FormData` y desplaza todas las condiciones
  siguientes, sin error de tipos y sin 400.
- La invariante de los arrays paralelos (D4) y quién la garantiza.
- Que `conditionFieldSpecByName` busca por nombre en todo el catálogo y por qué eso vale hoy.

**Componentes afectados.** `docs/frontend/ESTADO-ACTUAL.md`.

**Riesgo de la corrección.** Ninguno sobre el código.

⚠️ **La prosa no se traduce ni se reescribe al mover.** Vale la regla de `CLAUDE.md`: lo que ya
está escrito en los comentarios del apartado es el material de esta sección, y se cita, no se
parafrasea a la baja.

**Pruebas.** Ninguna automática. Lectura contra el código: cada afirmación de la sección tiene que
poder señalar el archivo y la línea que la sostiene.

**Criterio de finalización.** La sección existe y sus cuatro puntos están; ningún enlace roto.

---

### C6 — Pulido menor

*Tamaño: pequeño. Mejorable a futuro. Los tres son independientes entre sí.*

Tres hallazgos «Cumple parcialmente» que caben en un bloque porque ninguno llega a media hora.

#### C6.1 — `aria-label` en la sección

**Hallazgo.** Bloque 7, ítem 1: «`aria-label` en la sección y `role="alert"` en cada error». Lo
segundo está en los cinco puntos de error; lo primero falta.

**Causa raíz.** El Bloque 7 no se ejecutó. Lo demás del ítem 1 —foco atrapado, `Esc`, fondo
inerte— se cumple sin haberlo implementado: lo da `showModal()` nativo (`Dialog.tsx:49-51`).

**Corrección.** `aria-label` sobre el `<section>` de `ProjectRules.tsx:49`, y valorar si los dos
paneles —reglas y ejecuciones— merecen `<section>` con nombre propio en vez de uno solo.

**Riesgo.** Ninguno funcional. ⚠️ Un `aria-label` sobre un contenedor **cambia el árbol de
accesibilidad**, y los locators `getByRole` de las 15 pruebas se resuelven contra ese árbol. Hay
que releerlas, no solo ejecutarlas.

**Pruebas.** Los 15 casos en verde.

**Criterio de finalización.** La sección tiene nombre accesible; ninguna prueba cambia de
comportamiento.

#### C6.2 — «Tipo de trigger»

**Hallazgo.** Bloque 7, ítem 6: «todo lo que ve el usuario en español, sin identificadores técnicos
crudos». `TriggerSection.tsx:34` etiqueta el `Select` como «Tipo de trigger».

**Causa raíz.** El vocabulario Cuando/Si/Entonces se fijó en D5, pero la etiqueta del control se
escribió con la palabra que el plan usa **para hablar entre nosotros**, no con la que ve quien usa
la pantalla.

**Corrección.** Reetiquetar. «Cuándo se dispara» o «Qué la dispara» encajan con el `<legend>`
«Cuando» que ya está encima.

⚠️ **Efecto en cascada sobre las pruebas.** Los casos 7 y 12 usan
`getByRole('combobox', { name: 'Tipo de trigger' })`. Cambiar la etiqueta **rompe esos locators**,
y hay que actualizarlos en el mismo cambio.

**Riesgo.** Bajo y contenido, siempre que se cambien los locators a la vez. Ninguna lógica depende
del texto.

**Pruebas.** Los 15 casos en verde, con los locators actualizados.

**Criterio de finalización.** Ningún anglicismo en texto visible; pruebas en verde.

#### C6.3 — Confirmar `trigger.type` contra el `data`

**Hallazgo.** Salvedad del criterio 6. D6 pide confirmar «que exista `id` y que `name` y
`trigger.type` sean los que se pidieron»; `actions.ts:123` comprueba `saved.id` y `saved.name`.

**Causa raíz.** La comprobación se escribió calcada de `saveRoleAction`, que solo tiene un nombre
que confirmar. No es un fallo observable —el `PATCH` es reemplazo total y el `trigger` viaja en el
mismo cuerpo— pero el código no dice lo que la decisión dice.

**Corrección.** Añadir `saved.trigger?.type !== body.trigger.type` a la misma condición.

**Riesgo.** Bajo. ⚠️ El único escenario en que esto cambiaría algo es uno en que el servidor
devolviera un `trigger` distinto del enviado; si el `GET` de alguna ruta llegara a devolver el
`trigger` sin normalizar, un mensaje de «el servidor no guardó la regla» aparecería sobre un
guardado correcto. Los 10 casos de la API cubren la forma de la respuesta.

**Pruebas.** Las 10 de API y los 15 de UI en verde.

**Criterio de finalización.** La confirmación cubre los tres campos que D6 nombra.

---

## 3. Orden y dependencias

```
C1 ─ reinicio del borrador          (bloqueante)
 └─► C2 ─ confirmación al cerrar    (necesita el borrador de referencia de C1)

C3 ─ ensayo de TASK_STALE           (independiente; abre una decisión)
 └─► C4 ─ guion de demostración     (el guion dice qué trigger se demuestra)

C5 ─ ESTADO-ACTUAL §45              (independiente)
C6 ─ pulido menor                   (independiente; 6.1, 6.2 y 6.3 entre sí también)
```

| Bloque | Depende de | Prioridad | Toca código de producto |
|---|---|---|---|
| C1 | — | Bloqueante | Sí |
| C2 | C1 | Recomendado | Sí |
| C3 | — | Recomendado | No |
| C4 | C3 | Recomendado | No |
| C5 | — | Mejorable | No |
| C6 | — | Mejorable | Sí, mínimo |

**C3 y C5 son paralelizables** con C1 y C2: no comparten un solo archivo.

---

## 4. Mapa contra el plan original

| Corrección | Bloque original donde se originó | Bloques originales que reabre |
|---|---|---|
| C1 | Bloque 5 (constructor guiado) | **Solo el 5.** El 3 y el 4 no tocan el borrador; el 6 no monta el diálogo |
| C2 | Bloque 7, ítem 4 | El 5, por el archivo. Ninguna decisión del 5 cambia |
| C3 | Bloque 1 (contrato verificado) y Bloque 7, ítem 8 | Ninguno. Añade pruebas y un hueco documentado |
| C4 | Bloque 7, ítem 8 | Ninguno |
| C5 | Bloque 7, ítem 7 | Ninguno |
| C6.1 | Bloque 7, ítem 1 | El 3, por el archivo (`ProjectRules.tsx`) |
| C6.2 | Bloque 5 | El 5 y sus pruebas de UI |
| C6.3 | Bloque 5, D6 | Solo el 5 |

**Ningún bloque original queda invalidado.** Las nueve correcciones son locales; ninguna obliga a
rehacer una decisión cerrada ni a reescribir un bloque entero.

---

## 5. Lo que NO requiere cambio de código

Se deja explícito para que una revisión posterior no lo vuelva a levantar.

| Hallazgo del informe | Por qué no se toca |
|---|---|
| **D8 sin `SuspendedProjectNotice` dentro de `ProjectRules`** | Desviación deliberada y ya comentada en el código. `page.tsx:432-433` pinta el aviso con su motivo encima de todas las pestañas; repetirlo dentro sería el mismo texto dos veces. El motivo **sí** llega al usuario, que es lo que D8 perseguía. El informe lo marcó «documentada y correcta» |
| **Cada `RuleCard` monta un `RuleDialog` cerrado** | Coste, no fallo. Un `<dialog>` sin `open` no es visible ni tabulable y sus campos no viajan en ningún envío. Con los volúmenes del MVP no se nota. Optimizarlo sería rediseño, que este plan no hace |
| **`conditionFieldSpecByName` busca por nombre en todo el catálogo** | Correcto hoy: ningún campo se repite entre los dos triggers. La condición bajo la que dejaría de serlo ya está escrita en el propio código. Se documenta en C5; no se cambia |
| **`ValueField` con `kind: 'date'` es incontrolado** | Funciona y está comentado. El caso que podría desalinearlo —cambiar de operador y volver— remonta el componente porque cambia de tipo. Fragilidad anotada, no defecto |
| **`OPERATOR_LABELS` cae al identificador crudo si falta uno** | Los tres operadores del contrato están en el mapa. El fallback es una red, y quitarla dejaría un hueco vacío en vez de una palabra fea |
| **Los 5 huecos de backend siguen abiertos** | Decisión del plan original: se documentan, no se cierran. Ninguno bloquea. C3 propone añadir el sexto con el mismo criterio |
| **8 errores de Biome en la zona** | Todos preexistentes y en archivos ajenos a Reglas (`(private)/page.tsx`, `PraxCreateProjectTrigger`, `SuspendedProjectNotice`, `TaskAttachments`, `ColumnMenu`), sin modificar según `git status`. Arreglarlos aquí sería tocar lo ajeno a la automatización |
| **Los 11 criterios de aceptación del plan base** | Los once cumplen. C6.3 alinea el código con el texto de D6; no corrige un criterio incumplido |
