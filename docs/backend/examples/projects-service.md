# Ejemplos de Endpoints — `projects-service` (Puerto TCP: 3003)

Este servicio gestiona la estructura de proyectos, espacios de trabajo (workspaces), tableros kanban (boards), columnas de tableros, membresías y los roles locales y permisos dentro de cada proyecto.

---

## 1. Proyectos (`projects`)

### 1.1 Crear Proyecto (`project_create`)
* **MessagePattern (TCP)**: `{ cmd: 'project_create' }`
* **Descripción**: Crea un nuevo proyecto en el sistema.
* **DTO de Entrada**: `CreateProjectDto` (de `@praxis/contracts`)
* **Payload**:
  ```json
  {
    "ownerId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "name": "Praxis Task Board",
    "description": "Tablero ágil para gestión interna"
  }
  ```
* **Response**:
  ```json
  {
    "id": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "name": "Praxis Task Board",
    "description": "Tablero ágil para gestión interna",
    "ownerId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "createdAt": "2026-07-15T03:30:00.000Z",
    "updatedAt": "2026-07-15T03:30:00.000Z"
  }
  ```

### 1.2 Listar Proyectos (`project_find_all`)
* **MessagePattern (TCP)**: `{ cmd: 'project_find_all' }`
* **Descripción**: Retorna los proyectos del usuario de forma paginada.
* **DTO de Entrada**: `FindProjectsDto` (de `@praxis/contracts`)
* **Payload**:
  ```json
  {
    "ownerId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "query": {
      "page": 1,
      "limit": 10
    }
  }
  ```
* **Response**:
  ```json
  {
    "items": [
      {
        "id": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
        "name": "Praxis Task Board",
        "description": "Tablero ágil para gestión interna",
        "ownerId": "e81e9f45-0d29-45ff-81fb-992257d09618",
        "createdAt": "2026-07-15T03:30:00.000Z",
        "updatedAt": "2026-07-15T03:30:00.000Z",
        "_count": {
          "members": 1,
          "workspaces": 0
        }
      }
    ],
    "total": 1
  }
  ```

### 1.3 Consultar Proyecto (`project_find_one`)
* **MessagePattern (TCP)**: `{ cmd: 'project_find_one' }`
* **Descripción**: Retorna la estructura completa de un proyecto incluyendo workspaces, boards, columns y roles locales. Usa caché de Redis.
* **Payload**:
  ```json
  {
    "id": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a"
  }
  ```
* **Response**:
  ```json
  {
    "id": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "name": "Praxis Task Board",
    "description": "Tablero ágil para gestión interna",
    "ownerId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "createdAt": "2026-07-15T03:30:00.000Z",
    "updatedAt": "2026-07-15T03:30:00.000Z",
    "workspaces": [
      {
        "id": "2b2b3c3c-4d4d-5e5e-6f6f-7a7a8b8b9c9c",
        "name": "Backend Development",
        "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
        "createdAt": "2026-07-15T03:35:00.000Z",
        "boards": [
          {
            "id": "4d4d5e5e-6f6f-7a7a-8b8b-9c9c0d0d1e1e",
            "name": "Sprint 1",
            "workspaceId": "2b2b3c3c-4d4d-5e5e-6f6f-7a7a8b8b9c9c",
            "createdAt": "2026-07-15T03:36:00.000Z",
            "columns": [
              {
                "id": "6f6f7a7a-8b8b-9c9c-0d0d-1e1e2f2f3a3a",
                "name": "To Do",
                "order": 0,
                "boardId": "4d4d5e5e-6f6f-7a7a-8b8b-9c9c0d0d1e1e"
              }
            ]
          }
        ]
      }
    ],
    "roles": [
      {
        "id": "e3e3f4f4-5a5a-6b6b-7c7c-8d8d9e9e0f0f",
        "name": "Developer",
        "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
        "permissions": {
          "canCreateBoard": false,
          "canEditBoard": false,
          "canDeleteBoard": false,
          "canCreateColumn": false,
          "canEditColumn": false,
          "canDeleteColumn": false,
          "canCreateTask": true,
          "canEditTask": true,
          "canDeleteTask": false,
          "canManageMembers": false,
          "canManageRoles": false
        }
      }
    ],
    "_count": {
      "members": 1
    }
  }
  ```
* **Caché (Redis)**: Clave `project:<projectId>`, TTL 5 minutos.

### 1.4 Actualizar Proyecto (`project_update`)
* **MessagePattern (TCP)**: `{ cmd: 'project_update' }`
* **Payload**:
  ```json
  {
    "id": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "name": "Praxis Task Board Renamed",
    "description": "Nueva descripción"
  }
  ```
* **Response**: El proyecto actualizado.
* **Caché (Redis)**: Invalida la clave `project:<projectId>`.

### 1.5 Eliminar Proyecto (`project_delete`)
* **MessagePattern (TCP)**: `{ cmd: 'project_delete' }`
* **Payload**:
  ```json
  {
    "id": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a"
  }
  ```
* **Response**: `{ "success": true }`
* **Caché (Redis)**: Invalida la clave `project:<projectId>`.

---

## 2. Espacios de Trabajo (`workspaces`)

### 2.1 Crear Workspace (`workspace_create`)
* **MessagePattern (TCP)**: `{ cmd: 'workspace_create' }`
* **Payload**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "name": "Design & UI"
  }
  ```
* **Response**: El workspace creado.
* **Caché (Redis)**: Invalida `project:<projectId>`.

### 2.2 Listar Workspaces (`workspace_find_all`)
* **MessagePattern (TCP)**: `{ cmd: 'workspace_find_all' }`
* **Payload**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a"
  }
  ```
* **Response**: Array de workspaces con sus tableros y columnas incluidos.
* **Caché (Redis)**: Clave `workspaces:project:<projectId>`, TTL 60 segundos.

---

## 3. Tableros (`boards`)

### 3.1 Crear Tablero (`board_create`)
* **MessagePattern (TCP)**: `{ cmd: 'board_create' }`
* **Payload**:
  ```json
  {
    "workspaceId": "2b2b3c3c-4d4d-5e5e-6f6f-7a7a8b8b9c9c",
    "name": "User Stories"
  }
  ```
* **Response**: El tablero creado.
* **Caché (Redis)**: Invalida `boards:workspace:<workspaceId>` y `workspaces:project:<projectId>`.

### 3.2 Listar Tableros (`board_find_all`)
* **MessagePattern (TCP)**: `{ cmd: 'board_find_all' }`
* **Payload**:
  ```json
  {
    "workspaceId": "2b2b3c3c-4d4d-5e5e-6f6f-7a7a8b8b9c9c"
  }
  ```
* **Response**: Array de tableros con sus columnas.
* **Caché (Redis)**: Clave `boards:workspace:<workspaceId>`, TTL 60 segundos.

---

## 4. Columnas (`columns`)

### 4.1 Crear Columna (`column_create`)
* **MessagePattern (TCP)**: `{ cmd: 'column_create' }`
* **Payload**:
  ```json
  {
    "boardId": "4d4d5e5e-6f6f-7a7a-8b8b-9c9c0d0d1e1e",
    "name": "In Progress",
    "order": 1
  }
  ```
* **Response**: La columna creada.
* **Caché (Redis)**: Invalida `boards:workspace:<workspaceId>`.

### 4.2 Reordenar Columnas (`column_reorder`)
* **MessagePattern (TCP)**: `{ cmd: 'column_reorder' }`
* **Payload**:
  ```json
  {
    "boardId": "4d4d5e5e-6f6f-7a7a-8b8b-9c9c0d0d1e1e",
    "columnIds": [
      "6f6f7a7a-8b8b-9c9c-0d0d-1e1e2f2f3a3a",
      "8a8a9b9b-0c0c-1d1d-2e2e-3f3f4a4a5b5b"
    ]
  }
  ```
* **Response**: Array de columnas con sus nuevos valores de orden.
* **Caché (Redis)**: Invalida `boards:workspace:<workspaceId>`.

---

## 5. Miembros (`members`)

### 5.1 Agregar Miembro (`member_add`)
* **MessagePattern (TCP)**: `{ cmd: 'member_add' }`
* **Payload**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "projectRoleId": "e3e3f4f4-5a5a-6b6b-7c7c-8d8d9e9e0f0f"
  }
  ```
* **Response**: El registro de membresía con su rol local y permisos.
* **Caché (Redis)**: Invalida `members:project:<projectId>` e invalida la caché de permisos de este usuario.

### 5.2 Eliminar Miembro (`member_remove`)
* **MessagePattern (TCP)**: `{ cmd: 'member_remove' }`
* **Payload**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618"
  }
  ```
* **Response**: `{ "success": true }`
* **Caché (Redis)**: Invalida `members:project:<projectId>` y la caché de permisos de este usuario.

---

## 6. Roles de Proyecto (`project roles`)

### 6.1 Crear Rol de Proyecto (`project_role_create`)
* **MessagePattern (TCP)**: `{ cmd: 'project_role_create' }`
* **Payload**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "name": "Product Owner",
    "permissions": {
      "canCreateBoard": true,
      "canEditBoard": true,
      "canDeleteBoard": false,
      "canCreateColumn": true,
      "canEditColumn": true,
      "canDeleteColumn": false,
      "canCreateTask": true,
      "canEditTask": true,
      "canDeleteTask": true,
      "canManageMembers": true,
      "canManageRoles": true
    }
  }
  ```
* **Response**: El rol creado con su JSON de permisos.

### 6.2 Actualizar Rol de Proyecto (`project_role_update`)
* **MessagePattern (TCP)**: `{ cmd: 'project_role_update' }`
* **Payload**:
  ```json
  {
    "id": "e3e3f4f4-5a5a-6b6b-7c7c-8d8d9e9e0f0f",
    "permissions": {
      "canCreateBoard": true,
      "canEditBoard": true,
      "canDeleteBoard": true
    }
  }
  ```
* **Response**: El rol modificado.
* **Caché (Redis)**: Identifica todos los miembros que tienen este rol e invalida sus cachés de permisos (`project:<projectId>:user:<userId>:permissions`).

---

## 7. Verificación de Permisos (`project_check_permission`)

* **MessagePattern (TCP)**: `{ cmd: 'project_check_permission' }`
* **Descripción**: Verifica si un usuario tiene un permiso específico dentro del proyecto. Es utilizado por `tasks-service` antes de escribir cambios.
* **DTO de Entrada**: `CheckPermissionDto` (de `@praxis/contracts`)
* **Payload**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "permission": "canCreateTask"
  }
  ```
* **Response**:
  ```json
  {
    "allowed": true
  }
  ```
* **Caché (Redis)**: Clave de caché de permisos: `project:<projectId>:user:<userId>:permissions` (TTL de 5 minutos / 300 segundos).
