# PRAXIS — Contrato de API para el frontend

> Extraído leyendo los controladores del gateway y los servicios, **no** de la documentación.
> Fuente: `apps/backend/gateway/src/**` + `apps/backend/commons/contracts/src/**` (commit `ae01766`).
> Swagger vivo: `http://localhost:3000/api/docs`

---

## Reglas globales

- **Prefijo:** todo cuelga de `/api` (`app.setGlobalPrefix('api')`). Gateway en `:3000`.
- **Auth:** `Authorization: Bearer <accessToken>` en todo excepto `/auth/login`, `/auth/register`, `/auth/refresh`.
- **Rate limit:** 100 req / 60 s (`ThrottlerModule`).
- **Validación:** `whitelist: true` + `forbidNonWhitelisted: true` → **enviar un campo de más devuelve 400**. No mandes propiedades que el DTO no declare.

### Sobre de respuesta — éxito

```jsonc
{ "success": true, "data": <payload>, "meta": {} }
```

### Sobre de respuesta — error

```jsonc
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | CONFLICT |
             UNPROCESSABLE_ENTITY | INTERNAL_SERVER_ERROR | BAD_GATEWAY | HTTP_ERROR",
    "message": "…",
    "details": {}          // en errores de validación: { "errors": ["…", "…"] }
  }
}
```

En validación fallida el `message` es literalmente `"Validation failed"` y los mensajes útiles están en `details.errors`.

### ⚠️ Reglas que rompen cosas si se olvidan

1. **Ninguna ruta de tarea o checklist acepta `projectId` en el body.** Es al revés de como estuvo: el guard lo resuelve desde la ruta y mandarlo responde `400 "property projectId should not exist"`. Se quitó porque, mientras lo elegía el cliente, bastaba con declarar el id de un proyecto propio para leer, editar y borrar tareas de un proyecto ajeno (PENDIENTES-BACKEND §9).
2. **Al mover una tarea manda `columnId` Y `status` coherentes.** `status` es un string que debe igualar el **nombre** de la columna destino, no su id. Quien mueva necesita la correspondencia nombre ↔ id; en la interfaz la resuelve `BoardColumns`, que ya tiene las columnas.
   El mismo hecho por el otro lado: **renombrar una columna cambia el `status` de sus tareas**, y lo hace el backend en cascada. Ver «Columns».
3. Solo el `ownerId` del proyecto hace bypass de permisos. El `admin` global **no** tiene permisos dentro de proyectos ajenos.

---

## Auth — `/api/auth` · público

| Método | Ruta | Body | `data` de respuesta |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ userId, accessToken, refreshToken }` |
| POST | `/auth/register` | `{ email, password }` → 201 | `{ userId, accessToken, refreshToken }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ accessToken }` |
| POST | `/auth/logout` 🔒 | — | `{ success: true }` |

- `password`: 8–64 caracteres. `email`: formato válido.
- **No acepta `firstName`/`lastName` en el registro.** El perfil se crea con nombre vacío.
- Email duplicado → `409` con `message: "El email ya está registrado"`.
- Cuenta no `ACTIVE` → `403 "Cuenta suspendida o inactiva"`.
- JWT: `{ sub: userId, iat, exp }`. Refresh token válido 7 días, sesión en Redis.

---

## Users — `/api/users` 🔒

| Método | Ruta | Entrada | Notas |
|---|---|---|---|
| GET | `/users` | query params | `page`, `limit`, `search`… |
| GET | `/users/me` | — | **Tu perfil**, resuelto desde el token |
| GET | `/users/:id` | — | Incluye `credential.email` |
| PATCH | `/users/:id` | `{ firstName?, lastName? }` | camelCase de entrada y de salida |
| DELETE | `/users/:id` | — | Borra usuario + credencial + sesión Redis |

`data` de listado: `{ items: User[], total: number }`.

```ts
User = { id, credentialId, firstName, lastName, avatarUrl, status, createdAt, updatedAt,
         credential: { email } }
status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
```

`GET /users/me` evita tener que sacar el `sub` del JWT: la sesión es una cookie
httpOnly y el navegador no puede abrirla.

`PATCH /users/:id` **entra en camelCase**, igual que sale. Aceptaba `first_name`
y devolvía `firstName`, así que devolverle el objeto que acababas de leer daba
**200 sin guardar nada**. Las claves viejas se siguen aceptando marcadas como
obsoletas.

---

## Permisos globales — `/api/permissions` 🔒

| Método | Ruta | Body | Requiere |
|---|---|---|---|
| GET | `/permissions` | — | Lista roles globales |
| POST | `/permissions/assign` | `{ userId, roleId }` | rol global `Admin` |
| DELETE | `/permissions/revoke` | `{ userId, roleId }` | rol global `Admin` |
| GET | `/permissions/user/:userId` | — | Roles de un usuario |
| POST | `/permissions/check` | `{ userId, roleName }` | → `{ hasRole: boolean }` |

Roles globales: `admin`, `user` (el guard compara contra el literal `'Admin'`).

---

## Projects — `/api/projects` 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| POST | `/projects` | `{ name, description? }` | — (`ownerId` sale del token) |
| GET | `/projects` | query params (`page`, `limit`, `search`…) | — |
| GET | `/projects/:id` | — | `canViewProject` |
| PATCH | `/projects/:id` | `{ name?, description? }` | `canEditProject` |
| DELETE | `/projects/:id` | — | `canDeleteProject` |

- `name`: 2–100 chars, único **por dueño**. Repetirlo en tu propia cuenta da 409
  («Ya tienes un proyecto llamado X»); otro equipo puede llamar igual al suyo.
- `GET /projects` → `{ items, total }`, filtrado por **dueño o miembro**.

### `PATCH` exige `canEditProject`, no `canEditBoard`

Pedía `canEditBoard`, que es el permiso de otra cosa: renombrar el proyecto no
tiene nada que ver con editar uno de sus tableros. `canEditProject` entra
**implicado por `canEditBoard`**, así que ningún rol existente perdió capacidad
—el mismo movimiento que `canMoveTask`, `canComment` y `canDeleteProject`.

⚠️ **`name` es único por dueño, así que un `PATCH` puede dar 409 a medio texto.**
Si guardas mientras se escribe, hace falta debounce y hace falta que el conflicto
se enseñe **sin perder lo escrito**: el nombre a medias («Redis» camino de
«Rediseño») puede chocar con otro proyecto tuyo.

Un cuerpo vacío no describe ningún cambio: manda solo el campo que cambia.
- `GET /projects/:id` viene con todo el árbol embebido:

```ts
Project = {
  id, name, description, ownerId, createdAt, updatedAt,
  workspaces: [{ id, name, projectId, createdAt,
                 boards: [{ id, name, workspaceId, createdAt,
                            columns: [{ id, name, order, color, boardId }] }] }],   // ordenadas por `order`
  roles: ProjectRole[],
  _count: { members: number }
}
```

Cacheado en Redis 5 min — un cambio puede tardar en reflejarse.

---

## Workspaces 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| GET | `/projects/:projectId/workspaces` | — | — |
| POST | `/projects/:projectId/workspaces` | `{ name }` | `canEditBoard` |
| GET | `/workspaces/:workspaceId` | — | — |
| PATCH | `/workspaces/:workspaceId` | `{ name }` | `canEditBoard` |
| DELETE | `/workspaces/:workspaceId` | — | `canDeleteBoard` |

`name` único dentro del proyecto. Borrar el proyecto cascadea a workspaces → boards → columnas.

---

## Boards 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| POST | `/workspaces/:workspaceId/boards` | `{ name }` | `canCreateBoard` |
| GET | `/workspaces/:workspaceId/boards` | — | — |
| GET | `/boards/:boardId` | — | — |
| PATCH | `/boards/:boardId` | `{ name }` | `canEditBoard` |
| DELETE | `/boards/:boardId` | — | `canDeleteBoard` |

---

## Columns 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| POST | `/boards/:boardId/columns` | `{ name, order, color? }` | `canCreateColumn` |
| PATCH | `/boards/:boardId/columns/reorder` | `{ columnIds: string[] }` | `canEditColumn` |
| PATCH | `/boards/:boardId/columns/:id` | `{ name?, color? }` | `canEditColumn` |
| DELETE | `/boards/:boardId/columns/:id` | — | `canDeleteColumn` |

```ts
Column = { id, name, order, color, boardId }
```

**No hay `GET` de columnas.** Se obtienen embebidas en `GET /projects/:id`.
`reorder` recibe el array completo de IDs en el orden nuevo.

### Color: token del sistema, y de la columna

`color` es un token del design system, igual que en las etiquetas:
`primary` · `accent` · `info` · `warning` · `error` · `success`. Un hex da 400
con la lista de válidos.

Si no se manda al crear, el backend lo reparte **por posición**, rotando entre
los cuatro primeros. Verde y rojo quedan fuera del reparto: el rojo se lee como
una alarma y el verde **significa algo** (ver abajo). A partir de ahí el color es
de la columna y **viaja con ella al reordenarla** — antes lo elegía la interfaz
por índice y moverla le cambiaba el color.

### 🟢 El verde es la columna de cierre

`success` no es solo un color: marca la columna donde el trabajo termina. Las
tareas que están ahí **dejan de contar como pendientes** en
`GET /me/tasks?excludeDone=true`.

Hacía falta porque el `status` de una tarea es el **nombre** de su columna, y ese
nombre lo elige cada proyecto —«Hecho», «Finalizado», «Cerrado», «Done»—, así que
no había forma de saber cuál termina el trabajo: una tarea acabada seguía
contando como pendiente.

⚠️ Es color y significado a la vez, decidido a sabiendas. No se puede tener una
columna verde que no cierre ni una de cierre de otro color. La alternativa limpia
es un campo `isFinal` aparte; el día que haga falta, es una columna más en la
tabla. **Si lo enseñas en una interfaz, dilo donde se elige el color.**

### ⚠️ Renombrar arrastra el `status` de las tareas

`Task.status` guarda el **nombre** de la columna, no su id, así que renombrar
dejaría el estado de todas sus tareas apuntando a un nombre que ya no existe.
El `PATCH` lo resuelve en cascada: si el cuerpo lleva `name`, el gateway avisa a
tasks-service (`task_restatus`) después de confirmar el cambio, y las tareas de
esa columna pasan al nombre nuevo.

Consecuencias para quien llama:

- **Manda solo el campo que cambias.** Un `color` suelto no dispara la cascada;
  mandar `name` sin necesidad provoca una llamada extra entre microservicios.
- Es **idempotente**: solo toca las filas cuyo `status` no coincide ya.
- Es **best-effort**: si tasks-service no responde, la columna ya se renombró y
  el `PATCH` devuelve 200. Se registra en el log del gateway y el siguiente
  renombrado lo cuadra.
- Un cuerpo **vacío** (`{}`) da `400 "No hay nada que cambiar…"`: no describe
  ningún cambio.

### ⚠️ Borrar una columna se lleva sus tareas

Igual que borrar un tablero, un espacio o un proyecto. Antes no: la tarea
conservaba `boardId` y `projectId`, así que seguía abriéndose por su ruta y
contando en «mis tareas», pero no se pintaba en ningún tablero porque su columna
ya no existía. Si la interfaz avisa de cuántas tareas se van, ese número es
real.

---

## Members 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| GET | `/projects/:projectId/members` | — | — |
| POST | `/projects/:projectId/members` | `{ userId, projectRoleId }` | `canManageMembers` |
| DELETE | `/projects/:projectId/members` | `{ userId }` | `canManageMembers` |

⚠️ Un proyecto recién creado **no tiene roles ni miembros**. Hay que crear un `ProjectRole` antes de poder añadir a nadie.

⚠️ **Esto no es invitar, es dar de alta.** Recibe un `userId` —no un correo— y
surte efecto inmediato: la persona entra en el proyecto sin enterarse, sin
aceptar y sin estado "pendiente". No existe ningún flujo de invitación en el
backend (ni tabla, ni token, ni correo). Para pasar de correo a `userId` hay que
traerse `GET /users` y buscar en el cliente, lo que además solo encuentra a
quien ya tiene cuenta. **Llámalo "añadir miembro" en la interfaz**, no
"invitar". Ver PENDIENTES-BACKEND §12.

---

## Project Roles 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| POST | `/projects/:projectId/roles` | `{ name, permissions }` | `canManageRoles` |
| PATCH | `/projects/:projectId/roles/:id` | `{ name?, permissions? }` | `canManageRoles` |
| DELETE | `/projects/:projectId/roles/:id` | — | `canManageRoles` |

**No hay `GET` de roles.** Vienen en `GET /projects/:id` bajo `roles`.

`name`: 2–50 chars, único por proyecto. `permissions` es un objeto plano de booleanos:

```ts
{
  canViewProject?,
  canCreateTask?, canMoveTask?, canEditTask?, canDeleteTask?, canComment?,
  canCreateBoard?, canEditBoard?, canDeleteBoard?,
  canCreateColumn?, canEditColumn?, canDeleteColumn?,
  canManageLabels?, canManageMembers?, canManageRoles?,
  canEditProject?, canDeleteProject?
}
```

> `canEditColumn` **sí existe y sí se usa**: es el permiso de
> `PATCH /boards/:boardId/columns/:id` (renombrar y recolorear), su primer y
> único consumidor. `reorder` sigue pidiendo `canCreateColumn`
> (PENDIENTES-BACKEND §8).

### 🔴 Un array se acepta con 201 y no concede NADA

`permissions` **tiene que ser el objeto de booleanos**. Si mandas un array, el
gateway responde `201` con un cuerpo de aspecto normal y el rol queda creado —
pero vacío. El guard evalúa `permisos[clave]`, y sobre un array eso es
`undefined`.

```ts
// ❌ 201, y quien tenga este rol no podrá hacer nada
{ name: 'Colaborador', permissions: ['canEditBoard'] }

// ✅
{ name: 'Colaborador', permissions: { canEditBoard: true } }
```

Verificado con dos cuentas: el mismo miembro obtiene **403** con el rol guardado
como array y **200** con el mismo permiso como diccionario.

Tampoco se validan las claves: `{ canHackearTodo: true }` devuelve 201. Valida
tú contra la lista de arriba antes de enviar. Ver PENDIENTES-BACKEND §11.

### Jerarquía implícita — refléjala en la interfaz

Al evaluar, el backend expande los permisos hacia abajo
(`project-roles.service.ts`, `PERMISSION_HIERARCHY`):

| Si concedes | También concede |
|---|---|
| `canDeleteBoard` | `canEditBoard`, `canCreateBoard`, `canEditProject` |
| `canEditBoard` | `canCreateBoard`, `canEditProject` |
| `canDeleteColumn` | `canEditColumn`, `canCreateColumn` |
| `canEditColumn` | `canCreateColumn` |
| `canDeleteTask` | `canEditTask`, `canMoveTask`, `canComment`, `canCreateTask` |
| `canEditTask` | `canMoveTask`, `canComment`, `canCreateTask` |
| `canDeleteProject` | `canDeleteBoard`, `canEditBoard`, `canCreateBoard`, `canEditProject` |

`canManageMembers` y `canManageRoles` no arrastran nada.

⚠️ **`expandPermissions` recorre la tabla una sola vez**, así que la expansión no
es transitiva por sí sola: hoy sale bien porque el orden de inserción va de mayor
a menor alcance. Por eso `canEditProject` está escrito en las **tres** entradas
que deben concederlo, aunque quede repetido.

No hace falta guardar los implicados: el backend los deduce al comprobar. Pero
el formulario de roles **debe enseñarlo** —marcar "eliminar" implica "editar" y
"crear"— o el usuario creerá que está dando menos permiso del que da.

✅ **Hay permiso de lectura.** `canViewProject` es el suelo de la jerarquía
—cualquier permiso lo implica— y es lo que exige `GET /projects/:id`, así que un
rol de solo lectura se modela con él y nada más.

### Los permisos se cachean 5 minutos

`project:<projectId>:user:<userId>:permissions` en Redis, TTL 300s. Se invalida
al cambiar un rol y al añadir un miembro, así que el camino normal es
consistente; tenlo en cuenta si algo parece no aplicarse.

---

## Tasks 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| POST | `/boards/:boardId/tasks` | ver abajo → 201 | `canCreateTask` |
| GET | `/boards/:boardId/tasks?columnId&page&limit` | — ✅ query params | `canViewProject` |
| GET | `/tasks/:id` | — | `canViewProject` |
| PATCH | `/tasks/:id` | `{ title?, description?, status?, columnId?, assigneeIds?, priority?, dueDate? }` | `canEditTask` |
| POST | `/tasks/:id/move` | `{ columnId, status?, order? }` | `canMoveTask` ⚠️ |
| POST | `/tasks/:id/assign` | `{ assigneeIds }` | `canEditTask` |
| DELETE | `/tasks/:id` | — | `canDeleteTask` |

⚠️ **Ninguna lleva `projectId`.** Lo resuelve el guard desde la ruta; mandarlo da 400.

### Mover no es editar

`POST /tasks/:id/move` es el único endpoint que pide **`canMoveTask`**. Existe
porque arrastrar una tarjeta a «Hecho» exigía `canEditTask`, que también deja
reescribir el título, cambiar la prioridad y reasignar a quien sea: quien ejecuta
el trabajo no podía decir que lo terminó sin poder redefinir en qué consistía.

La jerarquía dice `canEditTask → canMoveTask`, así que ningún rol pierde nada.

⚠️ `PATCH /tasks/:id` **también** acepta `columnId` y `status`, y sigue exigiendo
`canEditTask`. No es un agujero —quien edita puede mover por definición—, pero si
lo que quieres es solo mover, usa la ruta de mover.

### Encargados: `assigneeIds`, no `assigneeId`

`Task.assigneeId` **ya no existe**. Una tarea puede tener varios encargados y
viven en una tabla aparte. Mandar `assigneeId` da 400.

- `assigneeIds` es el conjunto **completo**: sustituye a los que hubiera, no
  añade. Es lo que hace un selector múltiple al cerrarse, y así repetir la
  llamada no acumula. `[]` desasigna a todo el mundo.
- En `PATCH`, **omitirlo** deja los encargados como estaban; mandarlo vacío los
  quita. No es lo mismo.
- Cada id tiene que ser **miembro del proyecto** (o el dueño). Si no:
  `400 "Esa persona no es miembro del proyecto"`. Saca la lista de
  `GET /projects/:id/members`.
- Máximo 20 por tarea.

La tarea sale con `assignees`, no con `assigneeIds`:

```ts
assignees: [{ id, taskId, userId, assignedBy, assignedAt }]
```

Son ids: tasks-service no conoce a los usuarios. El nombre lo resuelve la
interfaz contra los miembros del proyecto, que ya carga.

Body de creación:

```ts
{
  columnId,           // requerido
  title,              // 1–255
  status,             // requerido — debe coincidir con el nombre de la columna
  description?,
  assigneeIds?,       // string[] — encargados iniciales, miembros del proyecto
  dueDate?,           // ISO 8601
  priority?,          // 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' (default MEDIUM)
  order?,             // int ≥ 0
  parentTaskId?       // si viene → se crea como SUBTAREA (el gateway usa otro comando interno)
}
```

`boardId`, `projectId` y `requesterId` los inyecta el gateway; **no los mandes** (`forbidNonWhitelisted` → 400).

```ts
Task = { id, title, description, status, boardId, columnId, reporterId,
         projectId, parentTaskId, dueDate, priority, order, createdAt, updatedAt,
         assignees, subtasks, checklists }
```

Las cinco rutas que devuelven tareas traen **la misma forma**: `assignees`,
`subtasks` y `checklists` siempre vienen, también en el listado del tablero. Así
la interfaz no tiene que saber de dónde salió cada tarea.

`dueDate: null` en un `PATCH` quita la fecha límite.

---

## Etiquetas 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| GET | `/projects/:projectId/labels` | — | `canViewProject` |
| POST | `/projects/:projectId/labels` | `{ name, color }` → 201 | `canManageLabels` |
| PATCH | `/projects/:projectId/labels/:id` | `{ name?, color? }` | `canManageLabels` |
| DELETE | `/projects/:projectId/labels/:id` | — | `canManageLabels` |

```ts
Label = { id, projectId, name, color, createdAt }
```

- Son del **proyecto**, no del tablero: la misma etiqueta sirve en todos sus
  tableros.
- `color` es un **token del design system**, no un hex:
  `primary` · `accent` · `success` · `warning` · `error` · `info`. Cualquier
  otra cosa da 400 con la lista de válidos.
- `name` es único por proyecto: repetirlo da **409** con su mensaje.
- Borrarla la quita de todas las tareas que la llevaban (la relación cascadea).
  La respuesta trae `removedFrom` con cuántas eran.

Para poner etiquetas en una tarea se usa `labelIds` en crear y actualizar, con
la misma semántica que `assigneeIds`: **conjunto completo**, sustituye. Una
etiqueta de otro proyecto da `400 "Alguna etiqueta no existe o no es de este
proyecto"`.

La tarea sale con `labels`, que trae la etiqueta entera embebida:

```ts
labels: [{ taskId, labelId, label: Label }]
```

Gestionarlas exige **`canManageLabels`**, su permiso propio desde `ee8be65`.
Antes las gobernaba `canEditTask`: quien podía tocar una tarea rehacía el
vocabulario del proyecto entero.

---

## Comentarios 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| GET | `/tasks/:taskId/comments` | — | `canViewProject` |
| POST | `/tasks/:taskId/comments` | `{ body }` → 201 | `canComment` |
| PATCH | `/tasks/:taskId/comments/:id` | `{ body }` | `canComment` + **ser el autor** |
| DELETE | `/tasks/:taskId/comments/:id` | — | `canComment` + autor **o** `canDeleteTask` |

```ts
TaskComment = { id, taskId, authorId, body, createdAt, editedAt }
```

- Orden cronológico, del más antiguo al más nuevo.
- `body`: 1–4000 caracteres.
- `editedAt` es `null` mientras no se toque el texto; solo se marca al editarlo
  de verdad, no en cada escritura de la fila.
- **Editar es solo del autor**, aunque puedas moderar: moderar es poder retirar
  lo que otro escribió, no reescribirlo con su nombre. Ajeno → `403 "Solo
  puedes editar tus propios comentarios"`.
- **Borrar** lo puede el autor o quien tenga `canDeleteTask`.
- `authorId` es un id: el nombre lo resuelve la interfaz contra los miembros.

Comentar exige **`canComment`**, su permiso propio desde `ee8be65`. Antes pedía
`canEditTask`, así que un perfil de solo lectura leía el hilo y no podía
responder.

⚠️ Los comentarios **viajan dentro de la tarea** (`task.comments`), también en
`GET /boards/:id/tasks`. Se decidió así para que la revalidación de la página
los refresque sin un segundo camino de datos; el coste es un listado más
pesado.

---

## Adjuntos 🔒

| Método | Ruta | Cuerpo | Permiso |
|---|---|---|---|
| GET | `/tasks/:taskId/attachments` | — | `canViewProject` |
| POST | `/tasks/:taskId/attachments` | **multipart**, campo `file` → 201 | `canEditTask` |
| GET | `/tasks/:taskId/attachments/:id/content` | — | `canViewProject` |
| DELETE | `/tasks/:taskId/attachments/:id` | — | `canEditTask` + quien lo subió **o** `canDeleteTask` |

```ts
TaskAttachment = { id, taskId, filename, mimeType, size, uploadedBy, createdAt }
```

**Los bytes nunca vienen en el listado ni en la tarea.** Viven en otra tabla y
solo se leen en la ruta de `/content`. `task.attachments` trae los metadatos.

- **Máximo 10 MB** por archivo. Pasarse da **413** `"File too large"`, que lo
  corta multer antes de leerlo entero.
- **Lista blanca de tipos**: PNG, JPEG, GIF, WebP, PDF, texto plano, CSV, ZIP,
  Word y Excel. Otro tipo da 400 con el mime rechazado.
- **El SVG no se admite**: es XML con scripts, y servirlo desde el mismo origen
  que la aplicación sería XSS.

### Cómo se sirve la descarga

| Tipo | `Content-Disposition` |
|---|---|
| PNG · JPEG · GIF · WebP | `inline` — se puede usar en un `<img>` |
| Todo lo demás, PDF incluido | `attachment` — descarga forzada |

Siempre con `X-Content-Type-Options: nosniff` y `Cache-Control: private`.

⚠️ **Enlaza al proxy de la zona, no al gateway.** El gateway está en otro puerto
y la sesión es una cookie httpOnly del origen de la aplicación: un enlace a
`:3000` iría sin credenciales y daría 401. Lo correcto es
`/projects/api/gateway/tasks/:taskId/attachments/:id/content`.

Se guardan en Postgres porque la infra son Postgres y Redis. Con cientos de
archivos va sobrado; el punto por donde cortar si algún día pesa es la tabla
`attachment_blobs`, y la API no cambiaría.

---

## Mis tareas 🔒

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/me/tasks?dueBefore&status&priority&projectId&limit` | — (solo las tuyas) |

Devuelve `{ items, total }` con la misma forma de `Task` que las demás rutas.

**No existe `GET /tasks?assigneeId=`**, que era como lo pedía PENDIENTES §5:
con el id como parámetro cualquiera consultaría las tareas de cualquiera. El
usuario sale del token.

| Parámetro | Qué hace |
|---|---|
| `dueBefore` | ISO 8601. Solo con fecha límite **anterior**. Las tareas **sin fecha quedan fuera** |
| `status` | Nombre de la columna. Para dejar fuera lo terminado |
| `priority` | `LOW` · `MEDIUM` · `HIGH` · `URGENT` |
| `projectId` | Acota a un proyecto |
| `excludeDone` | `true` deja fuera las tareas que están en una **columna verde** (de cierre) |
| `limit` | Por defecto 50, máximo 100 |

Orden: lo que vence antes primero, y a igualdad de fecha lo más urgente.

**Para los avisos del panel, una sola petición basta.** Pide
`?dueBefore=<hoy+7d>&excludeDone=true` y separa en cliente comparando con ahora:
lo anterior es **vencido** y lo posterior **vence pronto**. Son dos avisos
distintos y no se mezclan en un contador único.

⚠️ `excludeDone` filtra **después** de aplicar `limit`, porque para saber qué
columnas excluir hay que conocer las de las tareas que ya salieron. Puede
devolver menos de lo pedido. Y si projects-service no responde, devuelve las
tareas **sin filtrar** en vez de fallar: enseñar de más en un aviso es mejor que
quedarse sin panel.

⚠️ Solo trae tareas de proyectos donde **sigues estando**. Salir de un proyecto
no borra tus asignaciones —las filas siguen en la base—, pero dejan de salir
aquí. Verificado: tras salir, 6 filas de asignación vivas y `items: []`.

---

## Avisos 🔒

| Método | Ruta | Entrada | Notas |
|---|---|---|---|
| GET | `/me/notifications?limit&unreadOnly` | — | `{ items, total, unread }` |
| PATCH | `/me/notifications/:id/read` | — | Solo las tuyas |
| POST | `/me/notifications/read-all` | — | → `{ marked }` |

```ts
Notification = { id, userId, type, actorId, projectId, projectName,
                 taskId, taskTitle, readAt, createdAt }

type: 'INVITATION_RECEIVED' | 'INVITATION_ACCEPTED' | 'INVITATION_REJECTED'
    | 'MEMBER_LEFT' | 'MEMBER_REMOVED' | 'TASK_ASSIGNED' | 'TASK_UNASSIGNED'
```

Cuelga de `/me` como las tareas y las invitaciones: **el usuario sale del token**,
nunca de la petición. No existe una ruta con `userId` por parámetro porque sería
leer la bandeja de cualquiera.

- **`unread` viaja siempre**, también con `unreadOnly=true`: es lo que pinta la
  insignia, y sacarlo de `items.length` daría un número recortado por el `limit`.
- **Nadie recibe aviso de lo que hizo él.** Se filtra al crear, así que un evento
  que solo te afecta a ti no genera nada.
- **`projectName` y `taskTitle` son copias del momento**, no referencias: el
  aviso sobrevive al borrado del proyecto o la tarea. Píntalos tal cual; no
  intentes resolverlos.
- `actorId` es un id, como en encargados y comentarios: el nombre lo resuelve la
  pantalla contra el directorio.
- Marcar una ajena responde **404**, no 403: no se confirma que exista.
- No hay `TASK_EDITED` a propósito: emitirlo en cada `PATCH` llenaría la bandeja
  de ruido y el aviso útil se perdería.

⚠️ **No hay tiempo real.** Ni WebSocket ni SSE: la interfaz reconsulta cada 60 s.

---

## Checklists 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| POST | `/tasks/:taskId/checklists` | `{ text, order? }` | `canEditTask` |
| POST | `/tasks/:taskId/checklists/:id/toggle` | — | `canMoveTask` ⚠️ |
| DELETE | `/tasks/:taskId/checklists/:id` | — | `canEditTask` |

⚠️ **Marcar un paso pide `canMoveTask`, no `canEditTask`:** marcarlo es ejecutar
el trabajo, no redefinirlo. Añadir y borrar pasos sí es definir la tarea.

⚠️ Igual que en tareas: **sin `projectId`**, que lo pone el guard.

```ts
Checklist = { id, taskId, text, completed, order }
```

No hay `GET`; llegan embebidos en `GET /tasks/:id`.

---

## Flujo mínimo para dejar un proyecto usable

```
POST /auth/register            → accessToken
POST /projects                 → projectId
POST /projects/:id/roles       → projectRoleId   (obligatorio antes de añadir miembros)
POST /projects/:id/members     → { userId, projectRoleId }
POST /projects/:id/workspaces  → workspaceId
POST /workspaces/:wid/boards   → boardId
POST /boards/:bid/columns  ×N  → columnIds       (guarda name ↔ id: `status` usa el name)
POST /boards/:bid/tasks        → { columnId, title, status: <name de la columna> }
```

---

## No existe (y lo necesitamos)

- `GET /projects/:projectId/roles`
- `GET /boards/:boardId/columns`
- `POST /projects/:id/members` que acepte **email**
- Dominio de **reportes** completo
- **Logs / auditoría**
- Subida de avatar (`avatarUrl` existe en el modelo, no hay endpoint)
- **Tiempo real** para los avisos: hoy la bandeja reconsulta cada 60 s
