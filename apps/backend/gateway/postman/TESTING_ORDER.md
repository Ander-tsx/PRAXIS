# 🧪 Orden de pruebas — Praxis API

> **Criterio:** de lo más externo (autenticación y usuarios) hacia lo más interno (tareas y checklists).  
> Cada capa depende de que la anterior funcione correctamente; los IDs obtenidos en pasos anteriores se reutilizan en los siguientes.

---

## Variables de entorno requeridas

| Variable | Descripción | Se obtiene en |
|---|---|---|
| `base_url` | URL base del gateway | Configurar manualmente (`http://localhost:3000/api`) |
| `access_token` | JWT de sesión | Se guarda automáticamente al hacer **Register** o **Login** |

---

## Fase 1 — Credenciales (Auth)

> Punto de entrada obligatorio. Sin token no hay acceso al resto de la API.

| # | Request | Método | Endpoint | Qué verificar |
|---|---|---|---|---|
| 1 | **Register** | `POST` | `/auth/register` | `201` · El token se guarda automáticamente en `access_token` |
| 2 | **Login** | `POST` | `/auth/login` | `200` · Confirmar que el token se reemplaza correctamente |
| 3 | **Refresh** | `POST` | `/auth/refresh` | `200` · Nuevo token válido (usar el `refreshToken` del login) |

> ⚠️ **Logout** (`POST /auth/logout`) se prueba al final de toda la sesión.

---

## Fase 2 — Usuarios

> Con el token activo, verificar que el servicio de usuarios responde.

| # | Request | Método | Endpoint | Qué verificar |
|---|---|---|---|---|
| 4 | **Find All** | `GET` | `/users` | `200` · Lista paginada de usuarios |
| 5 | **Find One** | `GET` | `/users/:id` | `200` · Datos del usuario registrado en la Fase 1 |
| 6 | **Update** | `PATCH` | `/users/:id` | `200` · Datos actualizados correctamente |

> 💡 Guardar el `id` del usuario para usarlo en fases posteriores.

---

## Fase 3 — Permisos globales del sistema

> Los permisos de sistema son independientes del proyecto; conviene validarlos antes de crear proyectos.

| # | Request | Método | Endpoint | Qué verificar |
|---|---|---|---|---|
| 7 | **Find All** | `GET` | `/permissions` | `200` · Lista de roles disponibles en el sistema |
| 8 | **Assign** | `POST` | `/permissions/assign` | `200` · Asignar rol `ADMIN` al usuario de prueba |
| 9 | **Get User Roles** | `GET` | `/permissions/user/:userId` | `200` · El usuario ya tiene el rol asignado |
| 10 | **Check** | `POST` | `/permissions/check` | `200` · Confirmar que el usuario tiene el permiso |
| 11 | **Revoke** | `DELETE` | `/permissions/revoke` | `200` · Quitar el rol y verificar que ya no aparece |

---

## Fase 4 — Proyectos

> Un proyecto es el contenedor raíz de todo lo demás.

| # | Request | Método | Endpoint | Qué verificar |
|---|---|---|---|---|
| 12 | **Create** | `POST` | `/projects` | `201` · Guardar el `id` del proyecto creado |
| 13 | **Find All** | `GET` | `/projects` | `200` · El proyecto aparece en la lista |
| 14 | **Find One** | `GET` | `/projects/:id` | `200` · Datos correctos del proyecto |
| 15 | **Update** | `PATCH` | `/projects/:id` | `200` · Nombre y descripción actualizados |

---

## Fase 5 — Roles de proyecto

> Los roles de proyecto definen qué puede hacer cada miembro **dentro** de ese proyecto.  
> Crearlos antes de añadir miembros.

| # | Request | Método | Endpoint | Qué verificar |
|---|---|---|---|---|
| 16 | **Create** | `POST` | `/projects/:projectId/roles` | `201` · Guardar el `id` del rol creado |
| 17 | **Update** | `PATCH` | `/projects/:projectId/roles/:id` | `200` · Permisos del rol actualizados |

---

## Fase 6 — Miembros del proyecto

> Añadir el usuario al proyecto con el rol recién creado.

| # | Request | Método | Endpoint | Qué verificar |
|---|---|---|---|---|
| 18 | **Find All** | `GET` | `/projects/:projectId/members` | `200` · Lista de miembros (vacía al inicio) |
| 19 | **Add** | `POST` | `/projects/:projectId/members` | `201` · Usuario añadido con su `projectRoleId` |
| 20 | **Find All** (verificar) | `GET` | `/projects/:projectId/members` | `200` · El miembro aparece en la lista |

---

## Fase 7 — Workspaces

> Los workspaces organizan el trabajo dentro de un proyecto.

| # | Request | Método | Endpoint | Qué verificar |
|---|---|---|---|---|
| 21 | **Create** | `POST` | `/projects/:projectId/workspaces` | `201` · Guardar el `id` del workspace |
| 22 | **Find All** | `GET` | `/projects/:projectId/workspaces` | `200` · El workspace aparece en la lista |
| 23 | **Update** | `PATCH` | `/projects/:projectId/workspaces/:id` | `200` · Nombre actualizado |

---

## Fase 8 — Boards

> Un board es el tablero Kanban que vive dentro de un workspace.

| # | Request | Método | Endpoint | Qué verificar |
|---|---|---|---|---|
| 24 | **Create** | `POST` | `/workspaces/:workspaceId/boards` | `201` · Guardar el `id` del board |
| 25 | **Find All** | `GET` | `/workspaces/:workspaceId/boards` | `200` · El board aparece en la lista |
| 26 | **Update** | `PATCH` | `/workspaces/:workspaceId/boards/:id` | `200` · Nombre del board actualizado |

---

## Fase 9 — Columns

> Las columnas son los estados del tablero (Ej: *To Do*, *In Progress*, *Done*).

| # | Request | Método | Endpoint | Qué verificar |
|---|---|---|---|---|
| 27 | **Create** (To Do) | `POST` | `/boards/:boardId/columns` | `201` · Guardar `id` de la primera columna |
| 28 | **Create** (In Progress) | `POST` | `/boards/:boardId/columns` | `201` · Guardar `id` de la segunda columna |
| 29 | **Create** (Done) | `POST` | `/boards/:boardId/columns` | `201` · Guardar `id` de la tercera columna |
| 30 | **Reorder** | `PATCH` | `/boards/:boardId/columns/reorder` | `200` · Columnas en el nuevo orden |

---

## Fase 10 — Tasks (núcleo)

> Con toda la estructura lista se pueden crear y gestionar tareas.

| # | Request | Método | Endpoint | Qué verificar |
|---|---|---|---|---|
| 31 | **Create Task** | `POST` | `/boards/:boardId/tasks` | `201` · Guardar `id` de la tarea |
| 32 | **Find All** | `GET` | `/boards/:boardId/tasks` | `200` · La tarea aparece en la lista |
| 33 | **Find One** | `GET` | `/tasks/:id?projectId=…` | `200` · Datos completos de la tarea |
| 34 | **Update** | `PATCH` | `/tasks/:id` | `200` · Campos actualizados |
| 35 | **Assign** | `POST` | `/tasks/:id/assign` | `200` · Asignee actualizado |
| 36 | **Move** | `POST` | `/tasks/:id/move` | `200` · Tarea en nueva columna/estado |
| 37 | **Create Subtask** | `POST` | `/boards/:boardId/tasks` | `201` · Subtarea con `parentTaskId` correcto |

---

## Fase 11 — Checklists

> Los checklists son los ítems más internos; viven dentro de una tarea.

| # | Request | Método | Endpoint | Qué verificar |
|---|---|---|---|---|
| 38 | **Create Item** | `POST` | `/tasks/:taskId/checklists` | `201` · Ítem creado con `id` |
| 39 | **Toggle Item** | `POST` | `/checklists/:id/toggle` | `200` · Estado `checked` cambiado |
| 40 | **Delete Item** | `DELETE` | `/checklists/:id` | `200` · Ítem eliminado |

---

## Fase 12 — Limpieza (teardown)

> Eliminar en orden inverso a la creación para no romper restricciones de FK.

| # | Request | Método | Endpoint |
|---|---|---|---|
| 41 | **Delete Task** | `DELETE` | `/tasks/:id` |
| 42 | **Delete Column** | `DELETE` | `/boards/:boardId/columns/:id` |
| 43 | **Delete Board** | `DELETE` | `/workspaces/:workspaceId/boards/:id` |
| 44 | **Delete Workspace** | `DELETE` | `/projects/:projectId/workspaces/:id` |
| 45 | **Remove Member** | `DELETE` | `/projects/:projectId/members` |
| 46 | **Delete Project Role** | `DELETE` | `/projects/:projectId/roles/:id` |
| 47 | **Delete Project** | `DELETE` | `/projects/:id` |
| 48 | **Delete User** | `DELETE` | `/users/:id` |
| 49 | **Logout** | `POST` | `/auth/logout` |

---

## Resumen visual del flujo

```
Auth (Register/Login)
  └─► Users (verificar perfil)
        └─► Permissions (asignar rol ADMIN)
              └─► Projects (crear proyecto)
                    ├─► Project Roles (definir roles internos)
                    ├─► Members (añadir usuario con rol)
                    └─► Workspaces
                          └─► Boards
                                └─► Columns (To Do / In Progress / Done)
                                      └─► Tasks
                                            ├─► Subtasks
                                            └─► Checklists  ◄── más interno
```

---

> **Tip:** Usa la variable `{{access_token}}` que se guarda automáticamente desde el script de *Register/Login*.  
> Todos los endpoints usan `Bearer {{access_token}}` configurado a nivel de colección.
