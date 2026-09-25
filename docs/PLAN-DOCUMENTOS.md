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

---

## Etapa 2 — editor en bloques, tiempo real, compartir y documentos en las tareas

> Abierta el 2026-09-25, rama `feature/scrum-kanban`. Pedida por el dueño del
> producto: «un editor de texto enriquecido de primer nivel, similar a Notion
> pero con identidad propia», sin selector escribir/leer, con imágenes, vídeos
> y enlaces con vista previa (Docs, Meet, Sheets…), compartir como Google Docs,
> y que las tareas adjunten documentos en vez de PDF.
>
> **Sustituye a D2, D4 y D6** de la primera etapa. D1, D3 y D7 siguen.

### Las cuatro decisiones del dueño del producto (2026-09-25)

1. **Editar por enlace exige cuenta.** «Cualquiera con el enlace» puede leer
   sin sesión; para editar hay que entrar con cualquier cuenta Praxis. Todo
   cambio queda firmado.
2. **Tiempo real desde ya**, no por fases.
3. **Imágenes subidas; vídeo incrustado.** Imágenes hasta 5 MB, contando en el
   almacenamiento de la organización. Vídeo por enlace (YouTube, Loom, Vimeo,
   Google Drive). Los archivos viven en Postgres y un vídeo no cabe ahí.
4. **Un invitado por correo no ocupa asiento.** Ve ese documento y nada más.

### Las decisiones de diseño

**E1 — El editor es TipTap 3, en bloques, y se guarda en Markdown.** TipTap es
ProseMirror sin estilos: da la estructura en bloques (menú `/`, asa para
arrastrar cada bloque, atajos Markdown al escribir, menú flotante de formato)
y la identidad visual es nuestra. BlockNote daba lo mismo hecho, pero con su
aspecto y un Markdown con pérdidas. Se escribe sobre lo ya pintado: no hay
modo «Escribir/Leer». Quien no puede editar ve el mismo editor sin cursor.

**E2 — La verdad en vivo es un documento Yjs; el Markdown es su copia.**
`Document.yState` guarda el estado de Yjs (lo que permite fusionar dos
personas escribiendo a la vez) y `Document.content` sigue siendo Markdown,
regenerado en cada guardado: es lo que leen PRAX, la búsqueda, la exportación
y la lectura pública. Un documento viejo sin `yState` se construye desde su
Markdown la primera vez que se abre. Todo lo que el editor sabe hacer tiene
forma en Markdown:

| Bloque | Markdown |
|---|---|
| Títulos, listas, citas, código, tablas, separador | CommonMark + GFM |
| Lista de tareas | `- [ ]` / `- [x]` |
| Aviso (nota, consejo, cuidado) | `> [!NOTE]` de GFM |
| Imagen | `![texto](/api/documents/:id/assets/:assetId)` |
| Enlace con vista previa | `[card](url)` solo en su párrafo |
| Vídeo o documento incrustado | `[embed](url)` solo en su párrafo |

Los dos últimos son **enlaces normales** en cualquier otro visor: si el
Markdown sale de Praxis, se sigue leyendo.

**E3 — El tiempo real va en un servicio nuevo, `collab-service` (puerto 3010,
WebSocket), con Hocuspocus.** No pasa por el proxy de Next —que no sabe de
WebSockets— sino directo, con un **billete**: el navegador pide al gateway
`POST /documents/:id/collab-ticket`, que comprueba el acceso y firma un JWT de
un minuto (`typ: collab`, documento, persona, lectura o edición). Hocuspocus lo
valida al conectar y **no acepta escrituras de un billete de lectura**. Carga
y guarda a través de projects-service por TCP, como cualquier otro servicio:
ninguno toca la base de otro. Guarda con retardo (2 s de calma, 10 s como
mucho), así que un documento vivo no es una escritura por tecla.

⚠️ En producción `collab-service` tiene que ser alcanzable por el navegador
(`NEXT_PUBLIC_COLLAB_URL`, `wss://`). Es el primer servicio que se expone
fuera del gateway, y es a propósito: solo acepta billetes firmados.

**E4 — El contenido solo se escribe por el tiempo real.** La API REST crea
documentos (con contenido inicial), los renombra y los borra, pero **no
cambia su contenido**: un `PATCH` de texto mientras otros tienen el documento
abierto se lo perdería el siguiente guardado de Yjs. El `409 DOCUMENT_CHANGED`
de D4 deja de hacer falta: Yjs fusiona.

**E5 — Historial de versiones.** `DocumentRevision` guarda el Markdown al
guardar si pasaron 10 minutos desde la anterior o cambió quién escribe. Se ve
en el documento y se restaura **desde el editor** (la versión entra como un
cambio más, que los demás ven llegar), no reescribiendo la base por detrás.

**E6 — Imágenes: `DocumentAsset` en projects-service**, con los bytes en su
propia fila como `AttachmentBlob` de tasks. 5 MB, PNG/JPEG/GIF/WebP (SVG no:
puede llevar script). El almacenamiento de la organización pasa a sumar
también estos bytes (`almacenamientoOrgMb`, CLAUDE.md trampa 23). Se sirven
por el gateway con el mismo control de acceso que el documento.

**E7 — Vista previa de enlaces en el gateway, con defensas de SSRF.**
`GET /link-preview?url=` lee la página (solo `http(s)`, resuelve el DNS y
rechaza direcciones privadas, de bucle y de enlace local, en cada redirección;
4 s y 512 KB como mucho) y devuelve título, descripción, imagen y sitio. Se
cachea un día en Redis. Los proveedores conocidos —Google Docs, Sheets,
Slides, Drive, Meet, Calendar, Figma, YouTube, Loom, Vimeo, GitHub, Notion,
Miro— se reconocen por la URL **sin pedir nada**, con su icono y nombre.
⚠️ Un documento **privado** de Google no deja leer su título sin la sesión de
Google de quien lo abre: la tarjeta dice «Documento de Google» y abre el
enlace. Traer títulos reales es la integración con Google, que es otra etapa.

**E8 — Tres niveles de acceso, como Google Docs.**

| Quién | Cómo | Puede |
|---|---|---|
| Miembros del proyecto | Siempre | Leer con `canViewProject`; editar con `canEditDocuments` |
| Cualquiera con el enlace | `Document.linkAccess`: `NONE` (defecto), `READ`, `EDIT` | Leer sin sesión; editar con sesión (decisión 1) |
| Invitados por correo | `DocumentInvite { email, role }` | Lo que diga su papel, entrando con **ese** correo |

El enlace lleva un `linkToken` aleatorio que se puede regenerar (revoca el
anterior). La invitación manda un correo con el enlace; si la persona no tiene
cuenta, se registra con ese correo —la verificación de correo es lo que prueba
que es suya—. Los invitados no ocupan asiento (decisión 4) y no ven nada más
del proyecto: el acceso compartido **no** pasa por el guard de proyecto, tiene
sus propias rutas (`/shared-documents/:id`) y comprueba enlace o invitación.

La página pública es `/d/<id>?k=<token>`, fuera de `PREFIJOS_PRIVADOS`: el
guard no la intercepta y ella decide si pedir sesión.

**E9 — Las tareas adjuntan documentos.** `TaskDocument { taskId, documentId }`
en tasks-service; el gateway comprueba que el documento es del mismo proyecto
y compone los títulos (tasks no sabe de documentos). En el panel de la tarea,
la sección «Documentos» vincula uno existente o **crea uno nuevo** —eligiendo
espacio de documentos o creando uno— y lo abre. Los PDF siguen, plegados bajo
«Adjuntar archivo».

**E10 — La barra lateral crea.** Cada proyecto tiene «+ Nuevo»: espacio
(tableros o documentos), tablero (Kanban o Scrum) y documento (en qué espacio,
o uno nuevo). Los espacios llevan icono por tipo y los de documentos enseñan
sus documentos con su propio icono.

**E11 — La paleta es la cálida, siempre.** Todo lo nuevo va bajo
`data-tone="dark"` (negro casi puro, tokens redefinidos en `theme.css`), con
títulos en sans. El `Dialog` de commons gana `tone="dark"` como ya lo tenía
`SlideOver`: los diálogos de la etapa de Scrum salieron en la paleta azulada
vieja y con Redaction, y así se ven desentonados.

### El orden

| # | Qué | Commit |
|---|---|---|
| 0 | Pendientes de Scrum: paneles que no se apilan, panel del sprint en vez de `⋯`, diálogos en tono cálido, autodesplazamiento al traer del backlog, espaciado de la cabecera, S8/S14/S15/S22/R4 | `feat(scrum)` |
| 1 | Barra lateral: iconos por tipo y «+ Nuevo» | `feat(sidebar)` |
| 2 | Backend de documentos: `yState`, acceso, invitaciones, imágenes, versiones, vista previa, billete | `feat(documentos)` |
| 3 | `collab-service` | `feat(documentos)` |
| 4 | Editor TipTap en bloques con tiempo real | `feat(documentos)` |
| 5 | Compartir y la página `/d/` | `feat(documentos)` |
| 6 | Documentos en las tareas | `feat(documentos)` |
| 7 | e2e y registro | `test` / `docs` |

### Registro de la etapa 2

#### 2026-09-25 — entregada entera (sesión nocturna, con el dueño del producto dormido)

| # | Commit | Qué |
|---|---|---|
| 0 | `cd1f8c5` | Pendientes de Scrum (ver D21 en `PLAN-SCRUM-KANBAN.md`) |
| 1 | `61a6c72` | Barra lateral: iconos por tipo, documentos bajo su espacio, «+» por proyecto |
| 2 | `ff88c97` | Backend: `yState`, enlace, invitaciones, imágenes, versiones, vista previa, billete |
| 3 | `20041c3` | `collab-service` y `@praxis/editor-schema` |
| 4–5 | `aef5fcf` | Editor en bloques en tiempo real, compartir y `/d/<id>` |
| 6 | `4293d26f` | Documentos en las tareas |

Verificado: e2e `10-documentos` reescrita (bloques, dos sesiones viéndose en
vivo, Markdown en el servidor, enlace de lectura sin cuenta, 401 sin token),
junto con `02-guards`, `08-panel-de-tarea` y `09-scrum`; 19 pruebas de ida y
vuelta del Markdown y 21 de las defensas SSRF. A mano: una persona invitada que
no es del proyecto entra con su cuenta, vuelve sola al documento y edita, sin
ocupar asiento.

**Trampas que aparecieron:**

- 🔴 **El proveedor de Hocuspocus no se crea en el inicializador de
  `useState`.** En modo estricto React monta, desmonta y vuelve a montar: la
  limpieza destruía el proveedor y el segundo montaje reutilizaba el destruido.
  El editor se quedaba «Guardando…» para siempre, sin un error en ninguna
  consola —desde Node conectaba perfectamente—. Va dentro de un `useEffect`.
- 🔴 **`@praxis/editor-schema` es ESM, y tiene que serlo.** Compilado como CJS,
  el navegador y collab cargaban **dos copias de TipTap** (la CJS por el esquema
  y la ESM por el resto) y TypeScript veía dos tipos `AnyExtension`
  incompatibles. Se reconstruye con `pnpm build:shared`.
- ⚠️ **El guard de proyecto tiene una lista escrita de controladores de
  tarea** (`TASK_CONTROLLERS`). Un controlador nuevo con `:taskId` que no esté
  en ella responde 403 «Contexto de proyecto no encontrado» a todo.
- ⚠️ **`WorkspaceCanvas` leía `?doc=` solo al montarse.** Un enlace de la
  barra lateral o «Crear y abrir» desde una tarea navegaban al documento nuevo y
  seguían enseñando el anterior. Ahora sigue a la URL.
- ⚠️ Los comandos de TipTap (`toggleBold`…) los declara cada extensión
  ampliando `@tiptap/core`; como las extensiones llegan por el esquema, `web`
  los importa como tipos en `DocumentEditor/tiptap-comandos.d.ts`.
- ⚠️ `/api/gateway` exige sesión, así que la lectura por enlace va por su
  propia puerta, `/api/doc/*`, limitada a `/documents/<uuid>` del gateway.

**Queda abierto:**

- En local el correo de invitación no sale (no hay SMTP); la invitación vale
  igual y el enlace se puede pasar a mano. En producción usa el mismo envío que
  las invitaciones a organización.
- Traer el título real de un documento **privado** de Google exige la
  integración con Google (OAuth): hoy la tarjeta dice «Documento de Google».
- El título se renombra por REST, fuera del tiempo real: dos personas
  renombrando a la vez se pisan (gana la última).
- PRAX todavía no lee documentos.
