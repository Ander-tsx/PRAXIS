# Ejemplos de Endpoints — `tasks-service` (Puerto TCP: 3004)

Este servicio gestiona las tareas, subtareas y listas de control (checklists) dentro de cada tablero. Antes de cada operación de escritura, este servicio realiza una validación interna consultando al `projects-service` para asegurar que el usuario tenga los permisos necesarios (ej. `canCreateTask`, `canEditTask`).

---

## 1. Crear Tarea (`task_create`)

* **MessagePattern (TCP)**: `{ cmd: 'task_create' }`
* **Descripción**: Crea una nueva tarea en una columna y tablero específicos, tras validar los permisos del usuario.
* **Payload**:
  ```json
  {
    "title": "Implementar JWT refresh token",
    "description": "Añadir renovación automática de tokens de acceso usando refresh tokens.",
    "status": "TODO",
    "boardId": "4d4d5e5e-6f6f-7a7a-8b8b-9c9c0d0d1e1e",
    "columnId": "6f6f7a7a-8b8b-9c9c-0d0d-1e1e2f2f3a3a",
    "reporterId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "priority": "HIGH",
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a"
  }
  ```
* **Response**:
  ```json
  {
    "id": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b",
    "title": "Implementar JWT refresh token",
    "description": "Añadir renovación automática de tokens de acceso usando refresh tokens.",
    "status": "TODO",
    "boardId": "4d4d5e5e-6f6f-7a7a-8b8b-9c9c0d0d1e1e",
    "columnId": "6f6f7a7a-8b8b-9c9c-0d0d-1e1e2f2f3a3a",
    "assigneeId": null,
    "reporterId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "parentTaskId": null,
    "dueDate": null,
    "priority": "HIGH",
    "order": 0,
    "createdAt": "2026-07-15T03:30:00.000Z",
    "updatedAt": "2026-07-15T03:30:00.000Z"
  }
  ```
* **Validación de Permisos (Llamada Interna)**:
  - Invoca a `projects-service` con el patrón `{ cmd: 'project_check_permission' }` y el payload `{ userId: reporterId, projectId: projectId, permission: 'canCreateTask' }`.
* **Caché (Redis)**:
  - Invalida la caché de tareas del tablero: `tasks:board:<boardId>`.

---

## 2. Listar Tareas de un Tablero/Columna (`task_find_all`)

* **MessagePattern (TCP)**: `{ cmd: 'task_find_all' }`
* **Descripción**: Recupera todas las tareas asociadas a un tablero, opcionalmente filtradas por columna.
* **Payload**:
  ```json
  {
    "boardId": "4d4d5e5e-6f6f-7a7a-8b8b-9c9c0d0d1e1e",
    "columnId": "6f6f7a7a-8b8b-9c9c-0d0d-1e1e2f2f3a3a"
  }
  ```
* **Response**:
  ```json
  {
    "items": [
      {
        "id": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b",
        "title": "Implementar JWT refresh token",
        "description": "Añadir renovación automática de tokens de acceso usando refresh tokens.",
        "status": "TODO",
        "boardId": "4d4d5e5e-6f6f-7a7a-8b8b-9c9c0d0d1e1e",
        "columnId": "6f6f7a7a-8b8b-9c9c-0d0d-1e1e2f2f3a3a",
        "assigneeId": null,
        "reporterId": "e81e9f45-0d29-45ff-81fb-992257d09618",
        "parentTaskId": null,
        "dueDate": null,
        "priority": "HIGH",
        "order": 0,
        "createdAt": "2026-07-15T03:30:00.000Z",
        "updatedAt": "2026-07-15T03:30:00.000Z"
      }
    ],
    "total": 1
  }
  ```
* **Caché (Redis)**: Almacena en `tasks:board:<boardId>`, con TTL configurable.

---

## 3. Consultar Detalle de Tarea (`task_find_one`)

* **MessagePattern (TCP)**: `{ cmd: 'task_find_one' }`
* **Descripción**: Retorna la información de una tarea con su checklist y subtareas.
* **Payload**:
  ```json
  {
    "id": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b"
  }
  ```
* **Response**:
  ```json
  {
    "id": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b",
    "title": "Implementar JWT refresh token",
    "description": "Añadir renovación automática de tokens de acceso...",
    "status": "TODO",
    "boardId": "4d4d5e5e-6f6f-7a7a-8b8b-9c9c0d0d1e1e",
    "columnId": "6f6f7a7a-8b8b-9c9c-0d0d-1e1e2f2f3a3a",
    "assigneeId": null,
    "reporterId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "priority": "HIGH",
    "order": 0,
    "createdAt": "2026-07-15T03:30:00.000Z",
    "updatedAt": "2026-07-15T03:30:00.000Z",
    "subtasks": [],
    "checklists": [
      {
        "id": "b1b1c2c2-d3d3-4e4e-5f5f-6a6a7b7b8c8c",
        "taskId": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b",
        "text": "Modificar credenciales-service en backend",
        "completed": false,
        "order": 0
      }
    ]
  }
  ```
* **Caché (Redis)**: Clave `task:<taskId>`, TTL configurable.

---

## 4. Actualizar Tarea (`task_update`)

* **MessagePattern (TCP)**: `{ cmd: 'task_update' }`
* **Descripción**: Modifica datos básicos de la tarea (título, descripción, prioridad, fecha de vencimiento).
* **Payload**:
  ```json
  {
    "id": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b",
    "title": "Implementar JWT refresh token (Completo)",
    "priority": "URGENT",
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "requesterId": "e81e9f45-0d29-45ff-81fb-992257d09618"
  }
  ```
* **Response**: La tarea actualizada.
* **Caché (Redis)**: Invalida las claves `task:<taskId>` y `tasks:board:<boardId>`.

---

## 5. Mover Tarea (`task_move`)

* **MessagePattern (TCP)**: `{ cmd: 'task_move' }`
* **Descripción**: Cambia la tarea de columna o actualiza su índice de ordenación dentro de la columna actual.
* **Payload**:
  ```json
  {
    "id": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b",
    "columnId": "8a8a9b9b-0c0c-1d1d-2e2e-3f3f4a4a5b5b",
    "order": 3,
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "requesterId": "e81e9f45-0d29-45ff-81fb-992257d09618"
  }
  ```
* **Response**: La tarea con su nueva ubicación.
* **Caché (Redis)**: Invalida `tasks:board:<boardId>`.

---

## 6. Eliminar Tarea (`task_delete`)

* **MessagePattern (TCP)**: `{ cmd: 'task_delete' }`
* **Descripción**: Elimina una tarea y todos sus subelementos asociados (checklist, subtareas).
* **Payload**:
  ```json
  {
    "id": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b",
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "requesterId": "e81e9f45-0d29-45ff-81fb-992257d09618"
  }
  ```
* **Response**:
  ```json
  {
    "success": true
  }
  ```
* **Caché (Redis)**: Invalida las claves `task:<taskId>` y `tasks:board:<boardId>`.

---

## 7. Asignar Encargado (`task_assign`)

* **MessagePattern (TCP)**: `{ cmd: 'task_assign' }`
* **Descripción**: Asigna a un usuario miembro como responsable del desarrollo de la tarea.
* **Payload**:
  ```json
  {
    "id": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b",
    "assigneeId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "requesterId": "e81e9f45-0d29-45ff-81fb-992257d09618"
  }
  ```
* **Response**: Tarea con el nuevo `assigneeId`.

---

## 8. Listas de Control (`checklists`)

### 8.1 Agregar Ítem a Checklist (`checklist_create`)
* **MessagePattern (TCP)**: `{ cmd: 'checklist_create' }`
* **Payload**:
  ```json
  {
    "taskId": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b",
    "text": "Modificar credenciales-service en backend",
    "order": 1
  }
  ```
* **Response**:
  ```json
  {
    "id": "b1b1c2c2-d3d3-4e4e-5f5f-6a6a7b7b8c8c",
    "taskId": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b",
    "text": "Modificar credenciales-service en backend",
    "completed": false,
    "order": 1
  }
  ```
* **Caché (Redis)**: Invalida la clave `task:<taskId>`.

### 8.2 Alternar Estado de Ítem (`checklist_toggle`)
* **MessagePattern (TCP)**: `{ cmd: 'checklist_toggle' }`
* **Payload**:
  ```json
  {
    "id": "b1b1c2c2-d3d3-4e4e-5f5f-6a6a7b7b8c8c",
    "completed": true
  }
  ```
* **Response**: El ítem de checklist modificado.
* **Caché (Redis)**: Invalida la clave `task:<taskId>`.
