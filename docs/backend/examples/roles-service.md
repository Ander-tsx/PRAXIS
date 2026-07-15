# Ejemplos de Endpoints — `roles-service` (Puerto TCP: 3002)

Este servicio gestiona los roles globales (ej. `Admin`, `User`) y controla qué usuarios tienen autorización de vista sobre qué proyectos específicos (a través del modelo `UserProjectAccess`).

---

## 1. Listar Roles Globales (`role_find_all`)

* **MessagePattern (TCP)**: `{ cmd: 'role_find_all' }`
* **Descripción**: Retorna todos los roles globales disponibles en la plataforma.
* **Información Recibida (Payload)**: `null` o `{}`
* **Información Devuelta (Response)**:
  ```json
  [
    {
      "id": "9a12c4e5-82df-424a-9562-bb443a7b6eef",
      "name": "Admin",
      "description": "Acceso de administración sobre toda la plataforma",
      "createdAt": "2026-07-15T00:00:00.000Z"
    },
    {
      "id": "3b4f5a6b-12cd-34ef-56ab-78cd90ef12ab",
      "name": "User",
      "description": "Miembro normal del sistema",
      "createdAt": "2026-07-15T00:00:00.000Z"
    }
  ]
  ```
* **Comportamiento en Caché (Redis)**:
  - Guarda el resultado en `roles:all` con un TTL de 5 minutos (300 segundos).

---

## 2. Asignar Rol Global a un Usuario (`role_assign`)

* **MessagePattern (TCP)**: `{ cmd: 'role_assign' }`
* **Descripción**: Asigna un rol global (ej. `Admin`) a un usuario determinado y limpia su caché de roles.
* **DTO de Entrada**: `AssignRoleDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "roleName": "Admin"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  {
    "id": "5fa23d6a-bb39-4402-a1f9-90bc1f1cbe8d",
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "roleId": "9a12c4e5-82df-424a-9562-bb443a7b6eef",
    "createdAt": "2026-07-15T03:30:00.000Z",
    "role": {
      "id": "9a12c4e5-82df-424a-9562-bb443a7b6eef",
      "name": "Admin",
      "description": "Acceso de administración sobre toda la plataforma",
      "createdAt": "2026-07-15T00:00:00.000Z"
    }
  }
  ```
* **Comportamiento en BD (Prisma)**:
  - Crea un registro en `UserRole`.
* **Comportamiento en Caché (Redis)**:
  - Invalida (elimina) la caché de roles del usuario: `roles:user:<userId>`.

---

## 3. Revocar Rol Global de un Usuario (`role_revoke`)

* **MessagePattern (TCP)**: `{ cmd: 'role_revoke' }`
* **Descripción**: Remueve la asignación de un rol global de un usuario y limpia su caché.
* **DTO de Entrada**: `RevokeRoleDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "roleName": "Admin"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  {
    "success": true
  }
  ```
* **Comportamiento en BD (Prisma)**:
  - Elimina el registro de `UserRole` coincidente.
* **Comportamiento en Caché (Redis)**:
  - Invalida (elimina) la caché de roles del usuario: `roles:user:<userId>`.

---

## 4. Obtener Roles de un Usuario (`role_get_user_roles`)

* **MessagePattern (TCP)**: `{ cmd: 'role_get_user_roles' }`
* **Descripción**: Devuelve todos los roles globales que tiene asignados un usuario, usando caché de Redis.
* **DTO de Entrada**: `GetUserRolesDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  [
    {
      "id": "9a12c4e5-82df-424a-9562-bb443a7b6eef",
      "name": "Admin",
      "description": "Acceso de administración sobre toda la plataforma",
      "createdAt": "2026-07-15T00:00:00.000Z"
    }
  ]
  ```
* **Comportamiento en Caché (Redis)**:
  - Intenta consultar `roles:user:<userId>`. Si no existe, consulta la BD y almacena en caché con un TTL corto de 60 segundos.

---

## 5. Verificar Rol de un Usuario (`role_check`)

* **MessagePattern (TCP)**: `{ cmd: 'role_check' }`
* **Descripción**: Comprueba rápidamente si un usuario cuenta con un rol global específico.
* **DTO de Entrada**: `CheckRoleDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "roleName": "Admin"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  {
    "hasRole": true
  }
  ```
* **Comportamiento en BD (Prisma)**:
  - Realiza un `findUnique` buscando el par `userId` y `roleId`.

---

## 6. Conceder Acceso de Vista a un Proyecto (`project_access_grant`)

* **MessagePattern (TCP)**: `{ cmd: 'project_access_grant' }`
* **Descripción**: Asigna acceso de visualización de un proyecto a un usuario normal.
* **DTO de Entrada**: `GrantProjectAccessDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  {
    "id": "90ba1f2c-be3d-4c5e-8f9a-0b1c2d3e4f5a",
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "grantedAt": "2026-07-15T03:30:00.000Z"
  }
  ```
* **Comportamiento en BD (Prisma)**:
  - Crea una fila en `UserProjectAccess`.
* **Comportamiento en Caché (Redis)**:
  - Invalida las claves `project_access:user:<userId>` y `project_access:project:<projectId>`.

---

## 7. Revocar Acceso de Vista a un Proyecto (`project_access_revoke`)

* **MessagePattern (TCP)**: `{ cmd: 'project_access_revoke' }`
* **Descripción**: Quita el acceso de visualización a un proyecto de un usuario.
* **DTO de Entrada**: `RevokeProjectAccessDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  {
    "success": true
  }
  ```
* **Comportamiento en BD (Prisma)**:
  - Elimina el registro de `UserProjectAccess`.
* **Comportamiento en Caché (Redis)**:
  - Invalida las claves `project_access:user:<userId>` y `project_access:project:<projectId>`.

---

## 8. Obtener Proyectos Accesibles de un Usuario (`project_access_get_user`)

* **MessagePattern (TCP)**: `{ cmd: 'project_access_get_user' }`
* **Descripción**: Retorna la lista de IDs de proyectos a los cuales el usuario tiene acceso explícito.
* **DTO de Entrada**: `GetUserProjectAccessDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  [
    "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a"
  ]
  ```
* **Comportamiento en Caché (Redis)**:
  - Intenta consultar `project_access:user:<userId>`. Si no existe, realiza un `findMany` en la BD y escribe en caché con TTL de 60 segundos.

---

## 9. Verificar Acceso a Proyecto (`project_access_check`)

* **MessagePattern (TCP)**: `{ cmd: 'project_access_check' }`
* **Descripción**: Verifica si un usuario tiene permitido ver un proyecto. Los usuarios con rol global `Admin` tienen acceso automático e implícito a todos los proyectos.
* **DTO de Entrada**: `CheckProjectAccessDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  {
    "hasAccess": true
  }
  ```
* **Comportamiento en BD (Prisma)**:
  - Primero verifica si el usuario es `Admin` global en `UserRole`. Si lo es, retorna `true`.
  - Si no, busca un registro exacto en `UserProjectAccess`.

---

## 10. Obtener Usuarios con Acceso a un Proyecto (`project_access_get_by_project`)

* **MessagePattern (TCP)**: `{ cmd: 'project_access_get_by_project' }`
* **Descripción**: Retorna la lista de IDs de usuarios que tienen acceso de visualización asignado para un proyecto.
* **Información Recibida (Payload)**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  [
    "e81e9f45-0d29-45ff-81fb-992257d09618"
  ]
  ```
* **Comportamiento en Caché (Redis)**:
  - Intenta consultar `project_access:project:<projectId>`. Si no existe, consulta la BD y almacena con TTL de 60 segundos.
