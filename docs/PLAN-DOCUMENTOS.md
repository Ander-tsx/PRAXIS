# Plan de Documentos — un Espacio que contiene más que tableros

> ⚠️ **Propuesta implementada sin discutir, para discutirla con algo delante.**
> Nace de la «Fase futura» de [PLAN-SCRUM-KANBAN.md](PLAN-SCRUM-KANBAN.md), que
> quedó marcada como *requiere discutirse más*. El dueño del producto dio
> derecho creativo sobre ella la noche del 2026-09-22, con una condición:
> **commits separados en la rama `feature/scrum-kanban`, por si no le gusta.**
> Todo lo de este plan se puede revertir sin tocar Scrum — ver «Cómo quitarlo».
>
> 📍 Vive en `docs/` porque toca el backend, igual que el plan de Scrum.

---

## El problema, en una frase

`Organización → Proyecto → Espacio → Tablero` mete un nivel que casi siempre
contiene un solo espacio con todo dentro. Una carpeta de un solo tipo de
contenido no justifica ser un nivel de navegación. **Si el Espacio agrupa cosas
distintas —tableros y documentos—, deja de ser ruido**: es lo que hacen ClickUp
(`Space → List/Doc`) y Linear (`Project` con `Documents`).

---

## Las cuatro preguntas de la fase futura, contestadas a mi criterio

1. **¿Se renombra «Espacio»?** No — los dos tipos se llaman «Tableros» y
   «Documentos» (D7), a elección del dueño del producto. El selector ya dice «Espacio de trabajo» y
   eso sigue siendo verdad: ahora hay más trabajo dentro. Renombrar es
   reversible y barato — se puede decidir después, con el uso delante.
2. **¿Un documento puede vivir suelto, sin Espacio?** No, igual que un tablero.
   Dos reglas distintas para dos cosas que viven lado a lado sería peor que la
   regla que ya hay.
3. **¿Qué tan «Notion»?** Markdown, con vista previa. Nada de bloques anidados.
   Se pinta con `ModelText` (`commons/organisms/AssistantChat`), el mismo que
   pinta las respuestas de PRAX: **no interpreta HTML en ningún punto**, así
   que no hay nada que sanear. Un editor de bloques es otro producto.
4. **¿Espacio opcional?** No se toca aquí. Es la pregunta de más alcance de las
   cuatro y la única que cambia la navegación de todo el mundo; merece que la
   conteste quien la planteó.

---

## Las decisiones

### D1 — `Document` vive en projects-service, colgando del Espacio

`Document { id, workspaceId, title, content, createdBy, updatedBy, createdAt,
updatedAt }`, con clave foránea y cascada desde `Workspace`: mismo esquema,
así que borrar el espacio o el proyecto se lo lleva sin purga a mano (al revés
que las tareas, que viven en otro servicio).

### D2 — El contenido es Markdown, con tope

`content` es texto plano en Markdown, hasta 100 000 caracteres. Sin HTML, sin
imágenes incrustadas. El tope existe porque todo lo que no tiene techo acaba
siendo un problema de otro.

### D3 — Permiso propio: `canEditDocuments`, implicado por `canEditTask`

Leer pide `canViewProject`. Crear, editar y borrar, `canEditDocuments`, que
llega por jerarquía a quien ya puede editar tareas: quien escribe el trabajo
escribe sus notas. Mismo patrón que `canComment` y `canManageLabels`.

### D4 — Dos personas editando: gana la primera, y la segunda se entera

El `PATCH` lleva `expectedUpdatedAt`. Si el documento cambió desde que se
abrió, responde **409 `DOCUMENT_CHANGED`** y no guarda. La pantalla lo dice y
ofrece recargar — perder un párrafo en silencio es el peor fallo posible de un
editor. No es edición en tiempo real; no pretende serlo.

### D5 — ~~En la misma tira que los tableros~~ (sustituida por D7)

Los documentos salían en las pestañas del espacio, junto a los tableros y con
su propio icono. El botón de crear del espacio ofrece tablero o documento. La
URL lleva `?doc=` igual que lleva `?board=`, y como los tableros, cambiar entre
ellos no navega.

### D7 — Un espacio es de tableros o de documentos, nunca de las dos cosas

Corrige D5, decidido por el dueño del producto al probarlo (2026-09-23).
`Workspace.kind: BOARDS | DOCUMENTS`, elegido al crear el espacio —el selector
ofrece «Tableros» y «Documentos»— y sin cambio después. Un espacio de
documentos solo enseña documentos; uno de tableros, solo tableros. El backend
lo hace cumplir: crear un tablero en uno de documentos, o al revés, es 400.
Todos los espacios anteriores son de tableros por defecto.

### D6 — Se guarda al pulsar, al salir del campo y con Ctrl/⌘+S

Nunca en cada tecla. Formulario con `onSubmit` + `preventDefault`, no
`action=`: es un formulario de **edición** y React 19 lo resetearía al enviar
(`CLAUDE.md`).

---

## Cómo quitarlo si no convence

Los commits de este plan llevan `docs(documentos)` o `feat(documentos)` en el
título y no tocan nada de Scrum. `git revert` de esos commits más una
migración que borre la tabla `documents` y el permiso lo dejan como estaba.

---

## Registro

### 2026-09-23 — entregado entero (sesión autónoma)

- `Document` en projects-service (`20260923064844_add_documents`), permiso
  `canEditDocuments`, rutas `/workspaces/:workspaceId/documents`, pestañas
  junto a los tableros y `DocumentView` (Escribir/Leer, Ctrl/⌘+S, guardado al
  salir del campo). Verificado por API: 409 `DOCUMENT_CHANGED` sin pisar nada y
  404 a un documento de otro espacio. e2e `10-documentos.spec.ts`.

**Dos trampas que aparecieron, las dos del lado del cliente:**

- 🔴 **Dos guardados en el mismo instante.** Pulsar «Guardar» dispara el
  `blur` del campo y el clic a la vez; la protección contra duplicados leía
  estado de React, que no cambia hasta el siguiente render, y salían dos
  peticiones con la misma versión: el segundo recibía 409 **contra uno mismo**.
  Va con una `ref`, y lo pedido mientras otro guardado iba en vuelo se repite
  al terminar en vez de perderse.
- ⚠️ **`multipart/form-data` convierte los saltos de línea a CRLF**, por norma.
  El `\r` final de `## Título` bastaba para que `ModelText` no lo tomara por
  encabezado. `saveDocumentAction` normaliza a `\n` antes de guardar.
