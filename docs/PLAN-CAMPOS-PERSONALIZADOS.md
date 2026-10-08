# Campos personalizados y pulido de las tareas

> **Etapa entregada** (2026-10-07, rama `feature/campos-personalizados`).
> Lo pidió el dueño del producto: «a las tareas les falta pulido; necesito un
> campo *reviewer* en un proyecto concreto, útil ahí y no en todos, así que
> deberían ser personalizados, de distintos tipos, por proyecto — tanto en la
> tabla, como una columna nueva, como en el panel».
>
> ⚠️ **Toca el backend**, con permiso expreso del dueño (como PLAN-ORGANIZACION-ACTIVA
> y PLAN-PRAX-SEMIAGENTICO). Solo de forma aditiva: dos tablas y un tipo nuevos
> en `tasks`, ninguna columna existente tocada.

## Qué es

Cada proyecto define sus propios campos —«Reviewer», «Cliente», «Versión»— y
cada tarea del proyecto tiene un valor para cada uno. Se ven y se editan en
tres sitios:

| Dónde | Cómo |
|---|---|
| **Panel de la tarea** | Una fila por campo bajo las propiedades fijas, con «+ Añadir campo» debajo y un engranaje por fila para configurarlo |
| **Vista de tabla** | Una columna por campo. Se ordena, se redimensiona y **se edita en la celda**; el «+» al final de la cabecera crea uno nuevo, y el «⋯» de cada cabecera lo configura y lo mueve |
| **Tarjeta del tablero** | Solo los marcados «Mostrar en la tarjeta», con su nombre delante y solo si tienen valor |

## Decisiones

| | Decisión | Por qué |
|---|---|---|
| **D1** | **Ocho tipos**: texto, número, fecha, selección, selección múltiple, persona, casilla y enlace | Los aprobó el dueño. Persona es el caso que lo originó (el revisor) |
| **D2** | **Gestionar campos exige `canEditTask`**, no un permiso propio | Decisión del dueño: quien edita tareas decide qué se anota en ellas. Es además el mismo permiso que pide escribir un valor, así que quien ve el engranaje puede rellenar el campo |
| **D3** | **Sin tope por plan.** Solo uno **técnico**: 50 campos por proyecto y 50 opciones por campo | Decisión del dueño. El técnico existe porque cada campo es una columna más de la tabla y viaja con cada tarea del tablero |
| **D4** | **Un campo no cambia de tipo** | El valor se interpreta según el tipo: pasar de número a fecha dejaría filas que no significan nada. Para otro tipo, otro campo |
| **D5** | **El valor se escribe por su propia ruta** —`PUT /tasks/:id/fields/:fieldId`—, no por el `PATCH` de la tarea, y **se guarda al cambiarlo**, no al cerrar el panel | Ese `PATCH` reescribe encargados y etiquetas, avisa a quien entra o sale y despierta a las automatizaciones. Un cambio de «Reviewer» no debe hacer nada de eso |
| **D6** | **Columnas con tipo** (`text`, `number`, `date`, `bool`, `ids`), no un `Json` | Para poder ordenar y filtrar en SQL. Cada tipo usa una sola |
| **D7** | Las opciones se guardan con **id**, y los valores apuntan al id | Renombrar una opción no reescribe ninguna tarea. Quitar una la borra de las tareas que la tenían (en la misma transacción) |
| **D8** | **Borrar un campo borra su valor en todas las tareas** (cascada), con confirmación | Igual que las etiquetas. La ruta devuelve en cuántas tareas había algo |
| **D9** | La definición viaja **una vez por proyecto** (`GET /projects/:id/fields`); la tarea solo trae sus valores (`Task.fieldValues`) | Repetir nombre, tipo y opciones en cada tarea del tablero sería pagarlo cincuenta veces |
| **D10** | Sin `TaskEvent` ni evento de dominio al escribir un valor | El historial lo leen los informes de flujo, y un campo libre no es flujo. Si un día las automatizaciones reaccionan a campos, es aquí donde se añade |

## Cómo está hecho

**Backend** (tasks-service + gateway):

- `CustomField` y `TaskFieldValue` en `services/tasks/prisma/schema.prisma`;
  migración `20261007200000_custom_fields`.
- `CustomFieldsService` (`tasks/custom-fields.service.ts`) valida cada valor contra
  su tipo (`normalizeValue`) y comprueba que la tarea **y** el campo sean del
  proyecto de la ruta. Persona usa el mismo criterio que los encargados:
  miembros más el dueño.
- Gateway: `CustomFieldsController` (`projects/:projectId/fields`) y
  `TaskFieldValuesController` (`tasks/:taskId/fields/:fieldId`), este último en
  `TASK_CONTROLLERS` del guard.
- `task_purge` borra los campos del proyecto con él.
- Pruebas: `custom-fields.service.spec.ts` (15).

**Frontend** (`web/src/components/organisms/TaskBoard/custom-fields/`):

| Archivo | Qué |
|---|---|
| `ProjectFieldsContext.tsx` | Los campos, el permiso y los miembros, puestos una vez por `WorkspaceCanvas` |
| `FieldValueView.tsx` | El valor en pequeño y de solo lectura (celda, tarjeta) |
| `FieldEditor.tsx` | El editor por tipo, `useFieldValue` (guardado optimista) y `AnchoredPanel` (el flotante de la tabla) |
| `FieldSettings.tsx` | Crear, editar y borrar un campo |
| `CustomFieldRows.tsx` | Las filas del panel de la tarea |
| `PropertyRow.tsx` | La fila nombre-valor del panel |
| `swallow-escape.ts` | Escape que no cierra el panel (ver trampas) |

Acciones: `projects/[id]/field-actions.ts`.

## El pulido del panel

Además de los campos, el panel de la tarea pasó de una pila de campos grandes
a **filas de propiedades** (kyloo-design §4):

- Prioridad, fecha límite, estimación, encargados y etiquetas en filas, con el
  nombre a la izquierda.
- **Encargados y etiquetas se resumen** —caras y nombres, píldoras— y la lista
  completa se despliega al pulsar, con buscador si hay más de seis personas.
  Antes se pintaban todos los miembros y todas las etiquetas siempre.
- **Bloques con encabezado, no rayas** (segunda vuelta, a petición del dueño:
  «las divisiones son solo líneas, monótono, sin jerarquía»). Detalles, Campos
  del proyecto, Checklist, Documentos, Archivos y Notas comparten un encabezado
  en versalitas y un bloque apenas más claro (`section-panel.ts`). El título es
  el encabezado del panel, editable ahí mismo —antes salía dos veces—, y cada
  propiedad lleva icono (`property-icons.tsx`).
- **Menos contraste en lo elevado.** El tema oscuro da a `surface` y
  `surface-elevated` un tono **más oscuro** que el panel (#202020): desplegables,
  calendario y campos salían como huecos negros. `TASK_PANEL_TOKENS` los sube un
  peldaño por encima del panel **solo dentro de él**. Y los placeholders en
  blanco puro, que se confundían con texto escrito, pasaron a secundario.
- **Escape en el `Select` compartido cerraba el panel entero**, en toda la app.
  Arreglado en el átomo con `stopImmediatePropagation` (trampa 2).
- Se arregló un «**Sin save**» que había dejado el renombrado global
  `guardar → save` en el indicador de guardado (es justo el caso que describe
  `CLAUDE.md`).

## Trampas

1. 🔴 **Las casillas de encargados y etiquetas no se desmontan nunca**, ni con la
   lista plegada (`hidden`, que no es `disabled`). El guardado al cerrar lee el
   `FormData` entero; una casilla que no estuviera montada mandaría la lista
   vacía y **borraría los encargados**, que es la avería de `734855a` por otro
   camino. El buscador también oculta, no filtra el array.
2. 🔴 **`stopPropagation()` no impide que Escape cierre el panel.** El
   `SlideOver` escucha en `document`, y en el App Router React también delega
   en `document`: mismo nodo, y parar la propagación no frena a otro oyente del
   mismo nodo. Hace falta `nativeEvent.stopImmediatePropagation()`
   (`swallowEscape`). Sin eso, cerrar la lista de personas con Escape cerraba la
   tarea. No da ningún error.
3. ⚠️ **Los campos van fuera del `<form>` del panel**, aunque se lean como una
   fila más. Dentro, sus valores entrarían en la firma del formulario y cerrar el
   panel mandaría la tarea entera (D5).
4. ⚠️ **Dentro del panel, nada de portales.** El panel se cierra con cualquier
   clic fuera de él, y un portal está fuera. Por eso los desplegables del panel
   se pintan dentro de él y solo la tabla usa `AnchoredPanel`: sus celdas son
   `overflow-hidden` y recortarían un desplegable normal.
5. ⚠️ **Invalidar la caché antes de borrar**, no después: quitar una opción o un
   campo borra filas de `task_field_values`, y después ya no se sabe qué tareas
   repintar. La primera versión lo hacía después y el panel seguía enseñando la
   opción borrada un minuto (lo fija un test).
6. ⚠️ **Los ids de tarea no siempre son UUID** (las del seed son `task0001-…`):
   la ruta del valor no usa `ParseUUIDPipe` en `taskId`, como el resto de rutas
   de tarea.

## Fuera de esta etapa, a propósito

- **Avisos**: elegir a alguien en un campo persona no le avisa. Haría falta un
  tipo de aviso nuevo en projects-service y su pintura en el frontend; el
  `TASK_ASSIGNED` actual diría «te asignaron la tarea», que no es lo mismo que
  «eres el revisor».
- **PRAX y automatizaciones** no leen ni escriben campos todavía (el **MCP sí**, desde la misma fecha: ver PLAN-MCP). Para PRAX,
  medir con `medir-prompt` antes de meterlos en el briefing.
- **La lista móvil de la tabla** (`TarjetaDeTarea`) no enseña los campos: en
  móvil se ven y editan en el panel.
- **Filtrar por campo** en la tabla.
- Las capturas de referencia de escritorio (`00-escritorio-capturas`, I1 de
  PLAN-MOVIL) del panel y de la tabla **cambian a propósito** y hay que
  regenerarlas en macOS (los `-darwin.png` no se pueden generar desde Windows).

## Segunda entrega (2026-10-08)

Lo pidió el dueño tras probarlo: «no lo hiciste responsive para mobile, los
nombres largos se salen de los desplegables; a Archivos dale un aviso como el de
Documentos y una opción de adjuntar enlaces; y que los desplegables salgan
animados».

- **Enlaces en Archivos.** La sección ofrece «Adjuntar PDF» y «Adjuntar enlace»
  (un Google Doc, un Figma, un PR) y, vacía, dice para qué sirve, como
  Documentos. Los enlaces van en su propia tabla, `task_links` (migración
  `20261008010000_task_links`, solo aditiva), con `POST /tasks/:id/links` y
  `DELETE /tasks/:id/links/:linkId` (`canEditTask`; quitar uno ajeno, además
  `canDeleteTask`, igual que los adjuntos). Sin título, la acción lo lee de la
  página con `obtenerPreviewDeEnlace` —el del chat, con su guard SSRF— y
  descarta los de una pantalla de acceso («Sign-in»), que es lo que devuelve un
  Google Doc privado. La marca de la tarjeta cuenta PDF y enlaces juntos.
- **En el MCP desde el primer día**: `add_task_link` y `delete_task_link`.
- **Móvil**: las filas de propiedades se **apilan** (nombre arriba, valor
  debajo, a todo el ancho) por debajo de `sm`; la lista móvil de la tabla
  enseña los campos «en la tarjeta» y ordena por ellos.
- **Animaciones**: los desplegables del panel, el `Select`, el calendario y el
  flotante de la tabla entran con `animate-desplegar-menu`, la misma de los
  menús del resto de la aplicación.

### Trampas de esta entrega

7. 🔴 **Un `<fieldset>` no se encoge.** Su `min-width` por defecto es
   `min-content`, así que la lista de encargados crecía hasta el ancho del
   nombre más largo y se salía de la pantalla del teléfono, con `truncate` y
   todo. `min-w-0` en cada `fieldset` del panel.
8. ⚠️ **`animate-desplegar-panel` recorta lo de dentro** (`overflow: hidden`
   permanente en su hijo). En la lista de etiquetas se habría comido el
   desplegable de color del gestor: por eso el panel usa `desplegar-menu`.
9. ⚠️ **Adjuntos y etiquetas invalidaban el tablero con un `del` exacto**
   (trampa 26 de CLAUDE.md): la marca de un PDF recién subido podía tardar un
   minuto en salir en la tarjeta. Ahora `delByPrefix`, también en los enlaces.
