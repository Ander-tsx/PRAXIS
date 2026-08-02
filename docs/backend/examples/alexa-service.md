# Ejemplos de Endpoints — `alexa-service` (Puerto TCP: 3007)

Capa de datos de la skill de voz Praxis. Es un servicio **de solo lectura** para el negocio: no crea ni modifica proyectos ni tareas. Sus únicas escrituras son sobre sus propias tablas de vinculación (`alexa.voice_links`, `alexa.voice_seed_phrases`, `alexa.voice_query_logs`).

No tiene datos de negocio propios: lee por TCP de `projects-service`, `tasks-service` y `credentials-service`, y cachea el resultado en Redis para responder dentro del presupuesto de latencia de Alexa (~8 s de límite; aquí cada viaje TCP corta a los 3 s).

**Regla de oro:** los números (avance, velocidad, días) salen siempre de cálculo determinístico, nunca de un modelo de lenguaje.

---

## Convenciones configurables

`Task.status` es un `String` libre en `tasks-service`, así que la interpretación de los estados vive en este servicio y se controla por variables de entorno:

| Variable | Significado |
|---|---|
| `VOICE_COMPLETED_STATUSES` | Estados que cuentan como completada |
| `VOICE_IN_PROGRESS_STATUSES` | Estados que cuentan como en progreso |
| `VOICE_BLOCKED_STATUSES` | Estados que marcan bloqueo explícito |
| `VOICE_STALE_DAYS` | Días sin cambios tras los cuales una tarea abierta se considera estancada |
| `VOICE_FORECAST_WEEKS` | Semanas de historial usadas para calcular la velocidad |
| `VOICE_WEEK_MODE` | `calendar` (lunes a domingo) o `rolling` (ventana móvil de 7 días) |

La comparación es insensible a mayúsculas y a acentos: `"Completada"`, `"COMPLETADO"` y `"completado"` son el mismo estado.

Dos decisiones de cálculo que conviene tener presentes:

- **Las subtareas no cuentan** en avance, productividad, forecast ni carga de trabajo. Son ítems hijos y contarlas junto a sus padres inflaría el porcentaje.
- **No existe un campo `completedAt`**, así que `updatedAt` es la señal usada para saber cuándo se cerró una tarea.

---

## 1. Login por voz (`alexa_login`)

* **MessagePattern (TCP)**: `{ cmd: 'alexa_login' }`
* **Descripción**: Valida las credenciales delegando en `credentials-service` (bcrypt) y emite un *voice token* de larga duración con alcance de solo lectura. La skill ya no valida usuarios ni hashes por su cuenta.
* **Payload**:
  ```json
  {
    "email": "erick@praxis.dev",
    "password": "supersecreta",
    "alexaUserId": "amzn1.ask.account.AGZ...",
    "deviceId": "amzn1.ask.device.AF7..."
  }
  ```
* **Response**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "linkId": "1c2d3e4f-5a6b-7c8d-9e0f-1a2b3c4d5e6f",
    "voiceToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "scope": "voice:read",
    "expiresAt": "2026-10-28T18:00:00.000Z",
    "expiresIn": 7776000,
    "displayName": "Erick Torres"
  }
  ```
* **Llamada interna**: `credentials-service` → `{ cmd: 'auth_login' }`.
* **Seguridad**: rate limit por correo (`VOICE_REDEEM_MAX_ATTEMPTS` intentos por ventana). Emitir un token nuevo revoca el anterior del mismo `alexaUserId`.
* **Errores**: `401` credenciales inválidas · `429` demasiados intentos.

---

## 2. Generar frase semilla (`alexa_link_generate`)

* **MessagePattern (TCP)**: `{ cmd: 'alexa_link_generate' }`
* **Descripción**: La app web pide una frase corta y memorizable que el usuario dictará a Alexa. Evita dictar la contraseña en voz alta. Generar una frase invalida cualquier frase previa del usuario.
* **Payload**:
  ```json
  { "userId": "e81e9f45-0d29-45ff-81fb-992257d09618" }
  ```
* **Response**:
  ```json
  {
    "phrase": "cielo mesa puente pasto trueno",
    "words": ["cielo", "mesa", "puente", "pasto", "trueno"],
    "expiresAt": "2026-07-30T18:05:00.000Z",
    "expiresIn": 300
  }
  ```
* **Base de datos**: inserta en `alexa.voice_seed_phrases` solo el **hash** de la frase, nunca la frase en claro.

---

## 3. Canjear frase semilla (`alexa_link_redeem`)

* **MessagePattern (TCP)**: `{ cmd: 'alexa_link_redeem' }`
* **Descripción**: La skill envía lo que el usuario dictó. La frase se canoniza (sin acentos, sin signos, sin espacios dobles), se valida y se invalida de inmediato: es de un solo uso.
* **Payload**:
  ```json
  {
    "phrase": "Cielo, mesa, puente, pasto, trueno",
    "alexaUserId": "amzn1.ask.account.AGZ...",
    "deviceId": "amzn1.ask.device.AF7..."
  }
  ```
* **Response**: idéntica a `alexa_login`.
* **Seguridad**: rate limit por `alexaUserId`, expiración de 5 minutos y uso único.
* **Errores**: `401` frase no válida, expirada o ya utilizada · `429` demasiados intentos.

---

## 4. Verificar voice token (`alexa_verify_token`)

* **MessagePattern (TCP)**: `{ cmd: 'alexa_verify_token' }`
* **Descripción**: Lo invoca el `VoiceTokenGuard` del gateway en cada consulta. Verifica firma, vigencia, alcance y que la vinculación siga activa (permite revocación real desde la web).
* **Payload**:
  ```json
  { "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
  ```
* **Response**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "linkId": "1c2d3e4f-5a6b-7c8d-9e0f-1a2b3c4d5e6f",
    "scope": "voice:read"
  }
  ```
* **Caché (Redis)**: `alexa:token:<sha256(token)>` con TTL de 60 s. Se elimina al revocar.
* **Errores**: `401` token inválido, expirado o vinculación revocada · `403` el token no tiene alcance de voz.

---

## 5. Revocar y listar vinculaciones (`alexa_link_revoke`, `alexa_link_find_all`)

* **MessagePatterns**: `{ cmd: 'alexa_link_revoke' }` · `{ cmd: 'alexa_link_find_all' }`
* **Descripción**: Gestión desde la app web. Si se omite `linkId`, se revocan todas las vinculaciones activas del usuario (caso "perdí mi Echo").
* **Payload de revocación**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "linkId": "1c2d3e4f-5a6b-7c8d-9e0f-1a2b3c4d5e6f"
  }
  ```
* **Response**:
  ```json
  { "success": true, "revoked": 1 }
  ```

---

## 6. Listar proyectos (`alexa_projects_find_all`)

* **MessagePattern (TCP)**: `{ cmd: 'alexa_projects_find_all' }`
* **Descripción**: Proyectos donde el usuario es dueño o miembro. Lista plana y ligera: el matching difuso por nombre lo hace la skill, no el backend. `lastProjectId` permite sugerir el último proyecto usado al abrir la skill.
* **Payload**:
  ```json
  { "userId": "e81e9f45-0d29-45ff-81fb-992257d09618" }
  ```
* **Response**:
  ```json
  {
    "items": [
      {
        "id": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
        "name": "Proyecto Web",
        "description": "Portal público de Praxis",
        "isOwner": true,
        "isLastUsed": true
      }
    ],
    "total": 1,
    "lastProjectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a"
  }
  ```
* **Llamada interna**: `projects-service` → `{ cmd: 'project_find_by_member' }`.
* **Caché (Redis)**: `alexa:projects:user:<userId>` (60 s).

---

## 7. Avance del proyecto (`alexa_project_progress`)

* **MessagePattern (TCP)**: `{ cmd: 'alexa_project_progress' }`
* **Payload**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a"
  }
  ```
* **Response**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "projectName": "Proyecto Web",
    "totalTasks": 40,
    "completedTasks": 26,
    "pendingTasks": 14,
    "percentage": 65,
    "hasData": true
  }
  ```
* **Caso límite**: un proyecto sin tareas responde `percentage: 0` y `hasData: false`. Nunca hay división entre cero ni error.

---

## 8. Productividad semanal (`alexa_project_productivity_weekly`)

* **MessagePattern (TCP)**: `{ cmd: 'alexa_project_productivity_weekly' }`
* **Response**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "projectName": "Proyecto Web",
    "completedThisWeek": 12,
    "completedLastWeek": 8,
    "deltaPercent": 50,
    "trend": "up",
    "weekMode": "calendar",
    "currentWeekStart": "2026-07-27T00:00:00.000Z",
    "previousWeekStart": "2026-07-20T00:00:00.000Z"
  }
  ```
* **`trend`**: `up`, `down` o `stable`. Si la semana pasada fue 0 y esta no, `deltaPercent` es `100`; si ambas son 0, es `0` y la tendencia es estable.

---

## 9. Pronóstico de finalización (`alexa_project_forecast`)

* **MessagePattern (TCP)**: `{ cmd: 'alexa_project_forecast' }`
* **Cálculo**: velocidad = tareas completadas en las últimas `VOICE_FORECAST_WEEKS` semanas ÷ número de semanas. Días estimados = ⌈(tareas restantes ÷ velocidad) × 7⌉.
* **Response (con datos)**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "projectName": "Proyecto Web",
    "totalTasks": 40,
    "completedTasks": 26,
    "remainingTasks": 14,
    "velocityPerWeek": 3.5,
    "windowWeeks": 4,
    "estimatedDays": 28,
    "estimatedWeeks": 4,
    "estimatedDate": "2026-08-27T18:00:00.000Z",
    "reason": "OK"
  }
  ```
* **Response (sin datos suficientes)**: `estimatedDays: null`, `estimatedDate: null`, `reason: "INSUFFICIENT_DATA"`. Ocurre cuando la velocidad es 0: no hay forma honesta de estimar y la skill lo dice explícitamente.
* **Otros `reason`**: `COMPLETED` cuando no quedan tareas pendientes.

---

## 10. Tareas bloqueadas o estancadas (`alexa_project_blocked_tasks`)

* **MessagePattern (TCP)**: `{ cmd: 'alexa_project_blocked_tasks' }`
* **Definición**: una tarea abierta está bloqueada si su estado está en `VOICE_BLOCKED_STATUSES` (`reason: "BLOCKED_STATUS"`) **o** si lleva `VOICE_STALE_DAYS` días o más sin cambios (`reason: "STALLED"`).
* **Response**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "projectName": "Proyecto Web",
    "staleThresholdDays": 7,
    "total": 5,
    "items": [
      {
        "id": "a1a1b2b2-c3c3-4d4d-5e5e-6f6f7a7a8b8b",
        "title": "Integrar pasarela de pago",
        "status": "BLOCKED",
        "daysStalled": 12,
        "assigneeId": "b2b2c3c3-4d4d-5e5e-6f6f-7a7a8b8b9c9c",
        "assigneeName": "Carlos Ramírez",
        "priority": "HIGH",
        "reason": "BLOCKED_STATUS"
      }
    ]
  }
  ```
* La lista viene **ordenada de mayor a menor días sin cambios**, así que la skill puede leer las tres primeras y decir "y otras X más" con `total`.

---

## 11. Carga de trabajo del equipo (`alexa_project_workload`)

* **MessagePattern (TCP)**: `{ cmd: 'alexa_project_workload' }`
* **Response**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "projectName": "Proyecto Web",
    "total": 3,
    "unassignedCount": 2,
    "items": [
      {
        "memberId": "b2b2c3c3-4d4d-5e5e-6f6f-7a7a8b8b9c9c",
        "memberName": "Carlos Ramírez",
        "assignedCount": 14,
        "completedCount": 9,
        "inProgressCount": 3,
        "openCount": 5
      }
    ]
  }
  ```
* **Orden**: por `openCount` descendente (carga actual real), con desempate por `assignedCount`. `assignedCount` es el total histórico asignado; `openCount` es lo que la persona carga ahora.

---

## 12. Integrantes del proyecto (`alexa_project_members`)

* **MessagePattern (TCP)**: `{ cmd: 'alexa_project_members' }`
* **Descripción**: Devuelve los miembros con el **nombre ya resuelto** (`projects-service` solo guarda `userId`), porque la skill hace el matching difuso por nombre. El dueño aparece aunque no esté registrado como miembro.
* **Response**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "projectName": "Proyecto Web",
    "total": 4,
    "items": [
      {
        "id": "b2b2c3c3-4d4d-5e5e-6f6f-7a7a8b8b9c9c",
        "name": "Carlos Ramírez",
        "email": "carlos@praxis.dev",
        "roleName": "Dev",
        "isOwner": false
      }
    ]
  }
  ```
* **Llamadas internas**: `projects-service` → `{ cmd: 'member_find_all' }` y `credentials-service` → `{ cmd: 'user_find_by_ids' }`.
* **Caché (Redis)**: `alexa:members:project:<projectId>` (120 s), ya enriquecido.

---

## 13. Desempeño individual (`alexa_member_performance`)

* **MessagePattern (TCP)**: `{ cmd: 'alexa_member_performance' }`
* **Payload**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "memberId": "b2b2c3c3-4d4d-5e5e-6f6f-7a7a8b8b9c9c"
  }
  ```
* **Response**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "projectName": "Proyecto Web",
    "memberId": "b2b2c3c3-4d4d-5e5e-6f6f-7a7a8b8b9c9c",
    "memberName": "Carlos Ramírez",
    "roleName": "Dev",
    "assignedCount": 14,
    "completedCount": 9,
    "inProgressCount": 3,
    "blockedCount": 1,
    "openCount": 5,
    "completionRate": 64
  }
  ```
* **Errores**: `404` si el integrante no pertenece al proyecto.

---

## 14. Contexto persistente (`alexa_context_set_project`)

* **MessagePattern (TCP)**: `{ cmd: 'alexa_context_set_project' }`
* **Descripción**: Guarda el último proyecto seleccionado en la vinculación activa. Dentro de una misma sesión el contexto lo maneja Alexa con *session attributes*; esto es solo el respaldo **entre sesiones**.
* **Payload**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a"
  }
  ```
* **Response**:
  ```json
  { "success": true, "lastProjectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a" }
  ```

---

## Control de acceso

Todas las consultas de los puntos 6 a 14 verifican que el usuario sea **dueño o miembro** del proyecto antes de responder. El voice token es de solo lectura, así que no se consultan permisos granulares (`canCreateTask` y compañía): la membresía basta para leer.

El resultado de la verificación se cachea en `alexa:access:<userId>:<projectId>` (120 s). Si el usuario no tiene acceso, la respuesta es `403` y el intento queda registrado como advertencia en el log.

---

## Auditoría

Cada consulta se registra en `alexa.voice_query_logs` con usuario, proyecto, tipo de consulta y resultado. El registro es asíncrono y tolerante a fallos: si falla, la respuesta hablada no se ve afectada.

---

## Caché en Redis — resumen

| Clave | TTL | Contenido |
|---|---|---|
| `alexa:token:<hash>` | 60 s | Verificación de voice token |
| `alexa:projects:user:<userId>` | 60 s | Proyectos visibles del usuario |
| `alexa:project:<projectId>` | 120 s | Detalle de proyecto |
| `alexa:tasks:project:<projectId>` | 60 s | Tareas del proyecto (analítica) |
| `alexa:members:project:<projectId>` | 120 s | Miembros con nombre resuelto |
| `alexa:access:<userId>:<projectId>` | 120 s | Resultado de la verificación de acceso |
| `alexa:login:attempts:<hash>` | ventana | Contador de intentos de login |
| `alexa:redeem:attempts:<alexaUserId>` | ventana | Contador de canjes de frase |

---

## Patrones agregados a otros servicios

Este servicio requirió tres patrones nuevos, todos de lectura:

| Servicio | cmd | Payload | Motivo |
|---|---|---|---|
| `tasks-service` | `task_find_by_project` | `{ projectId }` | La analítica necesita todas las tareas del proyecto; `task_find_all` es por board y paginado |
| `projects-service` | `project_find_by_member` | `{ userId }` | `project_find_all` solo filtra por `ownerId`, no por membresía |
| `credentials-service` | `user_find_by_ids` | `{ ids: [] }` | Resolver nombres de varios miembros sin hacer N llamadas |
