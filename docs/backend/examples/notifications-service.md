# Ejemplos de Endpoints — `notifications-service` (Puerto TCP: 3005)

Este servicio gestiona la persistencia de las notificaciones internas enviadas a los usuarios tras diversos eventos de negocio (ej. asignación de tareas, adición a proyectos, etc.).

---

## 1. Registrar Notificación (`notification_create`)

* **MessagePattern (TCP)**: `{ cmd: 'notification_create' }`
* **Descripción**: Almacena una nueva notificación dirigida a un usuario destinatario y reinicia/invalida su contador de notificaciones no leídas en Redis.
* **Payload**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "type": "TASK_ASSIGNED",
    "title": "Nueva Tarea Asignada",
    "body": "Se te ha asignado la tarea: Implementar JWT refresh token",
    "metadata": {
      "taskId": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b",
      "boardId": "4d4d5e5e-6f6f-7a7a-8b8b-9c9c0d0d1e1e"
    }
  }
  ```
* **Response**:
  ```json
  {
    "id": "c1c1d2d2-e3e3-4f4f-5a5a-6b6b7c7c8d8d",
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "type": "TASK_ASSIGNED",
    "title": "Nueva Tarea Asignada",
    "body": "Se te ha asignado la tarea: Implementar JWT refresh token",
    "read": false,
    "metadata": {
      "taskId": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b",
      "boardId": "4d4d5e5e-6f6f-7a7a-8b8b-9c9c0d0d1e1e"
    },
    "createdAt": "2026-07-15T03:30:00.000Z"
  }
  ```
* **Caché (Redis)**:
  - Elimina el contador de no leídas del usuario: `notifications:unread:<userId>`.

---

## 2. Listar Notificaciones de un Usuario (`notification_find_all`)

* **MessagePattern (TCP)**: `{ cmd: 'notification_find_all' }`
* **Descripción**: Retorna todas las notificaciones de un usuario, pudiendo filtrar únicamente por las que no han sido leídas (`onlyUnread`).
* **Payload**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "onlyUnread": true
  }
  ```
* **Response**:
  ```json
  [
    {
      "id": "c1c1d2d2-e3e3-4f4f-5a5a-6b6b7c7c8d8d",
      "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
      "type": "TASK_ASSIGNED",
      "title": "Nueva Tarea Asignada",
      "body": "Se te ha asignado la tarea: Implementar JWT refresh token",
      "read": false,
      "metadata": {
        "taskId": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b"
      },
      "createdAt": "2026-07-15T03:30:00.000Z"
    }
  ]
  ```

---

## 3. Marcar una Notificación como Leída (`notification_mark_read`)

* **MessagePattern (TCP)**: `{ cmd: 'notification_mark_read' }`
* **Descripción**: Cambia el estado `read` de una notificación a `true` e invalida el caché del contador.
* **Payload**:
  ```json
  {
    "id": "c1c1d2d2-e3e3-4f4f-5a5a-6b6b7c7c8d8d"
  }
  ```
* **Response**: La notificación actualizada con `"read": true`.
* **Caché (Redis)**:
  - Elimina el contador de no leídas del usuario: `notifications:unread:<userId>`.

---

## 4. Marcar todas las Notificaciones como Leídas (`notification_mark_all_read`)

* **MessagePattern (TCP)**: `{ cmd: 'notification_mark_all_read' }`
* **Descripción**: Modifica el estado `read` de todas las notificaciones de un usuario a `true`.
* **Payload**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618"
  }
  ```
* **Response**:
  ```json
  {
    "count": 5
  }
  ```
* **Caché (Redis)**:
  - Elimina el contador de no leídas del usuario: `notifications:unread:<userId>`.

---

## 5. Eliminar Notificación (`notification_delete`)

* **MessagePattern (TCP)**: `{ cmd: 'notification_delete' }`
* **Descripción**: Elimina físicamente una notificación del sistema.
* **Payload**:
  ```json
  {
    "id": "c1c1d2d2-e3e3-4f4f-5a5a-6b6b7c7c8d8d"
  }
  ```
* **Response**:
  ```json
  {
    "success": true
  }
  ```
* **Caché (Redis)**:
  - Elimina el contador de no leídas del usuario: `notifications:unread:<userId>`.
