# Arquitectura de microservicios — Praxis

Guía de referencia para construir cada microservicio del sistema.
Cubre responsabilidades, modelos de datos, stack técnico y estructura interna.
El gateway no se documenta aquí.

---

## Stack base de cada servicio

Todos los servicios comparten el mismo stack:

| Herramienta | Uso |
|---|---|
| NestJS | Framework base |
| Prisma + `@prisma/adapter-pg` | Acceso a base de datos |
| Redis (ioredis) | Caché y sesiones |
| `nestjs-pino` | Logging estructurado |
| `@nestjs/config` + Joi | Variables de entorno validadas |
| TCP (NestJS microservices) | Comunicación entre servicios |

---

## Módulos compartidos en cada servicio

Cada servicio implementa estos tres módulos internamente.
Cuando `commons/observability` esté listo, el `ObservabilityModule` vendrá de `@praxis/observability`.

### PrismaModule

```typescript
// src/prisma/prisma.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
    });
    super({ adapter });
  }

  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}

// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### RedisModule

```typescript
// src/redis/redis.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  onModuleInit() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    this.client.on('error', (err) => console.warn('Redis error:', err.message));
  }

  onModuleDestroy() { this.client?.quit(); }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds = 30): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}

// src/redis/redis.module.ts
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

### ObservabilityModule

```typescript
// src/observability/observability.module.ts
import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

@Global()
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        redact: {
          paths: ['req.headers.authorization', 'password'],
          remove: true,
        },
      },
    }),
  ],
  exports: [LoggerModule],
})
export class ObservabilityModule {}
```

---

## Variables de entorno comunes

Todas las variables que aparecen en cada servicio deben agregarse al schema de Joi del módulo raíz:

```typescript
Joi.object({
  DATABASE_URL: Joi.string().required(),
  REDIS_URL:    Joi.string().default('redis://localhost:6379'),
  TCP_PORT:     Joi.number().required(),
  LOG_LEVEL:    Joi.string()
                  .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
                  .default('info'),
  NODE_ENV:     Joi.string()
                  .valid('development', 'production', 'test')
                  .default('development'),
})
```

---

## Estructura interna base de cada servicio

```
services/<nombre>/
├── prisma/
│   └── schema.prisma          ← modelos de este servicio
├── src/
│   ├── main.ts                ← bootstrap TCP
│   ├── app.module.ts          ← módulo raíz
│   ├── prisma/
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   ├── redis/
│   │   ├── redis.service.ts
│   │   └── redis.module.ts
│   ├── observability/
│   │   └── observability.module.ts
│   └── <dominio>/
│       ├── <dominio>.module.ts
│       ├── <dominio>.controller.ts
│       └── <dominio>.service.ts
├── .env
├── .env.example
├── package.json               ← name: "@praxis/<nombre>-service"
└── tsconfig.json
```

---

---

# Servicios

---

## 1. `credentials-service` — Puerto TCP: 3001

### Responsabilidad

Gestiona todo lo relacionado con identidad: credenciales de acceso, datos de perfil del usuario y sesiones. Es el único servicio que sabe quién es una persona dentro del sistema.

No depende de ningún otro servicio.

### Modelos Prisma

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Credential {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  user         User?
  createdAt    DateTime @default(now())

  @@map("credentials")
}

model User {
  id           String     @id @default(uuid())
  credentialId String     @unique
  credential   Credential @relation(fields: [credentialId], references: [id])
  firstName    String
  lastName     String
  avatarUrl    String?
  status       UserStatus @default(ACTIVE)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  @@map("users")
}

enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}
```

### MessagePatterns

| cmd | DTO entrada | Respuesta | Descripción |
|---|---|---|---|
| `auth_register` | `RegisterDto` | `{ userId, accessToken }` | Crea credencial + perfil |
| `auth_login` | `LoginDto` | `{ userId, accessToken }` | Verifica credencial, emite JWT |
| `auth_verify_token` | `{ token: string }` | `JwtPayloadDto` | Verifica JWT (usa caché Redis) |
| `auth_refresh` | `{ refreshToken: string }` | `{ accessToken }` | Renueva el access token |
| `auth_logout` | `{ userId: string }` | `{ success: true }` | Revoca sesión en Redis |
| `user_find_all` | `FindUsersDto` | `{ items, total }` | Lista paginada de usuarios |
| `user_find_one` | `FindOneUserDto` | `User` | Perfil de un usuario |
| `user_update` | `UpdateUserDto` | `User` | Actualiza perfil |
| `user_delete` | `DeleteUserDto` | `{ success, id }` | Elimina usuario y credencial |

### Uso de Redis

```typescript
// Caché de token verificado — evita re-verificar el JWT en cada petición
const cacheKey = `auth:token:${tokenHash}`;

// Sesión activa — permite logout real
const sessionKey = `auth:session:${userId}`;

// Caché de perfil — para no ir a DB en cada consulta de usuario
const userKey = `user:${userId}`;
```

### Variables de entorno

```env
DATABASE_URL=postgresql://praxis:praxis123@localhost:5432/praxis?schema=credentials
REDIS_URL=redis://localhost:6379
TCP_PORT=3001
JWT_SECRET=
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
LOG_LEVEL=info
NODE_ENV=development
```

---

## 2. `roles-service` — Puerto TCP: 3002

### Responsabilidad

Gestiona los roles globales del sistema (Admin, User) y su asignación a usuarios. Un Admin tiene acceso de administración sobre toda la plataforma — equivale a RRHH que puede crear, suspender o eliminar usuarios y gestionar la organización. Un User es cualquier miembro normal.

No gestiona roles dentro de proyectos — eso es responsabilidad de `projects-service`.

### Modelos Prisma

```prisma
model Role {
  id          String       @id @default(uuid())
  name        String       @unique
  description String?
  userRoles   UserRole[]
  createdAt   DateTime     @default(now())

  @@map("roles")
}

model UserRole {
  id        String   @id @default(uuid())
  userId    String
  role      Role     @relation(fields: [roleId], references: [id])
  roleId    String
  createdAt DateTime @default(now())

  @@unique([userId, roleId])
  @@map("user_roles")
}
```

### MessagePatterns

| cmd | DTO entrada | Respuesta | Descripción |
|---|---|---|---|
| `role_find_all` | — | `Role[]` | Lista todos los roles globales |
| `role_assign` | `AssignRoleDto` | `UserRole` | Asigna rol a usuario |
| `role_revoke` | `RevokeRoleDto` | `{ success }` | Quita rol a usuario |
| `role_get_user_roles` | `{ userId: string }` | `Role[]` | Roles de un usuario |
| `role_check` | `CheckRoleDto` | `{ hasRole: boolean }` | Verifica si usuario tiene un rol |

### Uso de Redis

```typescript
// Caché de roles de un usuario — el gateway lo consulta frecuentemente
const rolesCacheKey = `roles:user:${userId}`;
// TTL corto para que los cambios de rol se reflejen pronto
await redis.set(rolesCacheKey, roles, 60);
```

### Variables de entorno

```env
DATABASE_URL=postgresql://praxis:praxis123@localhost:5432/praxis?schema=roles
REDIS_URL=redis://localhost:6379
TCP_PORT=3002
LOG_LEVEL=info
NODE_ENV=development
```

---

## 3. `projects-service` — Puerto TCP: 3003

### Responsabilidad

Gestiona proyectos, espacios de trabajo (workspaces), tableros (boards), columnas de tablero, membresías de proyecto y roles locales dinámicos. Un proyecto pertenece a la organización. Dentro de un proyecto hay workspaces por área (Backend, Frontend, QA). Cada workspace tiene uno o más boards tipo kanban con columnas configurables.

Los roles locales son dinámicos: el administrador del proyecto puede crear roles, definir sus permisos y asignarlos a miembros. Este servicio es la fuente de verdad para saber si un usuario puede hacer algo dentro de un proyecto específico.

### Modelos Prisma

```prisma
model Project {
  id          String      @id @default(uuid())
  name        String
  description String?
  ownerId     String
  workspaces  Workspace[]
  members     ProjectMember[]
  roles       ProjectRole[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@map("projects")
}

model Workspace {
  id        String   @id @default(uuid())
  name      String
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  boards    Board[]
  createdAt DateTime @default(now())

  @@map("workspaces")
}

model Board {
  id          String        @id @default(uuid())
  name        String
  workspaceId String
  workspace   Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  columns     BoardColumn[]
  createdAt   DateTime      @default(now())

  @@map("boards")
}

model BoardColumn {
  id       String @id @default(uuid())
  name     String
  order    Int
  boardId  String
  board    Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)

  @@map("board_columns")
}

model ProjectRole {
  id          String          @id @default(uuid())
  name        String
  projectId   String
  project     Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  permissions Json
  members     ProjectMember[]

  @@unique([projectId, name])
  @@map("project_roles")
}

// Permisos en el campo JSON:
// {
//   "canCreateBoard": true,
//   "canEditBoard": false,
//   "canDeleteBoard": false,
//   "canCreateColumn": true,
//   "canEditColumn": true,
//   "canDeleteColumn": false,
//   "canCreateTask": true,
//   "canEditTask": true,
//   "canDeleteTask": false,
//   "canManageMembers": false,
//   "canManageRoles": false
// }

model ProjectMember {
  id            String      @id @default(uuid())
  projectId     String
  project       Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId        String
  projectRole   ProjectRole @relation(fields: [projectRoleId], references: [id])
  projectRoleId String
  joinedAt      DateTime    @default(now())

  @@unique([projectId, userId])
  @@map("project_members")
}
```

### MessagePatterns

| cmd | DTO entrada | Respuesta | Descripción |
|---|---|---|---|
| `project_create` | `CreateProjectDto` | `Project` | Crea proyecto |
| `project_find_all` | `FindProjectsDto` | `{ items, total }` | Proyectos del usuario |
| `project_find_one` | `FindOneProjectDto` | `Project` | Detalle de proyecto |
| `project_update` | `UpdateProjectDto` | `Project` | Actualiza proyecto |
| `project_delete` | `DeleteProjectDto` | `{ success }` | Elimina proyecto |
| `workspace_create` | `CreateWorkspaceDto` | `Workspace` | Crea workspace |
| `workspace_find_all` | `{ projectId }` | `Workspace[]` | Workspaces de un proyecto |
| `workspace_update` | `UpdateWorkspaceDto` | `Workspace` | Actualiza workspace |
| `workspace_delete` | `DeleteWorkspaceDto` | `{ success }` | Elimina workspace |
| `board_create` | `CreateBoardDto` | `Board` | Crea board en workspace |
| `board_find_all` | `{ workspaceId }` | `Board[]` | Boards de un workspace |
| `board_update` | `UpdateBoardDto` | `Board` | Actualiza board |
| `board_delete` | `DeleteBoardDto` | `{ success }` | Elimina board |
| `column_create` | `CreateColumnDto` | `BoardColumn` | Agrega columna a board |
| `column_reorder` | `ReorderColumnsDto` | `BoardColumn[]` | Reordena columnas |
| `column_delete` | `DeleteColumnDto` | `{ success }` | Elimina columna |
| `member_add` | `AddMemberDto` | `ProjectMember` | Agrega miembro |
| `member_remove` | `RemoveMemberDto` | `{ success }` | Quita miembro |
| `member_find_all` | `{ projectId }` | `ProjectMember[]` | Miembros del proyecto |
| `project_role_create` | `CreateProjectRoleDto` | `ProjectRole` | Crea rol local |
| `project_role_update` | `UpdateProjectRoleDto` | `ProjectRole` | Edita permisos del rol |
| `project_role_delete` | `DeleteProjectRoleDto` | `{ success }` | Elimina rol local |
| `project_check_permission` | `CheckPermissionDto` | `{ allowed: boolean }` | Verifica permiso de usuario |

### Uso de Redis

```typescript
// Caché de membresía y permisos — tasks-service lo consulta por cada operación
const permissionKey = `project:${projectId}:user:${userId}:permissions`;
// TTL de 5 minutos — balance entre frescura y rendimiento
await redis.set(permissionKey, permissions, 300);

// Invalidar caché cuando cambian roles o membresías
await redis.del(permissionKey);
```

### Variables de entorno

```env
DATABASE_URL=postgresql://praxis:praxis123@localhost:5432/praxis?schema=projects
REDIS_URL=redis://localhost:6379
TCP_PORT=3003
LOG_LEVEL=info
NODE_ENV=development
```

---

## 4. `tasks-service` — Puerto TCP: 3004

### Responsabilidad

Gestiona tareas, subtareas y checklists dentro de los boards. Antes de ejecutar cualquier operación de escritura, verifica con `projects-service` que el usuario tenga el permiso correspondiente. No almacena información de proyectos ni usuarios — solo trabaja con IDs de referencia.

### Modelos Prisma

```prisma
model Task {
  id           String      @id @default(uuid())
  title        String
  description  String?
  status       String
  boardId      String
  columnId     String
  assigneeId   String?
  reporterId   String
  parentTaskId String?
  parent       Task?       @relation("Subtasks", fields: [parentTaskId], references: [id])
  subtasks     Task[]      @relation("Subtasks")
  checklists   Checklist[]
  dueDate      DateTime?
  priority     Priority    @default(MEDIUM)
  order        Int         @default(0)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  @@map("tasks")
}

model Checklist {
  id        String   @id @default(uuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  text      String
  completed Boolean  @default(false)
  order     Int      @default(0)

  @@map("checklists")
}

enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT
}
```

### MessagePatterns

| cmd | DTO entrada | Respuesta | Descripción |
|---|---|---|---|
| `task_create` | `CreateTaskDto` | `Task` | Crea tarea |
| `task_find_all` | `FindTasksDto` | `{ items, total }` | Tareas de un board/columna |
| `task_find_one` | `FindOneTaskDto` | `Task` | Detalle de tarea |
| `task_update` | `UpdateTaskDto` | `Task` | Actualiza tarea |
| `task_move` | `MoveTaskDto` | `Task` | Cambia columna/orden |
| `task_delete` | `DeleteTaskDto` | `{ success }` | Elimina tarea |
| `task_assign` | `AssignTaskDto` | `Task` | Asigna encargado |
| `subtask_create` | `CreateTaskDto` | `Task` | Crea subtarea |
| `checklist_create` | `CreateChecklistDto` | `Checklist` | Agrega ítem al checklist |
| `checklist_toggle` | `ToggleChecklistDto` | `Checklist` | Marca ítem como completado |
| `checklist_delete` | `DeleteChecklistDto` | `{ success }` | Elimina ítem |

### Verificación de permisos

Antes de cualquier operación de escritura, `tasks-service` consulta a `projects-service`:

```typescript
// En task.service.ts
async createTask(dto: CreateTaskDto) {
  const { allowed } = await firstValueFrom(
    this.projectsClient.send(
      { cmd: 'project_check_permission' },
      { userId: dto.requesterId, projectId: dto.projectId, permission: 'canCreateTask' }
    )
  );

  if (!allowed) throw new RpcException('Forbidden');

  return this.prisma.task.create({ data: { ... } });
}
```

### Uso de Redis

```typescript
// Caché de tareas de un board — se invalida al crear/mover/eliminar
const boardTasksKey = `tasks:board:${boardId}`;

// Caché de detalle de tarea individual
const taskKey = `task:${taskId}`;
```

### Variables de entorno

```env
DATABASE_URL=postgresql://praxis:praxis123@localhost:5432/praxis?schema=tasks
REDIS_URL=redis://localhost:6379
TCP_PORT=3004
PROJECTS_SERVICE_HOST=localhost
PROJECTS_SERVICE_PORT=3003
LOG_LEVEL=info
NODE_ENV=development
```

---

## 5. `notifications-service` — Puerto TCP: 3005

### Responsabilidad

Gestiona notificaciones internas del sistema. Recibe eventos de los demás servicios (tarea asignada, miembro agregado, tarea vencida) y los persiste como notificaciones para el usuario destinatario. No genera lógica de negocio propia — solo almacena y sirve notificaciones.

### Modelos Prisma

```prisma
model Notification {
  id        String             @id @default(uuid())
  userId    String
  type      NotificationType
  title     String
  body      String
  read      Boolean            @default(false)
  metadata  Json?
  createdAt DateTime           @default(now())

  @@map("notifications")
}

enum NotificationType {
  TASK_ASSIGNED
  TASK_DUE_SOON
  TASK_COMPLETED
  MEMBER_ADDED
  MEMBER_REMOVED
  ROLE_CHANGED
}
```

### MessagePatterns

| cmd | DTO entrada | Respuesta | Descripción |
|---|---|---|---|
| `notification_create` | `CreateNotificationDto` | `Notification` | Crea notificación |
| `notification_find_all` | `{ userId, onlyUnread? }` | `Notification[]` | Notificaciones del usuario |
| `notification_mark_read` | `{ id: string }` | `Notification` | Marca como leída |
| `notification_mark_all_read` | `{ userId: string }` | `{ count }` | Marca todas como leídas |
| `notification_delete` | `{ id: string }` | `{ success }` | Elimina notificación |

### Uso de Redis

```typescript
// Contador de no leídas por usuario — para el badge en la UI
const unreadCountKey = `notifications:unread:${userId}`;
await redis.set(unreadCountKey, count, 120);

// Invalidar al marcar como leída
await redis.del(unreadCountKey);
```

### Variables de entorno

```env
DATABASE_URL=postgresql://praxis:praxis123@localhost:5432/praxis?schema=notifications
REDIS_URL=redis://localhost:6379
TCP_PORT=3005
LOG_LEVEL=info
NODE_ENV=development
```

---

## Puertos TCP — resumen

| Servicio | Puerto |
|---|---|
| credentials-service | 3001 |
| roles-service | 3002 |
| projects-service | 3003 |
| tasks-service | 3004 |
| reports-service | 3005 |
| assistant-service | 3006 |
| alexa-service | 3007 |

---

## Dependencias entre servicios

```
credentials-service   → independiente
roles-service         → independiente
projects-service      → independiente
tasks-service         → consulta a projects-service (permisos)
notifications-service → independiente (recibe eventos del gateway)
alexa-service         → consulta a projects-service, tasks-service y credentials-service (solo lectura)
```

> `alexa-service` está documentado aparte en [examples/alexa-service.md](./examples/alexa-service.md)
> y su contrato HTTP para la skill en [alexa-skill-contract.md](./alexa-skill-contract.md).

El gateway es quien orquesta las llamadas entre servicios cuando una operación lo requiere (ej: registro crea credencial y luego notifica). Los servicios no se llaman entre sí excepto `tasks-service → projects-service` para verificar permisos.