# Guía de Rutas de la API — Backend Gateway

Esta documentación detalla la forma correcta de llamar a los endpoints de los distintos servicios a través del API Gateway de Praxis, tras la reestructuración a una jerarquía RESTful.

Todos los endpoints requieren autenticación mediante un token Bearer en las cabeceras (excepto los de autenticación pública):
`Authorization: Bearer <JWT_TOKEN>`

---

## 1. Servicio de Proyectos (Projects)

### Crear Proyecto
* **Método:** `POST`
* **Ruta:** `/projects`
* **Body (JSON):**
  ```json
  {
    "name": "Nombre del Proyecto",
    "description": "Descripción opcional del proyecto"
  }
  ```

### Listar Proyectos del Usuario Autenticado
* **Método:** `GET`
* **Ruta:** `/projects`
* **Body (JSON) [Opcional para paginación]:**
  ```json
  {
    "query": {
      "page": 1,
      "limit": 20
    }
  }
  ```

### Detalle de un Proyecto
* **Método:** `GET`
* **Ruta:** `/projects/:id`
* **Parámetros de Ruta:**
  * `:id` — ID del Proyecto (UUID v4)

### Actualizar Proyecto
* **Método:** `PATCH`
* **Ruta:** `/projects/:id`
* **Parámetros de Ruta:**
  * `:id` — ID del Proyecto (UUID v4)
* **Body (JSON):**
  ```json
  {
    "name": "Nuevo Nombre del Proyecto",
    "description": "Nueva Descripción"
  }
  ```

### Eliminar Proyecto
* **Método:** `DELETE`
* **Ruta:** `/projects/:id`
* **Parámetros de Ruta:**
  * `:id` — ID del Proyecto (UUID v4)

---

## 2. Servicio de Workspaces

### Crear Workspace (dentro de un Proyecto)
* **Método:** `POST`
* **Ruta:** `/projects/:projectId/workspaces`
* **Parámetros de Ruta:**
  * `:projectId` — ID del Proyecto (UUID v4)
* **Body (JSON):**
  ```json
  {
    "name": "Nombre del Workspace"
  }
  ```

### Listar Workspaces de un Proyecto
* **Método:** `GET`
* **Ruta:** `/projects/:projectId/workspaces`
* **Parámetros de Ruta:**
  * `:projectId` — ID del Proyecto (UUID v4)

### Detalle de un Workspace (Directo)
* **Método:** `GET`
* **Ruta:** `/workspaces/:workspaceId`
* **Parámetros de Ruta:**
  * `:workspaceId` — ID del Workspace (UUID v4)

### Actualizar Workspace (Directo)
* **Método:** `PATCH`
* **Ruta:** `/workspaces/:workspaceId`
* **Parámetros de Ruta:**
  * `:workspaceId` — ID del Workspace (UUID v4)
* **Body (JSON):**
  ```json
  {
    "name": "Nuevo Nombre del Workspace"
  }
  ```

### Eliminar Workspace (Directo)
* **Método:** `DELETE`
* **Ruta:** `/workspaces/:workspaceId`
* **Parámetros de Ruta:**
  * `:workspaceId` — ID del Workspace (UUID v4)

---

## 3. Servicio de Tableros (Boards)

### Crear Board (dentro de un Workspace)
* **Método:** `POST`
* **Ruta:** `/workspaces/:workspaceId/boards`
* **Parámetros de Ruta:**
  * `:workspaceId` — ID del Workspace (UUID v4)
* **Body (JSON):**
  ```json
  {
    "name": "Nombre del Tablero"
  }
  ```

### Listar Boards de un Workspace
* **Método:** `GET`
* **Ruta:** `/workspaces/:workspaceId/boards`
* **Parámetros de Ruta:**
  * `:workspaceId` — ID del Workspace (UUID v4)

### Detalle de un Board (Directo)
* **Método:** `GET`
* **Ruta:** `/boards/:boardId`
* **Parámetros de Ruta:**
  * `:boardId` — ID del Tablero (UUID v4)

### Actualizar Board (Directo)
* **Método:** `PATCH`
* **Ruta:** `/boards/:boardId`
* **Parámetros de Ruta:**
  * `:boardId` — ID del Tablero (UUID v4)
* **Body (JSON):**
  ```json
  {
    "name": "Nuevo Nombre del Tablero"
  }
  ```

### Eliminar Board (Directo)
* **Método:** `DELETE`
* **Ruta:** `/boards/:boardId`
* **Parámetros de Ruta:**
  * `:boardId` — ID del Tablero (UUID v4)

---

## 4. Servicio de Columnas (Columns)

### Crear Columna
* **Método:** `POST`
* **Ruta:** `/boards/:boardId/columns`
* **Parámetros de Ruta:**
  * `:boardId` — ID del Tablero (UUID v4)
* **Body (JSON):**
  ```json
  {
    "name": "Nombre de la Columna",
    "order": 0
  }
  ```

### Reordenar Columnas de un Board
* **Método:** `PATCH`
* **Ruta:** `/boards/:boardId/columns/reorder`
* **Parámetros de Ruta:**
  * `:boardId` — ID del Tablero (UUID v4)
* **Body (JSON):**
  ```json
  {
    "columnIds": [
      "uuid-columna-1",
      "uuid-columna-2",
      "uuid-columna-3"
    ]
  }
  ```

### Eliminar Columna
* **Método:** `DELETE`
* **Ruta:** `/boards/:boardId/columns/:id`
* **Parámetros de Ruta:**
  * `:boardId` — ID del Tablero (UUID v4)
  * `:id` — ID de la Columna (UUID v4)

---

## 5. Servicio de Tareas (Tasks)

### Crear Tarea o Subtarea (en un Board)
* **Método:** `POST`
* **Ruta:** `/boards/:boardId/tasks`
* **Parámetros de Ruta:**
  * `:boardId` — ID del Tablero (UUID v4)
* **Body (JSON):**
  ```json
  {
    "projectId": "uuid-del-proyecto",
    "columnId": "uuid-de-la-columna",
    "title": "Título de la Tarea",
    "status": "Nombre de la Columna/Estado",
    "description": "Descripción de la tarea (opcional)",
    "assigneeId": "uuid-del-encargado (opcional)",
    "dueDate": "2026-12-31T23:59:59Z (opcional)",
    "priority": "MEDIUM (LOW, MEDIUM, HIGH, URGENT) (opcional)",
    "order": 0,
    "parentTaskId": "uuid-tarea-padre (opcional, para crear subtarea)"
  }
  ```

### Listar Tareas de un Board
* **Método:** `GET`
* **Ruta:** `/boards/:boardId/tasks`
* **Parámetros de Ruta:**
  * `:boardId` — ID del Tablero (UUID v4)
* **Query Params (Opcionales):**
  * `columnId` — Filtrar por columna (UUID v4)
  * `page` — Número de página
  * `limit` — Límite de ítems

### Detalle de una Tarea (Sin projectId en Query)
* **Método:** `GET`
* **Ruta:** `/tasks/:id`
* **Parámetros de Ruta:**
  * `:id` — ID de la Tarea (UUID v4)

### Actualizar Tarea (Sin projectId en Body/Query)
* **Método:** `PATCH`
* **Ruta:** `/tasks/:id`
* **Parámetros de Ruta:**
  * `:id` — ID de la Tarea (UUID v4)
* **Body (JSON):**
  ```json
  {
    "projectId": "uuid-del-proyecto",
    "title": "Nuevo Título",
    "description": "Nueva Descripción",
    "status": "Nuevo Estado",
    "columnId": "uuid-nueva-columna",
    "assigneeId": "uuid-nuevo-encargado",
    "priority": "HIGH",
    "dueDate": "2026-12-25T00:00:00Z"
  }
  ```

### Mover Tarea (de Columna o Posición)
* **Método:** `POST`
* **Ruta:** `/tasks/:id/move`
* **Parámetros de Ruta:**
  * `:id` — ID de la Tarea (UUID v4)
* **Body (JSON):**
  ```json
  {
    "projectId": "uuid-del-proyecto",
    "columnId": "uuid-destino-columna",
    "status": "Nuevo Estado/Columna",
    "order": 1
  }
  ```

### Asignar Tarea
* **Método:** `POST`
* **Ruta:** `/tasks/:id/assign`
* **Parámetros de Ruta:**
  * `:id` — ID de la Tarea (UUID v4)
* **Body (JSON):**
  ```json
  {
    "projectId": "uuid-del-proyecto",
    "assigneeId": "uuid-usuario-asignado (o null para desasignar)"
  }
  ```

### Eliminar Tarea (Sin projectId en Body/Query)
* **Método:** `DELETE`
* **Ruta:** `/tasks/:id`
* **Parámetros de Ruta:**
  * `:id` — ID de la Tarea (UUID v4)
* **Body (JSON):**
  ```json
  {
    "projectId": "uuid-del-proyecto"
  }
  ```

---

## 6. Servicio de Checklists

### Crear Ítem de Checklist
* **Método:** `POST`
* **Ruta:** `/tasks/:taskId/checklists`
* **Parámetros de Ruta:**
  * `:taskId` — ID de la Tarea (UUID v4)
* **Body (JSON):**
  ```json
  {
    "projectId": "uuid-del-proyecto",
    "text": "Texto del ítem del checklist",
    "order": 0
  }
  ```

### Alternar Estado de Ítem de Checklist (Toggle)
* **Método:** `POST`
* **Ruta:** `/tasks/:taskId/checklists/:id/toggle`
* **Parámetros de Ruta:**
  * `:taskId` — ID de la Tarea (UUID v4)
  * `:id` — ID del Ítem del Checklist (UUID v4)
* **Body (JSON):**
  ```json
  {
    "projectId": "uuid-del-proyecto"
  }
  ```

### Eliminar Ítem de Checklist
* **Método:** `DELETE`
* **Ruta:** `/tasks/:taskId/checklists/:id`
* **Parámetros de Ruta:**
  * `:taskId` — ID de la Tarea (UUID v4)
  * `:id` — ID del Ítem del Checklist (UUID v4)
* **Body (JSON):**
  ```json
  {
    "projectId": "uuid-del-proyecto"
  }
  ```
