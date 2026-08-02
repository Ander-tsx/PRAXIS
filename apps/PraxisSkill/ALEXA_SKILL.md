# Especificación Completa para la Alexa Skill — PRAXIS

Este documento contiene **toda la especificación técnica, arquitectura, endpoints HTTP, estructura de respuestas, modelo de interacción (Intents) y mejores prácticas** para construir la Skill de Alexa integrada con el backend de **PRAXIS**.

---

## 1. Arquitectura y Flujo de Comunicación

```
  ┌─────────────────┐       ┌──────────────────────┐       ┌───────────────────────┐
  │                 │       │  Alexa Skill Lambda  │       │  PRAXIS API Gateway   │
  │  Usuario / Echo ├──────►│  (ASK SDK v2 Node/TS)├──────►│  (HTTP REST Port 3000)│
  │                 │       │                      │       │  /api/alexa/...       │
  └─────────────────┘       └──────────┬───────────┘       └───────────┬───────────┘
                                       │                               │
                                       ▼                               ▼
                             ┌──────────────────┐            ┌──────────────────┐
                             │ DynamoDB / S3    │            │ alexa-service    │
                             │ (Session / Auth) │            │ (Microservicio)  │
                             └──────────────────┘            └──────────────────┘
```

1. **Alexa Skill Lambda**: Recibe comandos de voz del usuario a través del Amazon Alexa Voice Service.
2. **API Gateway (HTTP REST)**: Expone las rutas públicas y protegidas en `http://<HOST>:3000/api/alexa/`.
3. **alexa-service (Microservicio NestJS)**: Procesa las peticiones, realiza cálculos determinísticos (avance, pronóstico, productividad), consulta por TCP a `projects-service`, `tasks-service` y `credentials-service`, y usa Redis para caché de baja latencia.
4. **Voice Token (JWT de Voz)**: Token de solo lectura emitido al vincular la cuenta. Permite a la skill realizar consultas en nombre del usuario sin almacenar la contraseña en claro.

---

## 2. Formato Global de Respuesta del API Gateway

Todas las respuestas del API Gateway de PRAXIS están envueltas en un **Standard Envelope JSON**:

### Respuesta Exitosa (`HTTP 200 / 201`)
```json
{
  "success": true,
  "data": {
    /* Payload específico del endpoint */
  },
  "meta": {}
}
```

### Respuesta de Error (`HTTP 400 / 401 / 403 / 404 / 429 / 500`)
```json
{
  "statusCode": 401,
  "message": "Invalid or revoked voice token",
  "error": "Unauthorized"
}
```

> ⚠️ **Importante**: La Skill de Alexa debe extraer la propiedad `data` del JSON recibido cuando `success` es `true`.

---

## 3. Autenticación y Vinculación de Cuenta (Account Linking)

Para que el usuario pueda usar la Skill, debe vincular su usuario de PRAXIS con su dispositivo o cuenta de Alexa. Existen dos métodos soportados:

### Método A: Canje por Frase Semilla (*Seed Phrase*) — **Recomendado para Voz**

1. En la **App Web de Praxis**, el usuario autenticado genera una frase semilla corta (ej. *"cielo mesa puente pasto trueno"*).
2. El usuario dice a Alexa: *"Alexa, abre Praxis y vincula mi cuenta con la frase cielo mesa puente pasto trueno"*.
3. La Skill de Alexa ejecuta `POST /api/alexa/link/redeem` pasando la frase dictada.
4. El backend retorna el `voiceToken`.
5. La Skill guarda el `voiceToken` en sus **Persistent Attributes** (DynamoDB) ligado al `alexaUserId`.

### Método B: Login Directo por Voz

1. El usuario dice sus credenciales a Alexa.
2. La Skill ejecuta `POST /api/alexa/login` con `{ email, password, alexaUserId, deviceId }`.
3. El backend retorna el `voiceToken`.

---

## 4. Referencia Exhaustiva de Endpoints HTTP

Base URL por defecto: `http://localhost:3000/api/alexa` (o la URL pública en producción).

### Summary de Autenticación y Vinculación

| Método | Ruta | Header Requerido | Descripción |
|---|---|---|---|
| `POST` | `/api/alexa/login` | Ninguno | Autenticación con email/contraseña. Retorna `voiceToken`. |
| `POST` | `/api/alexa/link` | `Authorization: Bearer <JWT_WEB>` | Genera frase semilla desde la App Web (expira en 5 min). |
| `POST` | `/api/alexa/link/redeem` | Ninguno | Canjea frase semilla dictada por un `voiceToken`. |
| `GET` | `/api/alexa/links` | `Authorization: Bearer <JWT_WEB>` | Lista las vinculaciones del usuario desde la App Web. |
| `DELETE` | `/api/alexa/links/:linkId` | `Authorization: Bearer <JWT_WEB>` | Revoca una vinculación de voz específica. |
| `DELETE` | `/api/alexa/links` | `Authorization: Bearer <JWT_WEB>` | Revoca todas las vinculaciones de voz del usuario. |

---

### Summary de Consultas de Datos (Voz)

> 🔐 **Todos los endpoints de consulta de datos requieren el encabezado**:  
> `Authorization: Bearer <voiceToken>`

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/alexa/projects` | Obtiene la lista de proyectos donde el usuario es dueño o miembro. |
| `POST` | `/api/alexa/projects/:projectId/select` | Guarda el proyecto activo/último usado entre sesiones. |
| `GET` | `/api/alexa/projects/:projectId/progress` | Métricas de avance (% completado, total, completadas, pendientes). |
| `GET` | `/api/alexa/projects/:projectId/productivity/weekly` | Comparativa de productividad entre esta semana y la anterior. |
| `GET` | `/api/alexa/projects/:projectId/forecast` | Estimación de fecha de finalización según velocidad reciente. |
| `GET` | `/api/alexa/projects/:projectId/blocked-tasks` | Tareas bloqueadas o estancadas (stale). |
| `GET` | `/api/alexa/projects/:projectId/workload` | Distribución de carga de trabajo entre integrantes del equipo. |
| `GET` | `/api/alexa/projects/:projectId/members` | Lista de integrantes del proyecto con nombres resueltos. |
| `GET` | `/api/alexa/projects/:projectId/members/:memberId/performance` | Métricas de desempeño individual de un integrante. |

---

### Detalle de Payloads y Respuestas

#### 1. Canjear Frase Semilla (`POST /api/alexa/link/redeem`)
- **Body**:
  ```json
  {
    "phrase": "cielo mesa puente pasto trueno",
    "alexaUserId": "amzn1.ask.account.AGZ...",
    "deviceId": "amzn1.ask.device.AF7..."
  }
  ```
- **Response (`data`)**:
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

---

#### 2. Listar Proyectos (`GET /api/alexa/projects`)
- **Headers**: `Authorization: Bearer <voiceToken>`
- **Response (`data`)**:
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

---

#### 3. Seleccionar Proyecto Activo (`POST /api/alexa/projects/:projectId/select`)
- **Headers**: `Authorization: Bearer <voiceToken>`
- **Response (`data`)**:
  ```json
  {
    "success": true,
    "lastProjectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a"
  }
  ```

---

#### 4. Avance del Proyecto (`GET /api/alexa/projects/:projectId/progress`)
- **Headers**: `Authorization: Bearer <voiceToken>`
- **Response (`data`)**:
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

---

#### 5. Productividad Semanal (`GET /api/alexa/projects/:projectId/productivity/weekly`)
- **Headers**: `Authorization: Bearer <voiceToken>`
- **Response (`data`)**:
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
  - `trend`: `"up"`, `"down"` o `"stable"`.

---

#### 6. Pronóstico de Finalización (`GET /api/alexa/projects/:projectId/forecast`)
- **Headers**: `Authorization: Bearer <voiceToken>`
- **Response con datos (`data`)**:
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
- **Response sin suficientes datos (`data`)**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "projectName": "Proyecto Web",
    "estimatedDays": null,
    "estimatedDate": null,
    "reason": "INSUFFICIENT_DATA"
  }
  ```

---

#### 7. Tareas Bloqueadas o Estancadas (`GET /api/alexa/projects/:projectId/blocked-tasks`)
- **Headers**: `Authorization: Bearer <voiceToken>`
- **Response (`data`)**:
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

---

#### 8. Carga de Trabajo del Equipo (`GET /api/alexa/projects/:projectId/workload`)
- **Headers**: `Authorization: Bearer <voiceToken>`
- **Response (`data`)**:
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

---

#### 9. Integrantes del Proyecto (`GET /api/alexa/projects/:projectId/members`)
- **Headers**: `Authorization: Bearer <voiceToken>`
- **Response (`data`)**:
  ```json
  {
    "projectId": "7f7f8a9a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
    "projectName": "Proyecto Web",
    "total": 2,
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

---

#### 10. Desempeño Individual de Integrante (`GET /api/alexa/projects/:projectId/members/:memberId/performance`)
- **Headers**: `Authorization: Bearer <voiceToken>`
- **Response (`data`)**:
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

---

## 5. Modelo de Interacción de Alexa (Interaction Model JSON)

A continuación se presenta la plantilla para el esquema del modelo de interacción (es-MX / es-ES) para la Skill en Alexa Developer Console:

```json
{
  "interactionModel": {
    "languageModel": {
      "invocationName": "praxis",
      "intents": [
        {
          "name": "AMAZON.CancelIntent",
          "samples": []
        },
        {
          "name": "AMAZON.HelpIntent",
          "samples": []
        },
        {
          "name": "AMAZON.StopIntent",
          "samples": []
        },
        {
          "name": "AMAZON.NavigateHomeIntent",
          "samples": []
        },
        {
          "name": "LinkAccountIntent",
          "slots": [
            {
              "name": "SeedPhrase",
              "type": "AMAZON.SearchQuery"
            }
          ],
          "samples": [
            "vincula mi cuenta con la frase {SeedPhrase}",
            "vincular cuenta {SeedPhrase}",
            "mi frase de vinculación es {SeedPhrase}",
            "conectar cuenta {SeedPhrase}"
          ]
        },
        {
          "name": "SelectProjectIntent",
          "slots": [
            {
              "name": "ProjectName",
              "type": "AMAZON.SearchQuery"
            }
          ],
          "samples": [
            "selecciona el proyecto {ProjectName}",
            "abrir proyecto {ProjectName}",
            "cambiar al proyecto {ProjectName}",
            "usar el proyecto {ProjectName}",
            "seleccionar {ProjectName}"
          ]
        },
        {
          "name": "ListProjectsIntent",
          "slots": [],
          "samples": [
            "cuáles son mis proyectos",
            "lista mis proyectos",
            "qué proyectos tengo",
            "dime mis proyectos"
          ]
        },
        {
          "name": "GetProjectProgressIntent",
          "slots": [],
          "samples": [
            "cuál es el avance del proyecto",
            "cómo va el proyecto",
            "cuántas tareas llevamos completadas",
            "dime el porcentaje de avance",
            "resumen del proyecto"
          ]
        },
        {
          "name": "GetWeeklyProductivityIntent",
          "slots": [],
          "samples": [
            "cuál es la productividad de esta semana",
            "cómo estuvo la productividad esta semana",
            "cuántas tareas completamos esta semana",
            "desempeño semanal"
          ]
        },
        {
          "name": "GetProjectForecastIntent",
          "slots": [],
          "samples": [
            "cuándo vamos a terminar el proyecto",
            "cuál es el pronóstico de finalización",
            "cuántos días faltan para terminar",
            "cuándo se entrega el proyecto"
          ]
        },
        {
          "name": "GetBlockedTasksIntent",
          "slots": [],
          "samples": [
            "hay tareas bloqueadas",
            "cuáles son las tareas bloqueadas",
            "qué tareas están estancadas",
            "tareas atascadas"
          ]
        },
        {
          "name": "GetTeamWorkloadIntent",
          "slots": [],
          "samples": [
            "cómo está la carga de trabajo del equipo",
            "quién tiene más tareas",
            "distribución de trabajo del equipo",
            "carga del equipo"
          ]
        },
        {
          "name": "GetMemberPerformanceIntent",
          "slots": [
            {
              "name": "MemberName",
              "type": "AMAZON.SearchQuery"
            }
          ],
          "samples": [
            "cómo va el desempeño de {MemberName}",
            "cuántas tareas tiene {MemberName}",
            "resumen de {MemberName}",
            "cómo va {MemberName}"
          ]
        }
      ]
    }
  }
}
```

---

## 6. Estructura Sugerida del Código de la Skill (ASK SDK v2)

Recomendamos organizar la Lambda de Alexa en Node.js / TypeScript con la siguiente estructura limpia:

```
alexa-skill-praxis/
├── lambda/
│   └── custom/
│       ├── handlers/
│       │   ├── LaunchRequestHandler.ts
│       │   ├── LinkAccountIntentHandler.ts
│       │   ├── SelectProjectIntentHandler.ts
│       │   ├── ProgressIntentHandler.ts
│       │   ├── ProductivityIntentHandler.ts
│       │   ├── ForecastIntentHandler.ts
│       │   ├── BlockedTasksIntentHandler.ts
│       │   ├── WorkloadIntentHandler.ts
│       │   ├── MemberPerformanceIntentHandler.ts
│       │   ├── HelpIntentHandler.ts
│       │   ├── CancelAndStopIntentHandler.ts
│       │   ├── SessionEndedRequestHandler.ts
│       │   └── ErrorHandler.ts
│       ├── interceptors/
│       │   ├── AuthInterceptor.ts       // Carga el voiceToken de DynamoDB
│       │   └── ContextInterceptor.ts    // Carga el projectId activo
│       ├── services/
│       │   ├── praxis-api.service.ts   // Cliente Axios / Fetch al Backend Gateway
│       │   └── string-matcher.service.ts // Matching difuso para nombres de proyectos y miembros
│       ├── index.ts
│       └── package.json
├── models/
│   └── es-MX.json
└── ask-states.json
```

---

## 7. Ejemplo de Código Handler & Servicio API (TypeScript)

### Servicio para la API REST de Praxis (`praxis-api.service.ts`)

```typescript
import axios from 'axios';

const BASE_URL = process.env.PRAXIS_API_URL || 'https://api.praxis.dev/api/alexa';

export class PraxisApiService {
  private voiceToken: string;

  constructor(voiceToken: string) {
    this.voiceToken = voiceToken;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.voiceToken}`,
      'Content-Type': 'application/json',
    };
  }

  static async redeemSeedPhrase(phrase: string, alexaUserId: string, deviceId?: string) {
    const res = await axios.post(`${BASE_URL}/link/redeem`, {
      phrase,
      alexaUserId,
      deviceId,
    });
    return res.data.data; // Extrae del envelope de Praxis
  }

  async getProjects() {
    const res = await axios.get(`${BASE_URL}/projects`, { headers: this.headers });
    return res.data.data;
  }

  async selectProject(projectId: string) {
    const res = await axios.post(`${BASE_URL}/projects/${projectId}/select`, {}, { headers: this.headers });
    return res.data.data;
  }

  async getProjectProgress(projectId: string) {
    const res = await axios.get(`${BASE_URL}/projects/${projectId}/progress`, { headers: this.headers });
    return res.data.data;
  }

  async getWeeklyProductivity(projectId: string) {
    const res = await axios.get(`${BASE_URL}/projects/${projectId}/productivity/weekly`, { headers: this.headers });
    return res.data.data;
  }

  async getForecast(projectId: string) {
    const res = await axios.get(`${BASE_URL}/projects/${projectId}/forecast`, { headers: this.headers });
    return res.data.data;
  }

  async getBlockedTasks(projectId: string) {
    const res = await axios.get(`${BASE_URL}/projects/${projectId}/blocked-tasks`, { headers: this.headers });
    return res.data.data;
  }

  async getWorkload(projectId: string) {
    const res = await axios.get(`${BASE_URL}/projects/${projectId}/workload`, { headers: this.headers });
    return res.data.data;
  }

  async getMembers(projectId: string) {
    const res = await axios.get(`${BASE_URL}/projects/${projectId}/members`, { headers: this.headers });
    return res.data.data;
  }

  async getMemberPerformance(projectId: string, memberId: string) {
    const res = await axios.get(`${BASE_URL}/projects/${projectId}/members/${memberId}/performance`, { headers: this.headers });
    return res.data.data;
  }
}
```

### Ejemplo de Handler para Avance del Proyecto (`ProgressIntentHandler.ts`)

```typescript
import { HandlerInput, RequestHandler } from 'ask-sdk-core';
import { Response } from 'ask-sdk-model';
import { PraxisApiService } from '../services/praxis-api.service';

export const ProgressIntentHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'GetProjectProgressIntent'
    );
  },
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();

    const voiceToken = persistentAttributes.voiceToken;
    if (!voiceToken) {
      return handlerInput.responseBuilder
        .speak('Aún no has vinculado tu cuenta de Praxis. Genera una frase semilla en la aplicación web y dime: vincular cuenta seguido de tu frase.')
        .getResponse();
    }

    const projectId = sessionAttributes.activeProjectId || persistentAttributes.lastProjectId;
    if (!projectId) {
      return handlerInput.responseBuilder
        .speak('No tienes ningún proyecto seleccionado. Di por ejemplo: selecciona el proyecto Web.')
        .getResponse();
    }

    try {
      const api = new PraxisApiService(voiceToken);
      const progress = await api.getProjectProgress(projectId);

      if (!progress.hasData) {
        return handlerInput.responseBuilder
          .speak(`El proyecto ${progress.projectName} aún no tiene tareas registradas.`)
          .getResponse();
      }

      const speakOutput = `El proyecto ${progress.projectName} lleva un avance del ${progress.percentage} por ciento. Se han completado ${progress.completedTasks} de ${progress.totalTasks} tareas, y quedan ${progress.pendingTasks} pendientes.`;

      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt('¿Deseas consultar algo más de este proyecto?')
        .getResponse();
    } catch (error: any) {
      if (error.response?.status === 401) {
        return handlerInput.responseBuilder
          .speak('Tu vinculación de voz ha expirado o fue revocada. Por favor vuelve a vincular tu cuenta desde la app web.')
          .getResponse();
      }
      return handlerInput.responseBuilder
        .speak('Hubo un error al consultar el avance del proyecto. Inténtalo de nuevo en unos momentos.')
        .getResponse();
    }
  },
};
```

---

## 8. Recomendaciones de Experiencia de Usuario (UX de Voz)

1. **Matching Difuso para Proyectos y Nombres de Integrantes**:
   - En Alexa, el usuario puede decir *"Carlos"* o *"Carlos Ramírez"*, o *"Proyecto Web"* en lugar del nombre exacto. Utilice librerías de matching difuso (como `fuse.js` o `string-similarity`) sobre las listas retornadas por `GET /api/alexa/projects` y `GET /api/alexa/projects/:projectId/members`.
2. **Contexto de Sesión Reposado**:
   - Mantenga el `activeProjectId` en los `sessionAttributes`. Si el usuario no especifica un proyecto en sus intenciones, utilice el `activeProjectId`. Si no hay uno en sesión, consulte `GET /api/alexa/projects` para tomar `lastProjectId`.
3. **Resumen de Listas Largas**:
   - Para las tareas bloqueadas (`GET /api/alexa/projects/:projectId/blocked-tasks`), mencione solo las 2 o 3 tareas principales con mayor número de días estancadas (`daysStalled`) y agregue: *"y X tareas más."*
4. **Respuesta Clara ante falta de Datos**:
   - Cuando el pronóstico devuelva `estimatedDays: null` y `reason: "INSUFFICIENT_DATA"`, informe amablemente: *"No hay suficientes tareas completadas recientemente para calcular una fecha estimada con precisión."*
