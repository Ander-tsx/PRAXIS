# Praxis — Documentación de API (CRUDs y Módulos)

> **Proyecto:** Praxis — Gestión de proyectos estilo Trello/Jira  
> **Backend:** NestJS + TypeORM + PostgreSQL  
> **Seguridad:** JWT + Guards de privilegios dinámicos  
> **Formato de respuestas:** JSON  
> **Base URL:** `/api/v1`

---

## Índice

1. [Auth](#1-auth)
2. [Privileges — Roles y Privilegios](#2-privileges--roles-y-privilegios)
3. [Users](#3-users)
4. [Projects](#4-projects)
5. [Project Roles](#5-project-roles)
6. [Boards](#6-boards)
7. [Board Columns](#7-board-columns)
8. [Tasks](#8-tasks)
9. [Task Assignees](#9-task-assignees)
10. [Task Tags](#10-task-tags)
11. [Costs](#11-costs)
12. [Reports](#12-reports)
13. [Activity Log](#13-activity-log)

---

## 1. Auth

### Descripción general

El módulo de autenticación es la puerta de entrada al sistema. Se encarga del ciclo de vida completo de la sesión: registro de usuarios, validación de credenciales, emisión y renovación de tokens JWT, y cierre de sesión. Utiliza `bcrypt` para el hash de contraseñas y emite pares de tokens (`access_token` + `refresh_token`) para mantener sesiones seguras sin requerir que el usuario vuelva a iniciar sesión frecuentemente.

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/register` | Registra un nuevo usuario en el sistema |
| `POST` | `/auth/login` | Autentica a un usuario y emite tokens JWT |
| `POST` | `/auth/refresh` | Renueva el `access_token` usando el `refresh_token` |
| `POST` | `/auth/logout` | Cierra la sesión e invalida el `refresh_token` |

---

### `POST /auth/register`

**Qué hace:** Crea una cuenta de usuario nueva en el sistema. Recibe los datos básicos del usuario (nombre, email, contraseña), aplica hash a la contraseña antes de persistirla y devuelve la información del usuario creado junto con un par de tokens para iniciar sesión inmediatamente tras el registro.

**Body esperado:**
```json
{
  "name": "César Contreras",
  "email": "cesar@praxis.dev",
  "password": "MiContraseña123!"
}
```

**Lógica interna:**
1. Valida que el email no esté ya registrado.
2. Aplica `bcrypt.hash()` a la contraseña con un salt configurable.
3. Persiste la entidad `User` en la base de datos.
4. Emite un `access_token` (corta duración) y un `refresh_token` (larga duración).
5. Almacena el `refresh_token` hasheado en la base de datos para validaciones futuras.

**Respuesta exitosa (`201 Created`):**
```json
{
  "user": { "id": "uuid", "name": "César Contreras", "email": "cesar@praxis.dev" },
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

---

### `POST /auth/login`

**Qué hace:** Valida las credenciales de un usuario existente (email + contraseña). Si son correctas, emite un nuevo par de tokens JWT. Si son incorrectas, retorna un error 401 sin revelar si el email existe o no (seguridad por oscuridad).

**Body esperado:**
```json
{
  "email": "cesar@praxis.dev",
  "password": "MiContraseña123!"
}
```

**Lógica interna:**
1. Busca al usuario por email en la base de datos.
2. Compara la contraseña ingresada con el hash almacenado usando `bcrypt.compare()`.
3. Si no coinciden, lanza una excepción `UnauthorizedException`.
4. Verifica que la cuenta esté activa (`isActive: true`).
5. Emite un nuevo `access_token` y `refresh_token`.
6. Actualiza el `refresh_token` almacenado en la base de datos (rotación de tokens).

**Respuesta exitosa (`200 OK`):**
```json
{
  "user": { "id": "uuid", "name": "César Contreras", "roles": ["Administrador"] },
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

---

### `POST /auth/refresh`

**Qué hace:** Permite al cliente obtener un nuevo `access_token` sin que el usuario vuelva a introducir sus credenciales. El cliente envía su `refresh_token` actual; el servidor lo valida, lo compara con el hash almacenado y emite un par de tokens completamente nuevo (rotación completa).

**Body esperado:**
```json
{
  "refresh_token": "eyJ..."
}
```

**Lógica interna:**
1. Verifica la firma del `refresh_token` con la clave secreta de refresh.
2. Extrae el `userId` del payload del token.
3. Busca al usuario y compara el token con el hash almacenado.
4. Si coincide y no está expirado, emite un nuevo par de tokens.
5. Invalida el `refresh_token` anterior (rotación: un token solo puede usarse una vez).

**Respuesta exitosa (`200 OK`):**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

---

### `POST /auth/logout`

**Qué hace:** Cierra la sesión activa del usuario. Invalida el `refresh_token` almacenado en la base de datos, de modo que cualquier intento futuro de renovar el `access_token` falle. El `access_token` actual sigue siendo técnicamente válido hasta su expiración natural, por eso debe tener duración corta (ej. 15 minutos).

**Headers requeridos:** `Authorization: Bearer <access_token>`

**Lógica interna:**
1. Extrae el `userId` del `access_token` mediante el guard de JWT.
2. Elimina o anula el `refresh_token` del usuario en la base de datos.
3. Retorna confirmación de cierre de sesión.

**Respuesta exitosa (`200 OK`):**
```json
{
  "message": "Sesión cerrada correctamente."
}
```

---

## 2. Privileges — Roles y Privilegios

### Descripción general

Este módulo implementa el sistema de **control de acceso basado en roles y privilegios dinámicos**, que es la característica central de Praxis. Está compuesto por dos sub-recursos:

- **Roles:** Perfiles base que agrupan un conjunto de privilegios (ej. `Administrador`, `Project Manager`).
- **Privileges:** Permisos atómicos sobre una acción y módulo específico (ej. `proyecto:crear`, `tarea:mover`).

Un usuario puede tener roles globales y además recibir privilegios directos adicionales. El guard de privilegios evalúa la unión de todos ellos al momento de procesar cada request.

---

### 2.1 Roles

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/roles` | Crea un nuevo rol |
| `GET` | `/roles` | Lista todos los roles del sistema |
| `GET` | `/roles/:id` | Obtiene un rol por su ID |
| `PATCH` | `/roles/:id` | Actualiza los datos de un rol |
| `DELETE` | `/roles/:id` | Elimina un rol |
| `POST` | `/roles/:roleId/privileges` | Asigna uno o más privilegios a un rol |
| `DELETE` | `/roles/:roleId/privileges/:privilegeId` | Elimina un privilegio específico de un rol |

---

#### `POST /roles`

**Qué hace:** Crea un nuevo rol con nombre y descripción. Los roles son plantillas reutilizables que agrupan privilegios y pueden asignarse a múltiples usuarios.

**Body esperado:**
```json
{
  "name": "Project Manager",
  "description": "Gestiona proyectos, asigna tareas y revisa costos."
}
```

**Lógica interna:**
1. Valida que no exista un rol con el mismo nombre.
2. Persiste la entidad `Role`.
3. Devuelve el rol creado.

**Respuesta exitosa (`201 Created`):**
```json
{
  "id": "uuid",
  "name": "Project Manager",
  "description": "Gestiona proyectos, asigna tareas y revisa costos.",
  "privileges": []
}
```

---

#### `GET /roles`

**Qué hace:** Retorna la lista completa de roles registrados en el sistema, incluyendo los privilegios asociados a cada uno. Útil para construir los formularios de asignación de roles en el frontend.

**Respuesta exitosa (`200 OK`):**
```json
[
  {
    "id": "uuid",
    "name": "Administrador",
    "privileges": ["proyecto:crear", "usuario:gestionar", "reporte:exportar"]
  }
]
```

---

#### `GET /roles/:id`

**Qué hace:** Obtiene los detalles completos de un rol específico, incluyendo todos sus privilegios asociados. Se usa para vistas de detalle y edición.

**Parámetros:**
- `id` (UUID): Identificador único del rol.

**Respuesta exitosa (`200 OK`):**
```json
{
  "id": "uuid",
  "name": "Project Manager",
  "description": "...",
  "privileges": [
    { "id": "uuid", "action": "proyecto:crear", "module": "projects" }
  ]
}
```

---

#### `PATCH /roles/:id`

**Qué hace:** Actualiza parcialmente los datos de un rol existente (nombre o descripción). No afecta los privilegios asignados al rol; para eso se usan los endpoints de relación.

**Body esperado (parcial):**
```json
{
  "description": "Nueva descripción del rol."
}
```

**Respuesta exitosa (`200 OK`):** Retorna el rol actualizado completo.

---

#### `DELETE /roles/:id`

**Qué hace:** Elimina un rol del sistema. Antes de eliminarlo, verifica que no haya usuarios con ese rol asignado o aplica la lógica de cascada definida en la entidad (desasignar el rol de los usuarios afectados).

**Respuesta exitosa (`200 OK`):**
```json
{ "message": "Rol eliminado correctamente." }
```

---

#### `POST /roles/:roleId/privileges`

**Qué hace:** Asocia uno o más privilegios a un rol existente. Esta es la operación que da contenido a un rol y define qué puede hacer quien lo tenga asignado.

**Body esperado:**
```json
{
  "privilegeIds": ["uuid-1", "uuid-2"]
}
```

**Lógica interna:**
1. Verifica que el rol existe.
2. Verifica que cada `privilegeId` existe.
3. Inserta las relaciones en la tabla pivote `role_privileges`.
4. Evita duplicados (idempotente).

**Respuesta exitosa (`201 Created`):** Retorna el rol con sus nuevos privilegios.

---

#### `DELETE /roles/:roleId/privileges/:privilegeId`

**Qué hace:** Elimina la relación entre un privilegio específico y un rol. El privilegio en sí no se borra del sistema, solo se desvincula de ese rol.

**Respuesta exitosa (`200 OK`):**
```json
{ "message": "Privilegio desvinculado del rol correctamente." }
```

---

### 2.2 Privilegios

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/privileges` | Crea un nuevo privilegio |
| `GET` | `/privileges` | Lista todos los privilegios del sistema |
| `GET` | `/privileges/:id` | Obtiene un privilegio por su ID |
| `PATCH` | `/privileges/:id` | Actualiza un privilegio |
| `DELETE` | `/privileges/:id` | Elimina un privilegio |

---

#### `POST /privileges`

**Qué hace:** Registra un nuevo privilegio atómico en el sistema. Cada privilegio representa una acción específica sobre un módulo (ej. `tarea:mover` en el módulo `tasks`). El guard de privilegios usa la combinación de `module` + `action` para verificar acceso en cada endpoint.

**Body esperado:**
```json
{
  "name": "Mover tarea",
  "action": "tarea:mover",
  "module": "tasks",
  "description": "Permite cambiar el estado o columna de una tarea en el tablero."
}
```

**Respuesta exitosa (`201 Created`):** Retorna el privilegio creado con su ID.

---

#### `GET /privileges`

**Qué hace:** Retorna todos los privilegios registrados en el sistema. Se usa en el panel de administración para seleccionar qué privilegios asignar a roles o a usuarios directamente.

**Respuesta exitosa (`200 OK`):**
```json
[
  { "id": "uuid", "name": "Mover tarea", "action": "tarea:mover", "module": "tasks" }
]
```

---

#### `GET /privileges/:id`

**Qué hace:** Obtiene el detalle de un privilegio específico. Incluye descripción y los roles que actualmente tienen ese privilegio asignado.

**Respuesta exitosa (`200 OK`):** Objeto completo del privilegio con relaciones.

---

#### `PATCH /privileges/:id`

**Qué hace:** Actualiza los metadatos de un privilegio (nombre, descripción). No recomendado cambiar `action` o `module` si ya está en uso, ya que afectaría todos los guards que lo referencian.

**Body esperado (parcial):**
```json
{
  "description": "Descripción actualizada."
}
```

---

#### `DELETE /privileges/:id`

**Qué hace:** Elimina un privilegio del sistema junto con todas sus asignaciones (en roles y usuarios). Operación crítica que debe hacerse con cuidado para no romper accesos activos.

**Respuesta exitosa (`200 OK`):**
```json
{ "message": "Privilegio eliminado correctamente." }
```

---

## 3. Users

### Descripción general

El módulo de usuarios gestiona las cuentas de los miembros del sistema. Permite crear, consultar, modificar y eliminar usuarios, así como gestionar su avatar, su estado de activación, sus roles globales y sus privilegios directos. Los privilegios directos son una capa adicional sobre los roles: un usuario puede tener acceso a una acción específica sin pertenecer a un rol que lo incluya.

### CRUD Principal

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/users` | Crea un nuevo usuario |
| `GET` | `/users` | Lista todos los usuarios |
| `GET` | `/users/:id` | Obtiene un usuario por ID |
| `PATCH` | `/users/:id` | Actualiza datos del usuario |
| `DELETE` | `/users/:id` | Elimina un usuario |

---

#### `POST /users`

**Qué hace:** Crea un nuevo usuario desde el panel de administración (distinto del registro público). Permite especificar roles iniciales y datos de perfil completos.

**Body esperado:**
```json
{
  "name": "Juan José Díaz",
  "email": "juanjose@praxis.dev",
  "password": "TempPass123!",
  "roleIds": ["uuid-rol-colaborador"]
}
```

**Lógica interna:**
1. Valida unicidad de email.
2. Hashea la contraseña.
3. Crea la entidad `User` y asigna los roles indicados.
4. Devuelve el usuario sin la contraseña.

---

#### `GET /users`

**Qué hace:** Retorna la lista paginada de todos los usuarios registrados. Incluye información de roles y estado de activación. Soporta filtros opcionales por nombre, email o estado.

**Query params opcionales:**
- `search` — Filtra por nombre o email.
- `isActive` — Filtra por estado (`true` | `false`).
- `page`, `limit` — Paginación.

**Respuesta exitosa (`200 OK`):**
```json
{
  "data": [{ "id": "uuid", "name": "...", "email": "...", "isActive": true, "roles": [] }],
  "total": 42,
  "page": 1,
  "limit": 10
}
```

---

#### `GET /users/:id`

**Qué hace:** Obtiene el perfil completo de un usuario específico: datos personales, roles globales asignados, privilegios directos y avatar.

**Respuesta exitosa (`200 OK`):**
```json
{
  "id": "uuid",
  "name": "César Contreras",
  "email": "cesar@praxis.dev",
  "avatarUrl": "https://...",
  "isActive": true,
  "roles": [{ "id": "uuid", "name": "Administrador" }],
  "directPrivileges": [{ "id": "uuid", "action": "reporte:exportar" }]
}
```

---

#### `PATCH /users/:id`

**Qué hace:** Actualiza los datos del perfil de un usuario (nombre, email u otros campos de perfil). No actualiza contraseñas por este endpoint; la contraseña tiene su propio flujo de cambio.

**Body esperado (parcial):**
```json
{
  "name": "César E. Contreras"
}
```

---

#### `DELETE /users/:id`

**Qué hace:** Elimina permanentemente un usuario del sistema junto con todas sus relaciones (roles, privilegios directos, membresías en proyectos). Operación irreversible. Se recomienda usar `deactivate` como alternativa más segura.

---

### Endpoints Extra

#### `PATCH /users/:id/avatar`

**Qué hace:** Actualiza la foto de perfil del usuario. Recibe una imagen (multipart/form-data), la procesa (redimensionar, optimizar), la almacena (almacenamiento local o S3) y actualiza la URL del avatar en la base de datos.

**Body esperado:** `multipart/form-data` con el campo `file` conteniendo la imagen.

**Lógica interna:**
1. Valida el tipo MIME (solo `image/jpeg`, `image/png`, `image/webp`).
2. Valida el tamaño máximo del archivo.
3. Procesa y almacena la imagen.
4. Actualiza `avatarUrl` en la entidad `User`.

**Respuesta exitosa (`200 OK`):**
```json
{ "avatarUrl": "https://storage.praxis.dev/avatars/uuid.webp" }
```

---

#### `PATCH /users/:id/activate`

**Qué hace:** Activa una cuenta de usuario previamente desactivada (`isActive = true`). El usuario recupera acceso al sistema y puede volver a autenticarse.

**Respuesta exitosa (`200 OK`):**
```json
{ "message": "Usuario activado correctamente.", "isActive": true }
```

---

#### `PATCH /users/:id/deactivate`

**Qué hace:** Desactiva una cuenta de usuario (`isActive = false`) sin eliminarla. El usuario no puede iniciar sesión ni renovar tokens. Sus datos se conservan. Es la alternativa preferida a `DELETE` para preservar la trazabilidad.

**Respuesta exitosa (`200 OK`):**
```json
{ "message": "Usuario desactivado correctamente.", "isActive": false }
```

---

### Roles Globales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/users/:id/roles` | Asigna uno o más roles globales al usuario |
| `DELETE` | `/users/:id/roles/:roleId` | Elimina un rol global del usuario |

#### `POST /users/:id/roles`

**Qué hace:** Asigna roles globales a un usuario. Los roles globales determinan los permisos base del usuario en toda la aplicación (no solo en un proyecto). La asignación es aditiva: se agregan sin eliminar los existentes.

**Body esperado:**
```json
{ "roleIds": ["uuid-admin", "uuid-pm"] }
```

---

#### `DELETE /users/:id/roles/:roleId`

**Qué hace:** Desvincula un rol específico de un usuario. El rol en sí no se elimina del sistema; solo se rompe la relación con ese usuario. Los privilegios que venían del rol dejan de aplicar.

---

### Privilegios Directos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/users/:id/privileges` | Asigna privilegios directos al usuario |
| `DELETE` | `/users/:id/privileges/:privilegeId` | Elimina un privilegio directo del usuario |

#### `POST /users/:id/privileges`

**Qué hace:** Otorga privilegios directos a un usuario, es decir, permisos atómicos adicionales que no provienen de ningún rol. Útil para casos de excepción (ej. dar acceso temporal a exportar reportes a un colaborador específico).

**Body esperado:**
```json
{ "privilegeIds": ["uuid-reporte:exportar"] }
```

---

#### `DELETE /users/:id/privileges/:privilegeId`

**Qué hace:** Revoca un privilegio directo específico de un usuario. No afecta los privilegios que el usuario tiene a través de sus roles asignados.

---

## 4. Projects

### Descripción general

El módulo de proyectos es el contenedor principal de trabajo en Praxis. Un proyecto agrupa tableros, tareas, miembros, costos y reportes. Tiene estados que reflejan su ciclo de vida: activo, archivado o completado. La creación de un proyecto genera automáticamente una entrada en el log de actividad.

### CRUD Principal

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/projects` | Crea un nuevo proyecto |
| `GET` | `/projects` | Lista todos los proyectos |
| `GET` | `/projects/:id` | Obtiene un proyecto por ID |
| `PATCH` | `/projects/:id` | Actualiza datos del proyecto |
| `DELETE` | `/projects/:id` | Elimina un proyecto |

---

#### `POST /projects`

**Qué hace:** Crea un nuevo proyecto con nombre, descripción, fechas estimadas y miembros iniciales. El usuario que lo crea es automáticamente establecido como propietario (`owner`). El estado inicial es `active`.

**Body esperado:**
```json
{
  "name": "Rediseño de Portal Web",
  "description": "Migración y rediseño completo del portal corporativo.",
  "startDate": "2026-07-01",
  "endDate": "2026-09-30",
  "memberIds": ["uuid-user-1", "uuid-user-2"]
}
```

**Lógica interna:**
1. Valida que el nombre sea único por usuario propietario.
2. Crea la entidad `Project` con estado `active`.
3. Registra la entrada en `ActivityLog`.
4. Devuelve el proyecto con sus miembros.

---

#### `GET /projects`

**Qué hace:** Retorna todos los proyectos a los que el usuario autenticado tiene acceso. Aplica filtros según el rol y los privilegios del usuario (un colaborador no ve proyectos en los que no es miembro). Soporta filtros por estado, nombre y paginación.

**Query params opcionales:**
- `status` — `active` | `archived` | `completed`
- `search` — Filtra por nombre.
- `page`, `limit` — Paginación.

---

#### `GET /projects/:id`

**Qué hace:** Obtiene el detalle completo de un proyecto: datos generales, lista de miembros con sus roles en el proyecto, tableros asociados y un resumen de avance (total de tareas, completadas, pendientes).

---

#### `PATCH /projects/:id`

**Qué hace:** Actualiza los metadatos del proyecto (nombre, descripción, fechas). No cambia el estado; para eso existen los endpoints extra `archive` y `complete`.

---

#### `DELETE /projects/:id`

**Qué hace:** Elimina un proyecto y toda su información asociada en cascada: tableros, columnas, tareas, costos, asignaciones y entradas de actividad. Operación irreversible. Requiere el privilegio `proyecto:eliminar`.

---

### Endpoints Extra

#### `PATCH /projects/:id/archive`

**Qué hace:** Cambia el estado del proyecto a `archived`. Un proyecto archivado es de solo lectura: no se pueden crear nuevas tareas ni modificar datos existentes, pero la información se conserva y es consultable. Se registra el cambio en `ActivityLog`.

**Respuesta exitosa (`200 OK`):**
```json
{ "id": "uuid", "status": "archived" }
```

---

#### `PATCH /projects/:id/complete`

**Qué hace:** Marca el proyecto como `completed`, indicando que todos los entregables fueron finalizados. A diferencia de archivar, `complete` implica cierre formal: se puede usar para generar reportes finales automáticamente. Se registra en `ActivityLog`.

**Respuesta exitosa (`200 OK`):**
```json
{ "id": "uuid", "status": "completed", "completedAt": "2026-09-30T18:00:00Z" }
```

---

### Miembros del Proyecto

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/projects/:id/members` | Agrega uno o más miembros al proyecto |
| `DELETE` | `/projects/:id/members/:memberId` | Elimina un miembro del proyecto |
| `PATCH` | `/projects/:id/members/:memberId/role` | Cambia el rol de un miembro en el proyecto |

#### `POST /projects/:id/members`

**Qué hace:** Agrega usuarios como miembros de un proyecto, asignándoles un rol dentro del proyecto (distinto al rol global). Los miembros obtienen acceso al proyecto y a sus tableros según el rol de proyecto asignado.

**Body esperado:**
```json
{
  "members": [
    { "userId": "uuid-user", "projectRoleId": "uuid-project-role" }
  ]
}
```

---

#### `DELETE /projects/:id/members/:memberId`

**Qué hace:** Elimina a un miembro del proyecto. Sus tareas asignadas quedan sin asignado. Sus entradas en el log de actividad se conservan. Se registra la baja en `ActivityLog`.

---

#### `PATCH /projects/:id/members/:memberId/role`

**Qué hace:** Cambia el rol que tiene un miembro dentro de un proyecto específico (ej. de `Colaborador` a `Reviewer`). Solo afecta el contexto de ese proyecto; el rol global del usuario no se modifica.

**Body esperado:**
```json
{ "projectRoleId": "uuid-nuevo-rol" }
```

---

## 5. Project Roles

### Descripción general

Los roles de proyecto son perfiles de acceso específicos para el contexto de un proyecto. A diferencia de los roles globales, estos definen qué puede hacer un usuario dentro de un proyecto particular. Pueden tener sus propios privilegios, que se evalúan en combinación con los globales cuando el usuario opera dentro de un proyecto.

### CRUD Principal

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/project-roles` | Crea un nuevo rol de proyecto |
| `GET` | `/project-roles` | Lista todos los roles de proyecto |
| `PATCH` | `/project-roles/:id` | Actualiza un rol de proyecto |
| `DELETE` | `/project-roles/:id` | Elimina un rol de proyecto |

---

#### `POST /project-roles`

**Qué hace:** Crea un nuevo tipo de rol aplicable dentro de un proyecto. Ejemplos: `Líder Técnico`, `QA Reviewer`, `Observador`. Se define con nombre y descripción, y luego se le asignan privilegios específicos.

**Body esperado:**
```json
{
  "name": "QA Reviewer",
  "description": "Puede revisar y marcar tareas como aprobadas o rechazadas."
}
```

---

#### `GET /project-roles`

**Qué hace:** Lista todos los roles de proyecto disponibles para ser asignados a miembros. Incluye los privilegios que tiene cada rol.

---

#### `PATCH /project-roles/:id`

**Qué hace:** Actualiza el nombre o descripción de un rol de proyecto existente. No modifica los privilegios asignados.

---

#### `DELETE /project-roles/:id`

**Qué hace:** Elimina un rol de proyecto. Si hay miembros con ese rol asignado, se les desvincula el rol (quedan sin rol de proyecto) o se aplica la lógica de cascada configurada.

---

### Privilegios de Rol de Proyecto

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/project-roles/:id/privileges` | Asigna privilegios al rol de proyecto |
| `DELETE` | `/project-roles/:id/privileges/:privilegeId` | Elimina un privilegio del rol de proyecto |

#### `POST /project-roles/:id/privileges`

**Qué hace:** Asocia uno o más privilegios a un rol de proyecto. Estos privilegios se evalúan cuando un miembro con ese rol realiza acciones dentro del proyecto.

**Body esperado:**
```json
{ "privilegeIds": ["uuid-tarea:aprobar", "uuid-tarea:rechazar"] }
```

---

#### `DELETE /project-roles/:id/privileges/:privilegeId`

**Qué hace:** Desvincula un privilegio específico de un rol de proyecto sin eliminar ni el privilegio ni el rol del sistema.

---

## 6. Boards

### Descripción general

Un tablero (Board) es el espacio visual de trabajo dentro de un proyecto, implementado como un tablero Kanban. Contiene columnas que representan estados del flujo de trabajo (ej. `To Do`, `In Progress`, `Done`). Un proyecto puede tener múltiples tableros para organizar diferentes aspectos del trabajo (ej. por sprint, por equipo, por área).

### CRUD Principal

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/boards` | Crea un nuevo tablero |
| `GET` | `/boards` | Lista los tableros accesibles |
| `GET` | `/boards/:id` | Obtiene un tablero por ID con sus columnas y tareas |
| `PATCH` | `/boards/:id` | Actualiza datos del tablero |
| `DELETE` | `/boards/:id` | Elimina un tablero |

---

#### `POST /boards`

**Qué hace:** Crea un nuevo tablero dentro de un proyecto. El tablero puede inicializarse con columnas predeterminadas (ej. `To Do`, `Doing`, `Done`) o empezar vacío para que el equipo defina sus propias columnas.

**Body esperado:**
```json
{
  "projectId": "uuid-proyecto",
  "name": "Sprint 1",
  "description": "Tablero del primer sprint de desarrollo.",
  "initWithDefaultColumns": true
}
```

---

#### `GET /boards`

**Qué hace:** Retorna los tableros a los que el usuario autenticado tiene acceso según su membresía en proyectos. Filtra por `projectId` si se proporciona como query param.

**Query params opcionales:**
- `projectId` — Filtra tableros de un proyecto específico.

---

#### `GET /boards/:id`

**Qué hace:** Obtiene el tablero completo con todas sus columnas y las tareas dentro de cada columna, organizadas por su posición de orden. Esta es la vista principal del tablero Kanban.

**Respuesta exitosa (`200 OK`):**
```json
{
  "id": "uuid",
  "name": "Sprint 1",
  "columns": [
    {
      "id": "uuid-col",
      "name": "To Do",
      "order": 1,
      "tasks": [{ "id": "uuid-task", "title": "Diseñar login", "priority": "high" }]
    }
  ]
}
```

---

#### `PATCH /boards/:id`

**Qué hace:** Actualiza el nombre o descripción de un tablero. No modifica columnas ni tareas.

---

#### `DELETE /boards/:id`

**Qué hace:** Elimina un tablero y en cascada todas sus columnas y las tareas que contiene (o las desvincula según configuración). Operación irreversible.

---

### Endpoints Extra

#### `PATCH /boards/:id/archive`

**Qué hace:** Archiva un tablero, poniéndolo en modo de solo lectura. El tablero y sus tareas dejan de aparecer en las vistas activas pero se conservan para consulta histórica.

---

#### `PATCH /boards/reorder`

**Qué hace:** Actualiza el orden de múltiples tableros dentro de un proyecto en una sola operación. Se usa cuando el usuario arrastra y suelta tableros para reorganizarlos. Recibe un array con los IDs y sus nuevas posiciones.

**Body esperado:**
```json
{
  "boards": [
    { "id": "uuid-board-1", "order": 1 },
    { "id": "uuid-board-2", "order": 2 }
  ]
}
```

**Lógica interna:** Actualiza el campo `order` de todos los tableros en una sola transacción para evitar inconsistencias.

---

## 7. Board Columns

### Descripción general

Las columnas de un tablero representan los estados del flujo de trabajo Kanban (ej. `To Do`, `In Progress`, `Review`, `Done`). Cada columna puede contener múltiples tareas y tiene una posición de orden que determina cómo se muestra en el tablero. Las columnas son reordenables mediante drag & drop.

### CRUD Principal

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/columns` | Crea una nueva columna en un tablero |
| `GET` | `/columns` | Lista columnas (filtrando por tablero) |
| `PATCH` | `/columns/:id` | Actualiza datos de una columna |
| `DELETE` | `/columns/:id` | Elimina una columna |

---

#### `POST /columns`

**Qué hace:** Agrega una nueva columna al final de un tablero específico. La columna se posiciona automáticamente después de la última columna existente.

**Body esperado:**
```json
{
  "boardId": "uuid-tablero",
  "name": "In Review",
  "color": "#F59E0B"
}
```

---

#### `GET /columns`

**Qué hace:** Lista todas las columnas de un tablero, ordenadas por el campo `order`. Normalmente se consume como parte de `GET /boards/:id`, pero está disponible de forma independiente para operaciones específicas.

**Query params:**
- `boardId` — Requerido para filtrar por tablero.

---

#### `PATCH /columns/:id`

**Qué hace:** Actualiza el nombre o color de una columna. No modifica el orden ni las tareas que contiene.

**Body esperado (parcial):**
```json
{ "name": "En Revisión", "color": "#8B5CF6" }
```

---

#### `DELETE /columns/:id`

**Qué hace:** Elimina una columna. Las tareas que contenía pueden: (a) eliminarse en cascada, o (b) moverse automáticamente a una columna predeterminada, según la configuración del sistema. Se recomienda la opción (b) para no perder trabajo.

---

### Endpoints Extra

#### `PATCH /columns/reorder`

**Qué hace:** Reordena las columnas de un tablero en una sola operación atómica. Se invoca cada vez que el usuario arrastra y suelta una columna a una nueva posición. Actualiza el campo `order` de todas las columnas afectadas.

**Body esperado:**
```json
{
  "boardId": "uuid-tablero",
  "columns": [
    { "id": "uuid-col-1", "order": 1 },
    { "id": "uuid-col-2", "order": 2 },
    { "id": "uuid-col-3", "order": 3 }
  ]
}
```

**Lógica interna:** Ejecuta las actualizaciones en una transacción de base de datos para garantizar consistencia.

---

## 8. Tasks

### Descripción general

Las tareas son la unidad de trabajo fundamental en Praxis. Representan una actividad concreta dentro de un proyecto, asignada a un miembro del equipo, con prioridad, estado, fechas y estimaciones de tiempo. Cada tarea vive dentro de una columna de un tablero. Las tareas pueden tener subtareas para descomponer trabajo complejo.

### CRUD Principal

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/tasks` | Crea una nueva tarea |
| `GET` | `/tasks` | Lista tareas con filtros |
| `GET` | `/tasks/:id` | Obtiene el detalle de una tarea |
| `PATCH` | `/tasks/:id` | Actualiza datos de una tarea |
| `DELETE` | `/tasks/:id` | Elimina una tarea |

---

#### `POST /tasks`

**Qué hace:** Crea una nueva tarea dentro de una columna de un tablero de un proyecto. Se pueden especificar asignados, prioridad, fecha límite y estimación de horas en la creación.

**Body esperado:**
```json
{
  "title": "Implementar login con JWT",
  "description": "Crear el endpoint POST /auth/login con validación y emisión de tokens.",
  "columnId": "uuid-columna-todo",
  "projectId": "uuid-proyecto",
  "priority": "high",
  "dueDate": "2026-07-15",
  "estimatedHours": 8,
  "assigneeIds": ["uuid-user-cesar"]
}
```

**Lógica interna:**
1. Valida que la columna pertenece al proyecto indicado.
2. Crea la entidad `Task` con estado derivado de la columna.
3. Registra la asignación en `task_assignees`.
4. Registra la creación en `ActivityLog`.

---

#### `GET /tasks`

**Qué hace:** Lista tareas con filtros múltiples. Se usa para vistas de lista, búsquedas globales y reportes. El guard de privilegios limita los resultados según el acceso del usuario.

**Query params opcionales:**
- `projectId` — Tareas de un proyecto.
- `boardId` — Tareas de un tablero.
- `columnId` — Tareas de una columna.
- `assigneeId` — Tareas asignadas a un usuario.
- `priority` — `low` | `medium` | `high` | `critical`.
- `status` — `todo` | `in_progress` | `review` | `done`.
- `search` — Busca en título y descripción.

---

#### `GET /tasks/:id`

**Qué hace:** Obtiene el detalle completo de una tarea: datos generales, asignados, etiquetas, subtareas, comentarios y costos asociados.

**Respuesta exitosa (`200 OK`):**
```json
{
  "id": "uuid",
  "title": "Implementar login con JWT",
  "priority": "high",
  "status": "in_progress",
  "assignees": [{ "id": "uuid", "name": "César" }],
  "subtasks": [{ "id": "uuid", "title": "Crear DTO", "completed": false }],
  "tags": [{ "id": "uuid", "name": "Backend" }],
  "estimatedHours": 8,
  "actualHours": 3
}
```

---

#### `PATCH /tasks/:id`

**Qué hace:** Actualiza los metadatos de una tarea (título, descripción, prioridad, fecha límite, estimación de horas). No mueve la tarea entre columnas; para eso existe el endpoint `move`.

---

#### `DELETE /tasks/:id`

**Qué hace:** Elimina una tarea y todas sus relaciones (subtareas, asignaciones, etiquetas, costos). Se registra en `ActivityLog`. Requiere el privilegio `tarea:eliminar`.

---

### Endpoints Extra

#### `PATCH /tasks/:id/move`

**Qué hace:** Mueve una tarea a una columna diferente (dentro del mismo tablero o entre tableros del mismo proyecto). Es la operación central del Kanban drag & drop. Actualiza el campo `columnId` y puede ajustar el estado automáticamente según la columna destino.

**Body esperado:**
```json
{
  "columnId": "uuid-columna-done",
  "order": 2
}
```

**Lógica interna:**
1. Valida que la columna destino existe y pertenece al mismo proyecto.
2. Actualiza `columnId` y `order` de la tarea.
3. Reajusta el orden de las demás tareas en la columna destino.
4. Registra el movimiento en `ActivityLog`.

---

#### `PATCH /tasks/:id/status`

**Qué hace:** Cambia el estado lógico de una tarea (`todo`, `in_progress`, `review`, `done`) sin moverla necesariamente de columna. Útil para estados que no tienen columna propia pero sí son importantes para los reportes.

**Body esperado:**
```json
{ "status": "in_progress" }
```

---

#### `PATCH /tasks/:id/priority`

**Qué hace:** Actualiza la prioridad de una tarea (`low`, `medium`, `high`, `critical`). Operación frecuente en reuniones de planificación, por eso tiene su propio endpoint para simplificar la llamada desde el frontend.

**Body esperado:**
```json
{ "priority": "critical" }
```

---

### Subtareas

#### `POST /tasks/:id/subtasks`

**Qué hace:** Crea una subtarea dentro de una tarea padre. Las subtareas son tareas simplificadas (solo tienen título y estado de completado) que permiten descomponer una tarea en pasos más pequeños sin la complejidad de una tarea completa.

**Body esperado:**
```json
{
  "title": "Escribir pruebas unitarias para el servicio de auth"
}
```

**Respuesta exitosa (`201 Created`):**
```json
{
  "id": "uuid",
  "title": "Escribir pruebas unitarias para el servicio de auth",
  "completed": false,
  "taskId": "uuid-tarea-padre"
}
```

---

## 9. Task Assignees

### Descripción general

Gestiona las asignaciones de usuarios a tareas. Una tarea puede tener múltiples asignados. La asignación conecta a un miembro del proyecto con una tarea específica, indicando quién es responsable de completarla.

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/tasks/:id/assignees` | Asigna uno o más usuarios a una tarea |
| `DELETE` | `/tasks/:id/assignees/:userId` | Desasigna un usuario de una tarea |
| `GET` | `/tasks/:id/assignees` | Lista los usuarios asignados a una tarea |

---

#### `POST /tasks/:id/assignees`

**Qué hace:** Agrega usuarios como asignados a una tarea. Verifica que los usuarios sean miembros del proyecto al que pertenece la tarea antes de asignarlos. La operación es idempotente: asignar un usuario ya asignado no genera error ni duplicado.

**Body esperado:**
```json
{ "userIds": ["uuid-user-1", "uuid-user-2"] }
```

**Lógica interna:**
1. Valida que la tarea existe.
2. Verifica que cada `userId` es miembro del proyecto.
3. Inserta en la tabla `task_assignees` evitando duplicados.
4. Registra la asignación en `ActivityLog`.

---

#### `DELETE /tasks/:id/assignees/:userId`

**Qué hace:** Elimina la asignación de un usuario específico de una tarea. El usuario no pierde su membresía en el proyecto; solo deja de estar asignado a esa tarea en particular.

**Respuesta exitosa (`200 OK`):**
```json
{ "message": "Usuario desasignado de la tarea correctamente." }
```

---

#### `GET /tasks/:id/assignees`

**Qué hace:** Retorna la lista de todos los usuarios asignados actualmente a una tarea, con sus datos básicos de perfil (nombre, avatar).

**Respuesta exitosa (`200 OK`):**
```json
[
  { "id": "uuid", "name": "César Contreras", "avatarUrl": "https://..." },
  { "id": "uuid", "name": "Juan José Díaz", "avatarUrl": "https://..." }
]
```

---

## 10. Task Tags

### Descripción general

Las etiquetas (tags) son marcadores categóricos que se pueden aplicar a las tareas para organizarlas y filtrarlas fácilmente. Ejemplos: `Backend`, `Frontend`, `Bug`, `Urgente`, `Bloqueado`. Las etiquetas son específicas por proyecto y pueden reutilizarse en múltiples tareas.

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/tasks/:id/tags` | Asocia etiquetas a una tarea |
| `GET` | `/tasks/:id/tags` | Lista las etiquetas de una tarea |
| `DELETE` | `/tasks/:id/tags/:tagId` | Elimina una etiqueta de una tarea |

---

#### `POST /tasks/:id/tags`

**Qué hace:** Asocia una o más etiquetas existentes a una tarea. Si la etiqueta no existe, puede crearla primero (según la implementación). La asociación es idempotente.

**Body esperado:**
```json
{ "tagIds": ["uuid-tag-backend", "uuid-tag-urgente"] }
```

**Respuesta exitosa (`201 Created`):** Retorna la tarea con sus etiquetas actualizadas.

---

#### `GET /tasks/:id/tags`

**Qué hace:** Retorna todas las etiquetas actualmente asociadas a una tarea específica.

**Respuesta exitosa (`200 OK`):**
```json
[
  { "id": "uuid", "name": "Backend", "color": "#3B82F6" },
  { "id": "uuid", "name": "Urgente", "color": "#EF4444" }
]
```

---

#### `DELETE /tasks/:id/tags/:tagId`

**Qué hace:** Elimina la asociación entre una etiqueta y una tarea. La etiqueta en sí no se elimina del sistema, solo se desvincula de esa tarea.

**Respuesta exitosa (`200 OK`):**
```json
{ "message": "Etiqueta eliminada de la tarea correctamente." }
```

---

## 11. Costs

### Descripción general

El módulo de costos registra y gestiona el gasto económico asociado a tareas y proyectos. Permite definir costos estimados y reales, calcular desviaciones presupuestarias y generar resúmenes financieros por proyecto. Es el módulo base para los reportes de tipo `cost`.

### CRUD Principal

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/costs` | Registra un nuevo costo |
| `GET` | `/costs` | Lista costos con filtros |
| `PATCH` | `/costs/:id` | Actualiza un registro de costo |
| `DELETE` | `/costs/:id` | Elimina un registro de costo |

---

#### `POST /costs`

**Qué hace:** Registra un costo asociado a una tarea o a un proyecto directamente. Puede ser de tipo estimado (`estimated`) o real (`actual`). Incluye descripción, monto, fecha y opcionalmente el usuario responsable del gasto.

**Body esperado:**
```json
{
  "type": "actual",
  "amount": 2500.00,
  "currency": "MXN",
  "description": "Licencia mensual de herramienta de diseño",
  "date": "2026-07-10",
  "projectId": "uuid-proyecto",
  "taskId": "uuid-tarea"
}
```

---

#### `GET /costs`

**Qué hace:** Lista registros de costos con filtros. Requiere al menos un filtro de contexto (`projectId` o `taskId`) para acotar resultados.

**Query params opcionales:**
- `projectId` — Costos de un proyecto.
- `taskId` — Costos de una tarea.
- `type` — `estimated` | `actual`.
- `dateFrom`, `dateTo` — Rango de fechas.

---

#### `PATCH /costs/:id`

**Qué hace:** Actualiza un registro de costo existente (monto, descripción, fecha). Útil para corregir errores de captura.

---

#### `DELETE /costs/:id`

**Qué hace:** Elimina un registro de costo. Actualiza automáticamente los totales del resumen del proyecto afectado.

---

### Endpoints Extra de Consulta

#### `GET /projects/:id/costs`

**Qué hace:** Retorna todos los costos (estimados y reales) asociados a un proyecto, incluyendo tanto los costos directos del proyecto como los costos de sus tareas. Proporciona una vista consolidada para el análisis financiero.

**Respuesta exitosa (`200 OK`):**
```json
{
  "projectId": "uuid",
  "costs": [
    { "id": "uuid", "type": "estimated", "amount": 15000, "description": "..." },
    { "id": "uuid", "type": "actual", "amount": 3200, "taskId": "uuid-tarea" }
  ]
}
```

---

#### `GET /tasks/:id/costs`

**Qué hace:** Retorna todos los costos asociados directamente a una tarea específica. Útil para ver el desglose económico a nivel de tarea.

---

### Métricas de Costos

#### `GET /projects/:id/cost-summary`

**Qué hace:** Genera un resumen financiero del proyecto calculando los totales de costos estimados, reales y el monto restante del presupuesto. Es la vista principal del dashboard de costos.

**Lógica interna:**
1. Suma todos los costos de tipo `estimated` del proyecto y sus tareas.
2. Suma todos los costos de tipo `actual`.
3. Calcula `remaining = estimated - actual`.

**Respuesta exitosa (`200 OK`):**
```json
{
  "estimated": 15000,
  "actual": 12000,
  "remaining": 3000,
  "currency": "MXN",
  "projectId": "uuid"
}
```

---

## 12. Reports

### Descripción general

El módulo de reportes permite generar documentos de análisis sobre el estado de un proyecto. Los reportes son asíncronos: se solicita su generación (`POST /reports`) y luego se consulta su estado y resultado (`GET /reports/:id`). Cada reporte tiene un tipo que define qué datos incluye y cómo se presentan.

### Tipos de Reporte

| Tipo | Descripción |
|------|-------------|
| `progress` | Avance del proyecto: tareas completadas vs. pendientes, porcentaje de avance por columna y por miembro. |
| `cost` | Análisis financiero: desviación entre costo estimado y real, proyección de gasto. |
| `activity` | Resumen de actividad: quién hizo qué y cuándo. Extrae datos del `ActivityLog`. |

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/reports` | Solicita la generación de un nuevo reporte |
| `GET` | `/reports` | Lista los reportes generados |
| `GET` | `/reports/:id` | Obtiene un reporte por ID |

---

#### `POST /reports`

**Qué hace:** Solicita la generación de un reporte para un proyecto en un rango de fechas. El proceso de generación puede ser síncrono o asíncrono según el tamaño del proyecto. El reporte queda almacenado y puede exportarse como PDF o JSON.

**Body esperado:**
```json
{
  "projectId": "uuid-proyecto",
  "type": "progress",
  "dateFrom": "2026-07-01",
  "dateTo": "2026-07-31",
  "format": "json"
}
```

**Lógica interna:**
1. Valida que el usuario tiene el privilegio `reporte:exportar`.
2. Recolecta los datos del proyecto según el tipo de reporte.
3. Genera el documento (JSON estructurado o PDF).
4. Almacena el reporte con estado `generated`.
5. Registra la acción en `ActivityLog`.

**Respuesta exitosa (`201 Created`):**
```json
{
  "id": "uuid",
  "type": "progress",
  "status": "generated",
  "downloadUrl": "https://storage.praxis.dev/reports/uuid.pdf"
}
```

---

#### `GET /reports`

**Qué hace:** Lista todos los reportes generados. Filtra por proyecto y tipo si se proporcionan. Incluye el estado de generación y la URL de descarga para reportes completados.

**Query params opcionales:**
- `projectId` — Reportes de un proyecto.
- `type` — `progress` | `cost` | `activity`.

---

#### `GET /reports/:id`

**Qué hace:** Obtiene el detalle de un reporte específico, incluyendo todos los datos generados (si el formato es JSON) o la URL de descarga (si es PDF). Permite visualizar el reporte directamente en el dashboard.

**Respuesta exitosa (`200 OK`):**
```json
{
  "id": "uuid",
  "type": "cost",
  "projectId": "uuid",
  "generatedAt": "2026-07-31T23:59:00Z",
  "data": {
    "estimated": 15000,
    "actual": 12000,
    "deviation": -3000,
    "deviationPercent": -20
  }
}
```

---

## 13. Activity Log

### Descripción general

El log de actividad es el registro histórico de todas las acciones importantes realizadas en el sistema. **No tiene CRUD completo**: los registros se insertan automáticamente desde los servicios cuando ocurre un evento relevante (crear, modificar, mover o eliminar entidades). Los usuarios solo pueden consultar el log; no pueden crear, editar ni eliminar entradas manualmente.

Este módulo implementa el patrón **Observer**: los servicios de dominio emiten eventos que el servicio del log recibe y persiste sin acoplamiento directo.

### Cuándo se inserta automáticamente

Los eventos que generan entradas en el log incluyen (no limitado a):

- Usuario creado / activado / desactivado.
- Proyecto creado / archivado / completado / eliminado.
- Miembro agregado / eliminado de proyecto.
- Tarea creada / movida / actualizada / eliminada.
- Tarea asignada / desasignada.
- Reporte generado.
- Costo registrado / actualizado.

### Estructura de una entrada de log

```json
{
  "id": "uuid",
  "action": "updated",
  "entity": "task",
  "entityId": "uuid-tarea",
  "userId": "uuid-usuario",
  "description": "César Contreras movió la tarea 'Implementar login' a la columna 'Done'.",
  "metadata": { "fromColumn": "uuid-col-old", "toColumn": "uuid-col-done" },
  "createdAt": "2026-07-10T14:32:00Z"
}
```

### Endpoints (Solo Lectura)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/activity-log` | Lista entradas del log con filtros |
| `GET` | `/activity-log/:id` | Obtiene una entrada específica del log |

---

#### `GET /activity-log`

**Qué hace:** Retorna el historial de actividad del sistema con soporte para múltiples filtros combinables. Permite a los administradores y project managers ver quién hizo qué y cuándo. Soporta paginación para manejar grandes volúmenes de registros.

**Query params opcionales (filtrables y combinables):**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `entity` | `string` | Filtra por tipo de entidad afectada. Ej: `task`, `project`, `user` |
| `user` | `UUID` | Filtra por el usuario que realizó la acción |
| `action` | `string` | Filtra por tipo de acción. Ej: `created`, `updated`, `deleted`, `moved` |
| `entityId` | `UUID` | Filtra el log de una entidad específica |
| `projectId` | `UUID` | Filtra por proyecto (incluye tareas, tableros y miembros del proyecto) |
| `dateFrom` | `ISO date` | Filtra desde esta fecha |
| `dateTo` | `ISO date` | Filtra hasta esta fecha |
| `page` | `number` | Página actual (paginación) |
| `limit` | `number` | Resultados por página |

**Ejemplos de uso:**
```
GET /activity-log?entity=task
GET /activity-log?user=123
GET /activity-log?action=updated
GET /activity-log?entity=task&action=moved&projectId=uuid-proyecto
GET /activity-log?dateFrom=2026-07-01&dateTo=2026-07-31
```

**Respuesta exitosa (`200 OK`):**
```json
{
  "data": [
    {
      "id": "uuid",
      "action": "moved",
      "entity": "task",
      "entityId": "uuid-tarea",
      "userId": "uuid-usuario",
      "description": "César movió 'Implementar login' a Done.",
      "createdAt": "2026-07-10T14:32:00Z"
    }
  ],
  "total": 234,
  "page": 1,
  "limit": 20
}
```

---

#### `GET /activity-log/:id`

**Qué hace:** Obtiene el detalle completo de una entrada específica del log, incluyendo el campo `metadata` que contiene información adicional sobre el cambio realizado (ej. valores anteriores y nuevos, columna origen y destino, etc.).

**Respuesta exitosa (`200 OK`):**
```json
{
  "id": "uuid",
  "action": "updated",
  "entity": "task",
  "entityId": "uuid-tarea",
  "userId": "uuid-usuario",
  "description": "César actualizó la prioridad de 'Implementar login'.",
  "metadata": {
    "field": "priority",
    "oldValue": "medium",
    "newValue": "critical"
  },
  "createdAt": "2026-07-10T14:32:00Z"
}
```

---

## Apéndice — Convenciones Generales

### Autenticación

Todos los endpoints (excepto `POST /auth/register` y `POST /auth/login`) requieren el header:

```
Authorization: Bearer <access_token>
```

### Formato de errores

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "No se encontró el recurso solicitado."
}
```

### Códigos de respuesta comunes

| Código | Significado |
|--------|-------------|
| `200 OK` | Operación exitosa |
| `201 Created` | Recurso creado correctamente |
| `400 Bad Request` | Datos de entrada inválidos |
| `401 Unauthorized` | Token inválido o ausente |
| `403 Forbidden` | Sin privilegios para la operación |
| `404 Not Found` | Recurso no encontrado |
| `409 Conflict` | Conflicto (ej. email duplicado) |
| `500 Internal Server Error` | Error inesperado del servidor |

### Guards de Privilegios

Cada endpoint protegido evalúa el privilegio requerido uniendo:
1. Privilegios heredados de los **roles globales** del usuario.
2. **Privilegios directos** asignados al usuario.
3. Privilegios del **rol de proyecto** del usuario (para operaciones dentro de un proyecto).

Si la unión de privilegios incluye el requerido, el acceso es concedido. De lo contrario, se retorna `403 Forbidden`.

---

*Documentación generada para el proyecto Praxis — Backend NestJS.*  
*Stack: NestJS + TypeORM + PostgreSQL | Seguridad: JWT + Guards de Privilegios Dinámicos*
