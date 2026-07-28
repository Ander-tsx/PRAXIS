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

1. **Toda mutación de tarea o checklist debe llevar `projectId` en el body.** El guard de permisos no logra resolver el proyecto desde la ruta y depende de ese campo. Sin él: `403 "Contexto de proyecto no encontrado en la petición"`.
2. **Al mover una tarea manda `columnId` Y `status` coherentes.** `status` es un string que debe igualar el nombre de la columna destino.
3. **Listar y paginar `/projects` y `/users` requiere body en un GET** — imposible desde `fetch`. Sin filtros solo se obtiene la página 1 por defecto (limit 20).
4. Solo el `ownerId` del proyecto hace bypass de permisos. El `admin` global **no** tiene permisos dentro de proyectos ajenos.

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
| GET | `/users` | `@Body FindUsersDto` ⚠️ | `{ query:{page,limit,sortBy,sortOrder}, filters:{search,createdFrom,createdTo} }`. **Body en GET.** |
| GET | `/users/:id` | — | Incluye `credential.email` |
| PATCH | `/users/:id` | `{ first_name?, last_name? }` ⚠️ | **Entra snake_case, sale camelCase** |
| DELETE | `/users/:id` | — | Borra usuario + credencial + sesión Redis |

`data` de listado: `{ items: User[], total: number }`.

```ts
User = { id, credentialId, firstName, lastName, avatarUrl, status, createdAt, updatedAt,
         credential: { email } }
status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
```

No existe `GET /users/me`.

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
| GET | `/projects` | `@Body FindProjectsDto` ⚠️ | — |
| GET | `/projects/:id` | — | `canEditBoard` ⚠️ |
| PATCH | `/projects/:id` | `{ name?, description? }` | `canEditBoard` |
| DELETE | `/projects/:id` | — | `canDeleteBoard` ⚠️ |

- `name`: 2–100 chars y **único a nivel global**, no por usuario → colisiones entre equipos.
- `GET /projects` → `{ items, total }`. **Devuelve todos los proyectos del sistema** (el filtro por usuario está roto).
- `GET /projects/:id` viene con todo el árbol embebido:

```ts
Project = {
  id, name, description, ownerId, createdAt, updatedAt,
  workspaces: [{ id, name, projectId, createdAt,
                 boards: [{ id, name, workspaceId, createdAt,
                            columns: [{ id, name, order, boardId }] }] }],   // ordenadas por `order`
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
| POST | `/boards/:boardId/columns` | `{ name, order }` | `canCreateColumn` |
| PATCH | `/boards/:boardId/columns/reorder` | `{ columnIds: string[] }` | `canCreateColumn` ⚠️ |
| DELETE | `/boards/:boardId/columns/:id` | — | `canDeleteColumn` |

**No hay `GET` de columnas.** Se obtienen embebidas en `GET /projects/:id`.
`reorder` recibe el array completo de IDs en el orden nuevo.

---

## Members 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| GET | `/projects/:projectId/members` | — | — |
| POST | `/projects/:projectId/members` | `{ userId, projectRoleId }` | `canManageMembers` |
| DELETE | `/projects/:projectId/members` | `{ userId }` | `canManageMembers` |

⚠️ Un proyecto recién creado **no tiene roles ni miembros**. Hay que crear un `ProjectRole` antes de poder invitar a nadie.

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
  canCreateTask?, canEditTask?, canDeleteTask?,
  canCreateBoard?, canEditBoard?, canDeleteBoard?,
  canCreateColumn?, canDeleteColumn?,
  canManageMembers?, canManageRoles?
}
```

> El DTO también admite `canEditColumn`, pero **no existe en el enum `ProjectPermission`** ni lo usa ningún endpoint. No lo uses.

---

## Tasks 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| POST | `/boards/:boardId/tasks` | ver abajo → 201 | `canCreateTask` |
| GET | `/boards/:boardId/tasks?columnId&page&limit` | — ✅ query params | — |
| GET | `/tasks/:id` | — | — |
| PATCH | `/tasks/:id` | `{ projectId, title?, description?, status?, columnId?, assigneeId?, priority?, dueDate? }` | `canEditTask` |
| POST | `/tasks/:id/move` | `{ projectId, columnId, status?, order? }` | `canEditTask` |
| POST | `/tasks/:id/assign` | `{ projectId, assigneeId? }` | `canEditTask` |
| DELETE | `/tasks/:id` | `{ projectId }` | `canDeleteTask` |

Body de creación:

```ts
{
  projectId,          // requerido — UUID v4
  columnId,           // requerido
  title,              // 1–255
  status,             // requerido — debe coincidir con el nombre de la columna
  description?,
  assigneeId?,
  dueDate?,           // ISO 8601
  priority?,          // 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' (default MEDIUM)
  order?,             // int ≥ 0
  parentTaskId?       // si viene → se crea como SUBTAREA (el gateway usa otro comando interno)
}
```

`boardId` y `requesterId` los inyecta el gateway; **no los mandes** (`forbidNonWhitelisted` → 400).

```ts
Task = { id, title, description, status, boardId, columnId, assigneeId, reporterId,
         projectId, parentTaskId, dueDate, priority, order, createdAt, updatedAt,
         subtasks?, checklists? }
```

`assigneeId: null` para desasignar (el DTO lo declara opcional; verificar comportamiento real con `null` explícito).

---

## Checklists 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| POST | `/tasks/:taskId/checklists` | `{ projectId, text, order }` | `canEditTask` |
| POST | `/tasks/:taskId/checklists/:id/toggle` | `{ projectId }` | `canEditTask` |
| DELETE | `/tasks/:taskId/checklists/:id` | `{ projectId }` | `canEditTask` |

```ts
Checklist = { id, taskId, text, completed, order }
```

No hay `GET`; llegan embebidos en `GET /tasks/:id`.

---

## Flujo mínimo para dejar un proyecto usable

```
POST /auth/register            → accessToken
POST /projects                 → projectId
POST /projects/:id/roles       → projectRoleId   (obligatorio antes de invitar)
POST /projects/:id/members     → { userId, projectRoleId }
POST /projects/:id/workspaces  → workspaceId
POST /workspaces/:wid/boards   → boardId
POST /boards/:bid/columns  ×N  → columnIds       (guarda name ↔ id: `status` usa el name)
POST /boards/:bid/tasks        → { projectId, columnId, title, status: <name de la columna> }
```

---

## No existe (y lo necesitamos)

- `GET /users/me` · `GET /auth/me`
- `GET /projects` filtrado por membresía real
- `GET /projects/:projectId/roles`
- `GET /boards/:boardId/columns`
- Mis permisos efectivos en un proyecto
- Dominio de **reportes** completo
- **Logs / auditoría**
- Notificaciones
- Subida de avatar (`avatarUrl` existe en el modelo, no hay endpoint)
