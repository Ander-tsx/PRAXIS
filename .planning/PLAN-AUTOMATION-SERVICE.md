# Plan de implementación — Automation Service

## Propósito y justificación

PRAXIS necesita un `automation-service` dedicado porque las automatizaciones cruzan
responsabilidades que hoy pertenecen a varios microservicios. El sistema ya conserva el
historial de las tareas, genera notificaciones persistentes, envía correo mediante Resend y usa
Redis, pero no dispone de un componente que pueda correlacionar esos hechos mediante reglas
`trigger-condición-acción`, ejecutarlas de forma durable y dejar una auditoría común.

Los tres casos iniciales muestran por qué no conviene repartir esta lógica entre los servicios de
dominio:

- Cuando GitHub informa que se abrió un pull request que referencia una tarea, es necesario
  autenticar el webhook, identificar el repositorio y el proyecto, resolver la referencia de la
  tarea y solicitar su movimiento al servicio de tareas.
- Para recordar por correo que una tarea está próxima a vencer, hay que reaccionar a cambios de
  fecha, asignaciones y estado, mantener una programación recuperable y resolver los correos
  actuales de los responsables.
- Para avisar que una tarea lleva demasiado tiempo sin avanzar, hay que interpretar el historial
  de movimientos y resolver dinámicamente a los miembros que desempeñan el rol de project
  manager.

Centralizar estas capacidades permite compartir evaluación de condiciones, programación,
idempotencia, reintentos, clasificación de errores, bitácoras y controles de permisos. Los
microservicios de dominio conservan la propiedad de sus datos: emiten hechos durables y siguen
siendo los únicos que ejecutan sus comandos y validan sus invariantes.

El servicio no ejecutará código arbitrario ni decisiones generadas por IA. Solo procesará reglas
deterministas, explícitamente habilitadas y formadas por triggers, condiciones y acciones del
catálogo soportado. Las mutaciones seguirán pasando por los comandos existentes de tareas,
proyectos, notificaciones y usuarios.

## Principios y límites arquitectónicos

- El nuevo paquete será `@praxis/automation-service`, un microservicio NestJS TCP en el puerto
  `3008`.
- Usará PostgreSQL, un esquema Prisma propio llamado `automation`, Redis 7 y BullMQ.
- Las especificaciones de este documento son la fuente de verdad técnica. La sección
  [Bloques de implementación](#bloques-de-implementación) solo define el orden de entrega y el
  alcance de cada ejecución.
- Los servicios de dominio publican hechos y ejecutan comandos; `automation-service` no accede
  directamente a sus tablas.
- Redis Streams transporta eventos de dominio durables. Redis Pub/Sub continúa reservado para
  la entrega SSE de avisos, que es deliberadamente best effort.
- Toda acción vuelve a validar el estado del proyecto, la membresía y el permiso efectivo del
  principal delegado antes de ejecutarse. Una regla nunca congela privilegios históricos.
- Las reglas del MVP combinan sus condiciones con `AND` y admiten hasta cinco acciones
  secuenciales. Las expresiones anidadas y `OR` quedan fuera del MVP.
- No se almacenan secretos en reglas, respuestas de API ni logs de ejecución.
- La interfaz de administración autoservicio queda fuera del MVP; las APIs y Swagger serán la
  superficie inicial de configuración.

## Roles, permisos y principal delegado

### Permisos de proyecto

Se agregan al enum compartido `ProjectPermission`:

```ts
CAN_MANAGE_AUTOMATIONS = 'canManageAutomations';
CAN_MANAGE_INTEGRATIONS = 'canManageIntegrations';
```

`canManageAutomations` ya es la autoridad para crear, editar, habilitar, deshabilitar y eliminar
reglas. `canManageIntegrations` es la autoridad explícita para iniciar una instalación de GitHub
y conectar, reconectar o desconectar repositorios. Mantenerlos separados evita que administrar
reglas conceda por implicación la capacidad de vincular recursos externos.

| Operación | Autoridad requerida |
|---|---|
| Ver reglas y ejecuciones | `canManageAutomations` |
| Crear, editar, habilitar, deshabilitar o eliminar reglas | `canManageAutomations` |
| Reintentar una ejecución fallida | `canManageAutomations` y revalidación del permiso de la acción |
| Ver metadatos sanitizados de conexiones | `canManageAutomations` **o** `canManageIntegrations` |
| Solicitar la instalación de GitHub App | `canManageIntegrations` |
| Conectar, reconectar o desconectar un repositorio | `canManageIntegrations` |
| Ejecutar `MOVE_TASK` | El principal delegado conserva `canMoveTask` |
| Enviar una notificación o correo | Regla válida, proyecto activo y destinatarios que siguen siendo miembros aplicables |

Para endpoints de lectura que aceptan cualquiera de los dos permisos se introducirá un guard o
decorador `RequireAnyProjectPermission`, sin relajar los endpoints de escritura.

### Jerarquía y compatibilidad

- El dueño del proyecto conserva el bypass actual.
- `canManageRoles` implica ambos permisos nuevos al calcular los permisos efectivos. La relación
  se basa en la jerarquía, no en el nombre mutable de un rol.
- El rol Administrador creado por defecto incluye ambos permisos.
- Los roles Administrador ya existentes los obtienen por la jerarquía en runtime; no se requiere
  una migración masiva de diccionarios JSON basada en el nombre del rol.
- El editor de roles muestra los dos permisos por separado.
- En un proyecto `SUSPENDED`, ambos permisos desaparecen junto con los demás permisos de
  escritura; solo se conservan `canViewProject` y `canViewReports` según la política actual.
- Un colaborador sin permisos explícitos no recibe ninguno de los dos.

### Principal delegado y ausencia de escalamiento

Cada regla guarda `createdBy`. Ese usuario es el principal delegado con el que se autoriza una
acción que muta el dominio. El permiso requerido se valida al guardar o habilitar la regla y se
vuelve a validar inmediatamente antes de cada acción. Si el usuario deja el proyecto o pierde el
permiso, la ejecución falla con un error no reintentable y la regla pasa a `PAUSED_SYSTEM`.

Reintentar una ejecución no reutiliza una autorización antigua: exige
`canManageAutomations` al solicitante y vuelve a evaluar la autorización del principal delegado,
el estado del proyecto y la validez de todos los recursos. Así, las automatizaciones no crean un
camino de escalamiento de privilegios.

## Modelo de datos

Todas las entidades siguientes pertenecen al esquema Prisma `automation` salvo las tablas
outbox, que viven junto con las escrituras de sus respectivos dominios.

### Reglas

- `AutomationRule`: `id`, `projectId`, `name`, `description?`, `createdBy`, `version`, `status`,
  timestamps y metadatos de última pausa. Estados: `ENABLED`, `DISABLED`, `PAUSED_SYSTEM` e
  `INVALID`.
- `AutomationTrigger`: relación 1:1 con la regla, `type` y `config` validada según un catálogo
  versionado.
- `AutomationCondition`: `field`, `operator`, `value` y `position`. El MVP evalúa todas con
  `AND`.
- `AutomationAction`: `type`, `config` y `position`. El MVP admite como máximo cinco y las
  ejecuta secuencialmente.

Las actualizaciones incrementan `AutomationRule.version`. Cada ejecución conserva un snapshot
de la versión, trigger, condiciones y acciones para que los logs sigan siendo interpretables
aunque la regla se edite después.

### Integración GitHub

- `GitHubInstallationRequest`: `projectId`, repositorio solicitado, `requestedBy`, hash del
  `state`, expiración, consumo, estado y timestamps. Nunca almacena ni devuelve el token `state`
  en claro después de crearlo.
- `GitHubConnection`: `projectId`, `installationId`, `repositoryId`, nombre canónico del
  repositorio, estado, autor y timestamps. Estados: `ACTIVE`, `DISCONNECTED`, `REVOKED` y
  `SUSPENDED`.

Desconectar un repositorio desde PRAXIS marca la conexión `DISCONNECTED` y pausa las reglas
habilitadas que dependen de ella. No desinstala la GitHub App completa porque una instalación
puede dar acceso a repositorios asociados con otros proyectos. Tampoco reactiva reglas de forma
automática al reconectar: alguien con `canManageAutomations` debe revisarlas y habilitarlas.

### Durabilidad, programación y auditoría

- `DomainOutbox`: vive en los servicios de tareas y proyectos y se escribe en la misma
  transacción que la mutación de dominio.
- `InboundEvent`: copia durable en automation, con `eventId` y `dedupeKey` únicos, payload,
  estado y timestamps.
- `ScheduledOccurrence`: fuente de verdad para trabajos programados, con regla, sujeto,
  instante previsto, estado, versión y clave de idempotencia.
- `RuleExecution`: snapshot de regla, evento u ocurrencia causante, resultado de condiciones,
  estado, errores sanitizados y tiempos.
- `ActionExecution`: una fila por acción y destinatario o target expandido. La combinación de
  ejecución, acción y `targetKey` es única.
- `ActionAttempt`: número de intento, inicio/fin, clasificación del error y respuesta
  sanitizada.

### Identificador legible de tarea

Las tareas reciben una clave pública, global, inmutable, aleatoria y no secuencial, por ejemplo
`PX-7K9M2Q4R`. Tiene restricción única y se genera también para las tareas existentes. Evita que
la automatización dependa de títulos ambiguos sin introducir un contador que permita enumerar
tareas ajenas.

El webhook puede reconocer:

- La clave pública.
- El UUID de la tarea.
- La URL `/projects/tarea/<uuid>`.
- Una URL con `?task=<uuid>`.

La resolución siempre comprueba que la tarea pertenezca al mismo proyecto que la conexión de
GitHub.

## Eventos de dominio y transporte durable

### Sobre común

```ts
interface DomainEvent<TPayload> {
  id: string;
  type: string;
  source: string;
  occurredAt: string;
  projectId: string;
  subject: { type: string; id: string };
  actor: {
    type: 'USER' | 'AUTOMATION' | 'EXTERNAL' | 'SYSTEM';
    id?: string;
  };
  correlationId: string;
  causationId?: string;
  payload: TPayload;
}
```

Los contratos son versionados. Los eventos iniciales son:

- `task.created.v1`
- `task.moved.v1`
- `task.due-date-changed.v1`
- `task.completed.v1`
- `task.reopened.v1`
- `task.deleted.v1`
- `task.assignees-changed.v1`
- `project.status-changed.v1`
- `project.member-removed.v1`
- `project.role-deleted.v1`
- `github.pull-request.opened.v1`

Los servicios de tareas y proyectos guardan el evento en `DomainOutbox` dentro de la transacción
de negocio. Un publicador recuperable lo envía al stream `praxis:domain-events` y marca la fila
como publicada. El grupo consumidor de automation persiste primero `InboundEvent`; solo entonces
hace `XACK`. Las entregas repetidas se absorben por la clave única y `XAUTOCLAIM` recupera
mensajes abandonados por consumidores caídos.

Los eventos producidos por acciones automatizadas usan `actor.type = AUTOMATION` y propagan
`correlationId`/`causationId`. La idempotencia continúa siendo obligatoria en cada consumidor y
acción.

## Administración de reglas y API

### Reglas y ejecuciones

- `GET /api/projects/:projectId/automations`
- `POST /api/projects/:projectId/automations`
- `GET /api/projects/:projectId/automations/:id`
- `PATCH /api/projects/:projectId/automations/:id`
- `DELETE /api/projects/:projectId/automations/:id`
- `GET /api/projects/:projectId/automations/:id/executions`
- `POST /api/projects/:projectId/automations/:id/executions/:executionId/retry`

Las escrituras exigen `canManageAutomations`, validan que todos los recursos referenciados sean
del proyecto de la ruta y confirman que el principal delegado tenga el permiso que requerirá la
acción. Las respuestas siguen el sobre estándar del gateway. Al eliminar un proyecto, projects
envía el comando interno `automation_project_purge` para retirar sus reglas, conexiones,
programaciones y datos operativos asociados al proyecto.

### GitHub

- `POST /api/projects/:projectId/integrations/github/install-request`
- `GET /api/projects/:projectId/integrations/github`
- `DELETE /api/projects/:projectId/integrations/github/:connectionId`
- `GET /api/integrations/github/setup` — público y autenticado por `state` de un solo uso.
- `POST /api/webhooks/github` — público y autenticado por firma GitHub.

El listado devuelve únicamente metadatos sanitizados; nunca claves privadas, tokens de
instalación, webhook secrets ni el `state` en claro.

## Configuración e ingreso de GitHub

### Configuración única de la GitHub App

En el MVP la instalación no es completamente autoservicio. Un operador de plataforma crea y
mantiene una GitHub App propiedad de la organización de PRAXIS con:

- Permisos de repositorio: `Metadata: read` y `Pull requests: read`.
- Eventos: `pull_request`, `installation` e `installation_repositories`.
- Webhook URL: `<PUBLIC_GATEWAY_URL>/api/webhooks/github`.
- Setup URL: `<PUBLIC_GATEWAY_URL>/api/integrations/github/setup`.

El operador registra en los secretos del gateway los valores `GITHUB_APP_ID`,
`GITHUB_APP_SLUG`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`,
`GITHUB_INSTALL_STATE_SECRET` y `PUBLIC_GATEWAY_URL`. Esta tarea se realiza una sola vez por
ambiente y su rotación pertenece a la operación de plataforma.

### Obtención y registro de `installationId`

1. Un miembro con `canManageIntegrations` llama a
   `POST /api/projects/:projectId/integrations/github/install-request` con
   `repositoryFullName`.
2. El gateway crea `GitHubInstallationRequest`, genera un `state` aleatorio de un solo uso,
   persiste solo su hash con expiración de 30 minutos y devuelve una URL de
   `https://github.com/apps/<slug>/installations/new?state=<token>`.
3. Si el solicitante no administra el repositorio en GitHub, remite esa URL al dueño de la
   organización o administrador del repositorio. El permiso en PRAXIS autoriza la solicitud; la
   autoridad de GitHub autoriza la instalación.
4. El administrador instala la App y selecciona únicamente el repositorio solicitado.
5. GitHub redirige a
   `GET /api/integrations/github/setup?installation_id=...&setup_action=install&state=...`.
6. El gateway consume el `state` una sola vez y no confía en el `installation_id` recibido.
   Se autentica como GitHub App mediante App ID y clave privada, consulta la instalación, genera
   un token de instalación temporal, lista los repositorios accesibles y verifica que incluya el
   solicitado. Obtiene de GitHub el `repositoryId` y nombre canónico.
7. Solo después envía por TCP `automation_github_register` con `projectId`, `installationId`,
   `repositoryId`, `repositoryFullName` y `requestedBy`.
8. `automation-service` crea o reactiva la conexión. El usuario confirma el resultado mediante
   `GET /api/projects/:projectId/integrations/github`.

No hay copia manual de IDs en base de datos. El operador configura la App, el usuario autorizado
de PRAXIS inicia la solicitud, el administrador de GitHub concede acceso y el gateway junto con
automation verifican y registran el `installationId`.

Los eventos de GitHub mantienen el estado de la conexión: una instalación suspendida pasa a
`SUSPENDED`, una instalación eliminada a `REVOKED` y retirar el repositorio de la instalación a
`DISCONNECTED`. En los tres casos se pausan las reglas dependientes y se registra la causa.

### Ruta pública a través del gateway

El gateway agrega un `AutomationsModule`, análogo al módulo de billing, que registra el cliente
TCP `AUTOMATION_SERVICE` en el puerto 3008 y los controladores
`GitHubWebhookController`, `GitHubSetupController`, `ProjectAutomationsController` y
`GitHubIntegrationsController`. `AppModule` importa este módulo.

`GitHubWebhookController` usa `@Controller('webhooks/github')` y `@Post()`. El prefijo global
`api` expone exactamente `POST /api/webhooks/github`; no intervienen el web-shell, los proxies de
Next ni la cookie de sesión. La infraestructura pública permite tráfico HTTP hacia el gateway y
la autenticación de aplicación se realiza con firma, igual que en el webhook existente de
Stripe.

La ruta:

- No usa JWT ni guard de proyecto.
- Usa el `rawBody` ya habilitado por Stripe y verifica `X-Hub-Signature-256` mediante HMAC SHA-256
  con comparación de tiempo constante.
- Exige `X-GitHub-Delivery` y `X-GitHub-Event`.
- Está excluida de Swagger y del throttling basado en usuario, pero conserva el límite de tamaño
  del body y la verificación de firma.
- Responde `200` a `ping` y eventos soportados pero deliberadamente ignorados, `202` cuando el
  evento válido queda persistido, `400` ante firma o cabeceras inválidas y `503` si automation no
  puede persistirlo, para permitir el reintento de GitHub.

El callback `GET /api/integrations/github/setup` también es público, pero su autorización es el
`state` firmado, de un solo uso y con expiración. No acepta `projectId` ni `userId` desde query
params.

## Motor de evaluación y ejecución

### Colas

BullMQ usa cuatro colas:

- `automation-evaluate`
- `automation-scheduled`
- `automation-actions`
- `automation-dead-letter`

Un evento aceptado crea un trabajo de evaluación idempotente. Una regla coincidente crea una
`RuleExecution`; sus acciones se expanden en `ActionExecution` y se envían secuencialmente. El
`jobId` de cada acción es su `actionExecutionId`.

Los reintentos usan esperas de 30 segundos, 2 minutos, 10 minutos, 30 minutos y 2 horas. Son
reintentables los errores de red, timeout, `429`, `5xx` y dependencias temporalmente no
disponibles. No se reintentan permisos revocados, proyecto suspendido, configuración inválida ni
recurso eliminado. Al agotar intentos se registra el estado final y se agrega una referencia
sanitizada a `automation-dead-letter`.

Los correos usan `actionExecutionId` como `Idempotency-Key`. Debido a que la garantía de Resend
para una misma clave está limitada a 24 horas, la unicidad de `ActionExecution` sigue siendo la
fuente permanente que impide volver a enviar.

### Programación recuperable

`ScheduledOccurrence` es la fuente de verdad, no el delayed job de Redis. Un reconciliador al
arranque y cada hora recrea trabajos ausentes y cancela los obsoletos. Cambiar la fecha de una
tarea, quitarla, completar, reabrir, mover o eliminar la tarea actualiza o cancela sus
ocurrencias según el trigger correspondiente.

### Triggers y acciones del MVP

#### Pull request abierto → mover tarea

- Trigger: `GITHUB_PULL_REQUEST_OPENED` derivado de `github.pull-request.opened.v1`.
- Condición obligatoria: conexión `ACTIVE` para el mismo `repositoryId` y proyecto.
- La referencia se busca en título y descripción por clave, UUID o URL soportada. Cada tarea se
  deduplica y se valida contra el proyecto de la conexión.
- Acción: `MOVE_TASK`, con `targetColumnId` en su configuración.
- Antes de ejecutar se revalida `canMoveTask` del principal delegado.
- Automation resuelve los datos necesarios y llama al comando existente `task_move`, incluyendo
  el nombre y color de columna que exige el contrato actual; tasks conserva todas sus
  invariantes.
- Si la tarea ya está en la columna destino, la acción termina idempotentemente como `SKIPPED`.

#### Tarea próxima a vencer → correo

- Trigger: `TASK_DUE_SOON`, configurado con `leadTimeMinutes`.
- Destinatarios: responsables actuales de la tarea; sus correos se resuelven en el momento con
  `user_find_by_ids`.
- Cambiar `dueDate` reprograma; quitar la fecha, completar o eliminar cancela. Reabrir vuelve a
  programar cuando aplique.
- Al habilitar una regla se hace backfill de las tareas existentes. Si una tarea ya está dentro
  de la ventana pero aún no está vencida, se programa una única ejecución inmediata; si ya está
  vencida se omite.
- Cada destinatario genera un `ActionExecution` separado y no se envía dos veces aunque se
  redelivre el evento o trabajo.

#### Tarea estancada → notificación al project manager

- Trigger: `TASK_STALE`, con siete días por defecto y valor configurable.
- El tiempo se deriva del último evento `CREATED` o `MOVED` de `TaskEvent`, nunca de
  `updatedAt`; editar título, descripción o asignados no reinicia el reloj.
- Un movimiento reinicia la ocurrencia. Completar o eliminar la cancela; reabrir la vuelve a
  evaluar.
- Los destinatarios se expresan mediante selectores de miembro y rol. Al ejecutar se resuelven
  las membresías actuales, se eliminan duplicados y se descartan usuarios que ya no pertenecen
  al proyecto.
- Si no hay destinatarios válidos, la acción queda `SKIPPED` sin reintento.
- Se agrega `TASK_STALE` a `NotificationType` y se reutiliza el comando existente
  `notification_create`, preservando la persistencia y el SSE actual.

## Bloques de implementación

Esta sección define unidades de trabajo entregables. Para ejecutar un bloque con un agente, su
prompt debe incluir el bloque completo y remitirlo a las secciones técnicas citadas; no debe
autorizar trabajo de bloques posteriores. Salvo donde se indique lo contrario, cada bloque parte
de la rama verificada del bloque anterior y debe dejar compilando todo el monorepo.

### Bloque 1 — Permisos y jerarquía para automatizaciones e integraciones

**Objetivo**

Dejar disponible una autoridad explícita y comprobable para administrar reglas y otra para
conectar recursos externos, sin conceder privilegios nuevos por accidente.

**Dependencias**

Ninguna.

**Implementación**

1. Incorporar `canManageAutomations` y `canManageIntegrations` en contratos, DTOs, catálogos y
   diccionarios de permisos compartidos conforme a [Roles, permisos y principal delegado](#roles-permisos-y-principal-delegado).
2. Aplicar la implicación de `canManageRoles`, el bypass del dueño, los defaults del rol
   Administrador y el recorte por proyecto suspendido.
3. Exponer ambos permisos por separado en las superficies existentes de edición y consulta de
   roles.
4. Introducir `RequireAnyProjectPermission` para futuros endpoints de lectura que acepten
   cualquiera de ellos, manteniendo los guards de escritura con un permiso exacto.
5. Actualizar documentación de permisos y fixtures/seeds necesarios sin depender del nombre de
   roles existentes.

**Fuera de alcance**

No se crea todavía el microservicio, ninguna tabla de automatización, endpoints de reglas ni
conexiones GitHub. Tampoco se agrega una UI de automatizaciones.

**Pruebas**

- Unitarias del cálculo efectivo: dueño, `canManageRoles`, Administrador nuevo y existente,
  colaborador y proyecto suspendido.
- Unitarias/de integración de `RequireAnyProjectPermission` y de los guards de permiso exacto.
- Contratos y validación de diccionarios de permisos, incluido el round trip de ambos booleanos.
- Seguridad: un usuario con solo uno de los permisos no adquiere el otro.

**Criterios de finalización**

- `canManageRoles` implica ambos permisos sin consultar el nombre del rol.
- El Administrador por defecto y los roles administrativos existentes obtienen ambos; un
  colaborador no.
- Un proyecto suspendido no concede ninguno.
- Los dos permisos permanecen distinguibles en contratos y superficies de roles.
- Compilan contratos, permissions-service, gateway y frontends afectados, y pasan sus pruebas.

### Bloque 2 — Base operativa de `automation-service`

**Objetivo**

Incorporar al monorepo un microservicio vacío pero operable, observable y verificable en TCP
3008, listo para recibir capacidades posteriores.

**Dependencias**

Bloque 1.

**Implementación**

1. Crear `@praxis/automation-service` con la estructura NestJS, configuración, validación de
   ambiente, observabilidad y scripts coherentes con los demás microservicios.
2. Configurar el esquema Prisma `automation`, conexión PostgreSQL y Redis sin crear todavía
   modelos funcionales que pertenecen a otros bloques.
3. Registrar el servicio y puerto 3008 en workspace, scripts de desarrollo, generación/deploy de
   Prisma y configuración operativa que sea fuente de verdad para puertos.
4. Agregar un patrón TCP de salud/capacidad mínima y el cliente `AUTOMATION_SERVICE` del gateway,
   sin exponer aún APIs funcionales.
5. Documentar variables base y procedimiento local de arranque.

**Fuera de alcance**

No se implementan reglas, eventos, colas, schedulers, GitHub ni acciones. El cliente del gateway
no se usa todavía para rutas públicas o de proyecto.

**Pruebas**

- Unitarias de validación de configuración.
- Integración de bootstrap, conexión TCP y respuesta de salud.
- Smoke test de Prisma y Redis con dependencias de prueba.
- Build del servicio y de los paquetes compartidos.

**Criterios de finalización**

- El servicio arranca en 3008, responde al patrón de salud y termina limpiamente.
- Los scripts oficiales lo incluyen sin alterar los puertos existentes.
- Un árbol limpio puede generar Prisma y compilar el servicio.
- La ausencia temporal del servicio produce el error esperado en el cliente, no bloquea el
  arranque del gateway y no expone endpoints incompletos.

### Bloque 3 — Eventos de dominio durables: outbox, stream e inbox

**Objetivo**

Garantizar que los hechos relevantes de tareas y proyectos lleguen a automation al menos una
vez, sobrevivan caídas y se almacenen una sola vez lógicamente.

**Dependencias**

Bloque 2.

**Implementación**

Este bloque se entrega en las cinco subentregas siguientes. Las secciones
[Eventos de dominio y transporte durable](#eventos-de-dominio-y-transporte-durable) y las
decisiones de seguridad ya definidas siguen siendo la fuente de verdad; estas subentregas solo
ordenan su implementación.

#### Subentrega 3.1 — Sobre `DomainEvent` y contratos versionados

**Objetivo.** Dejar un contrato compartido, validable y versionado para los hechos de dominio,
sin escribir todavía en servicios de dominio, bases de datos ni Redis.

**Dependencias.** Bloque 2.

**Implementación.** Definir y exportar `DomainEvent`, actor, sujeto, correlación/causación y los
tipos/payloads de `task.created.v1`, `task.moved.v1`, `task.due-date-changed.v1`,
`task.completed.v1`, `task.reopened.v1`, `task.deleted.v1`, `task.assignees-changed.v1`,
`project.status-changed.v1`, `project.member-removed.v1` y `project.role-deleted.v1`.
`github.pull-request.opened.v1` permanece reservado para su productor del Bloque 7. Los contratos
aceptan `actor.type = AUTOMATION` y preservan `correlationId`/`causationId`; no se introducen
DTOs HTTP ni endpoints.

**Fuera de alcance.** Cualquier modificación de `tasks-service`, `projects-service`,
`automation-service`, Prisma, Redis o publicación.

**Pruebas y verificación.** Pruebas unitarias de cada versión y payload, campos obligatorios,
actor/sujeto/proyecto incompatibles y round-trip de serialización. La caída verificable de esta
subentrega es una carga de contrato inválida: debe rechazarse antes de que exista una llamada a
persistencia o transporte. Compilar `@praxis/contracts` y los consumidores ya existentes.

**Criterio de finalización.** Todos los productores futuros compilan contra un único sobre
versionado y ninguna capacidad de dominio o transporte se ha activado todavía.

#### Subentrega 3.2 — `DomainOutbox` transaccional de tareas

**Objetivo.** Hacer atómica la persistencia de los hechos iniciales de tareas con sus mutaciones.

**Dependencias.** Subentrega 3.1.

**Implementación.** Añadir `DomainOutbox` y migración propios de `tasks-service`; instrumentar
solo las mutaciones que producen los siete eventos de tareas, usando la misma transacción de
negocio. Propagar actor, proyecto, sujeto, correlación y causación desde el comando confiable;
los comandos futuros de motor podrán usar `actor.type = AUTOMATION`. Las filas quedan sin
publicar: esta subentrega no importa ni usa Redis Stream.

**Fuera de alcance.** `projects-service`, publicadores, consumidor automation, `XACK`, reintentos
de transporte y evaluación de reglas.

**Pruebas y verificación.** Integración transaccional por mutación: éxito deja el evento exacto y
un error antes del commit no deja ni mutación ni outbox. Simular caída después del commit y antes
de cualquier publicación: la fila no publicada debe sobrevivir y poder enumerarse para entrega
posterior. Añadir regresión de tareas y aislamiento: `projectId`, sujeto y actor no pueden cruzar
proyectos. Generar Prisma, aplicar migración de desarrollo y ejecutar suite de tasks.

**Criterio de finalización.** Cada hecho de tareas enumerado se conserva una sola vez junto a su
mutación, incluso si el proceso cae tras el commit.

#### Subentrega 3.3 — `DomainOutbox` transaccional de proyectos

**Objetivo.** Dar la misma garantía atómica a cambios administrativos de proyectos.

**Dependencias.** Subentregas 3.1 y 3.2.

**Implementación.** Añadir `DomainOutbox` y migración propios de `projects-service`; instrumentar
exclusivamente cambio de estado, expulsión de miembro y eliminación de rol para los tres eventos
de proyecto. Mantener actor/correlación/causación y no consultar tablas de tasks ni automation.

**Fuera de alcance.** Publicación Redis, `InboundEvent`, consumidores, reglas y cualquier evento
de GitHub.

**Pruebas y verificación.** Integración por cada mutación: rollback no deja outbox y commit deja
payload versionado. Simular caída después del commit: la fila pendiente permanece recuperable.
Probar aislamiento entre proyectos, dueño/actor y regresión de estado, miembros y roles. Generar
Prisma, aplicar migración de desarrollo y ejecutar suite de projects.

**Criterio de finalización.** Los tres hechos de proyecto quedan atómicamente pendientes de
publicación y no cruzan datos entre proyectos.

#### Subentrega 3.4 — Publicador recuperable hacia Redis Stream

**Objetivo.** Entregar las filas pendientes de ambos outboxes al stream
`praxis:domain-events` con semántica al menos una vez.

**Dependencias.** Subentregas 3.2 y 3.3.

**Implementación.** Incorporar un publicador recuperable en tasks y projects que lea filas no
publicadas, publique el sobre íntegro mediante `XADD`, marque publicada la fila solo después y
reintente de forma acotada ante Redis temporalmente indisponible. Exponer métricas/logs de
pendientes, antigüedad/lag, publicaciones y errores. Redis Stream es el único transporte durable:
no se reutiliza pub/sub ni se altera SSE.

**Fuera de alcance.** Crear `InboundEvent`, grupos consumidores, `XACK`, `XAUTOCLAIM`, reglas o
trabajos BullMQ.

**Pruebas y verificación.** Con Redis temporal de prueba: una fila pendiente llega al stream y
queda publicada. Simular caída antes de `XADD`: permanece pendiente sin marcado. Simular caída
después de `XADD` y antes del marcado: la fila se reintenta (duplicado físico admisible) sin
perder el `eventId`; una siguiente ejecución la marca publicada. Probar indisponibilidad y
recuperación de Redis, reintentos y métricas. Ejecutar las suites de tasks y projects.

**Criterio de finalización.** Ninguna caída entre base y stream pierde un hecho; puede haber
redelivery, que la siguiente subentrega absorberá lógicamente.

#### Subentrega 3.5 — Consumidor `InboundEvent` y recuperación `XAUTOCLAIM`

**Objetivo.** Recibir de forma idempotente los eventos del stream en automation y dejar cada
hecho aceptado en inbox antes de confirmarlo.

**Dependencias.** Subentrega 3.4.

**Implementación.** Añadir `InboundEvent` y migración en automation, grupo consumidor de
`praxis:domain-events`, persistencia con claves únicas por `eventId`/`dedupeKey`, `XACK` solo tras
persistir y recuperación de pendientes abandonados mediante `XAUTOCLAIM`. Registrar lag,
pendientes, reclaim, deduplicaciones y errores. El consumidor solo acepta y almacena: no evalúa
reglas ni crea BullMQ.

**Fuera de alcance.** Matching de triggers, reglas, acciones, webhooks GitHub, programaciones y
ejecución de trabajos.

**Pruebas y verificación.** Con Redis/Postgres temporales: caída después de leer y antes de
persistir deja el mensaje sin `XACK`; caída después de persistir y antes de `XACK` causa
redelivery sin segundo evento lógico; `XAUTOCLAIM` reclama y confirma una entrega abandonada por
otro consumidor. Probar deduplicación por `eventId` y `dedupeKey`, payload/proyecto/sujeto/actor
aislados, recuperación tras Redis indisponible y observabilidad. Ejecutar suite de automation y
el recorrido integrado outbox → stream → inbox.

**Criterio de finalización.** Todos los hechos enumerados de tareas y proyectos llegan a
`InboundEvent` al menos una vez, y el mismo hecho no crea dos eventos lógicos.

**Fuera de alcance**

Automation no evalúa reglas ni crea trabajos BullMQ. Los eventos aceptados solo quedan en inbox.
No se reciben webhooks GitHub ni se ejecutan acciones.

**Criterios de finalización del bloque completo**

- Las cinco subentregas están terminadas en orden y sus pruebas de caída son verdes.
- Todos los hechos enumerados de tareas/proyectos se guardan atómicamente y llegan a
  `InboundEvent`.
- Reentregar el mismo mensaje no crea dos eventos lógicos y uno pendiente de un consumidor caído
  puede reclamarse y confirmarse.
- Pub/Sub/SSE no se ha convertido en transporte durable ni se ha afectado su sobre especial.
- Las suites de tasks, projects y automation pasan con Redis temporalmente indisponible y luego
  recuperado.

### Bloque 4 — Administración y persistencia de reglas

**Objetivo**

Permitir definir, consultar, versionar, habilitar y retirar reglas válidas por proyecto, todavía
sin ejecutarlas.

**Dependencias**

Bloques 1 a 3.

**Implementación**

1. Crear `AutomationRule`, `AutomationTrigger`, `AutomationCondition` y `AutomationAction` según
   [Modelo de datos](#modelo-de-datos), incluidos estados, versiones, orden, condiciones `AND` y
   máximo de cinco acciones.
2. Implementar catálogos y validación discriminada de configuraciones para los tres triggers y
   acciones del MVP, sin sus ejecutores.
3. Exponer los endpoints CRUD de reglas a través del `AutomationsModule` del gateway y sus
   patrones TCP.
4. Aplicar `canManageAutomations`, scoping estricto por proyecto y validación inicial del
   principal delegado y de recursos referenciados.
5. Implementar el contrato `automation_project_purge` y su invocación durante la eliminación de
   proyecto para retirar sus datos asociados.
6. Documentar las APIs y ejemplos válidos en Swagger.

**Fuera de alcance**

No se consumen eventos para evaluar reglas, no hay logs de ejecución, reintentos, scheduled
occurrences ni llamadas a servicios de dominio. Tampoco existen todavía rutas GitHub.

**Pruebas**

- Unitarias de validación por tipo, orden, límite de acciones, condiciones `AND`, transiciones de
  estado y versionado.
- Integración CRUD y aislamiento entre proyectos.
- Seguridad de dueño, permisos explícitos, `canManageRoles`, suspensión, usuario ajeno y pérdida
  de permiso antes de habilitar.
- Purga de proyecto y ausencia de datos de otro proyecto.
- Contrato gateway/TCP y sobre estándar de éxito/error.

**Criterios de finalización**

- Una regla válida puede recorrer CRUD y cada edición incrementa la versión.
- Configuraciones, recursos o proyectos ajenos se rechazan antes de persistir.
- Solo `canManageAutomations` autoriza escrituras.
- Eliminar un proyecto retira únicamente los datos de automation asociados con ese proyecto.
- No existe ningún worker que pueda ejecutar una regla en esta etapa.

### Bloque 5 — Motor idempotente, colas, auditoría y recuperación

**Objetivo**

Convertir eventos aceptados en evaluaciones auditables y acciones despachadas de forma
idempotente, con reintentos clasificados y recuperación, independientemente de una integración
concreta.

**Dependencias**

Bloques 3 y 4.

**Implementación**

1. Crear `ScheduledOccurrence`, `RuleExecution`, `ActionExecution` y `ActionAttempt` con snapshots,
   claves únicas y errores sanitizados según [Modelo de datos](#modelo-de-datos).
2. Incorporar las cuatro colas y la política completa de reintentos/dead letter definida en
   [Motor de evaluación y ejecución](#motor-de-evaluación-y-ejecución).
3. Implementar matching de triggers, evaluación `AND`, expansión por target y ejecución
   secuencial de hasta cinco acciones mediante un registro de handlers.
4. Usar `actionExecutionId` como `jobId` y distinguir errores reintentables de terminales.
5. Revalidar proyecto, membresía, permisos y recursos al inicio de cada acción; ante revocación,
   fallar sin reintento y pasar la regla a `PAUSED_SYSTEM`.
6. Exponer consulta de ejecuciones y reintento manual, aplicando las autoridades descritas en
   [Administración de reglas y API](#administración-de-reglas-y-api).
7. Implementar el reconciliador de `ScheduledOccurrence` al arranque y cada hora.

**Fuera de alcance**

No se agrega un handler de producción para mover tareas, enviar correos o crear notificaciones.
Las pruebas del motor inyectan handlers controlados solo en el entorno de test. No se integra
GitHub.

**Pruebas**

- Unitarias del matcher, condiciones, snapshot, orden secuencial, expansión por target y
  clasificación de errores.
- Integración de entrega duplicada de evento/job, unicidad de ejecuciones y retomado tras caída
  entre persistencia y enqueue.
- Reintentos en 30 s, 2 min, 10 min, 30 min y 2 h usando reloj controlado; terminales a dead
  letter.
- Reconciliación de delayed jobs ausentes u obsoletos.
- Seguridad: permiso revocado, usuario fuera del proyecto, proyecto suspendido y reintento manual
  sin autorización.
- Sanitización de logs para que no contengan secretos ni payloads sensibles.

**Criterios de finalización**

- Un mismo evento o job produce una sola ejecución lógica y una sola acción por `targetKey`.
- El snapshot permite auditar la versión exacta aunque la regla cambie.
- Las cinco demoras y la clasificación terminal se verifican objetivamente.
- Los jobs perdidos se reconstruyen desde PostgreSQL.
- La revocación de autorización pausa la regla sin ejecutar la mutación.
- Las APIs de ejecución respetan permisos y el reintento vuelve a autorizar desde cero.

### Bloque 6 — Referencias públicas e inmutables de tarea

**Objetivo**

Permitir que sistemas externos referencien tareas sin depender de títulos ni exponer un contador
enumerable.

**Dependencias**

Bloque 3 para emitir los eventos coherentes con la tarea migrada; no depende de GitHub.

**Implementación**

1. Añadir la clave pública aleatoria, global, única e inmutable descrita en
   [Identificador legible de tarea](#identificador-legible-de-tarea).
2. Generar claves para nuevas tareas y realizar un backfill seguro y reiniciable de las
   existentes antes de imponer `NOT NULL`/unicidad definitiva.
3. Incluir la clave en contratos de lectura necesarios sin aceptar que el cliente la elija o
   modifique.
4. Crear un resolvedor interno que reconozca clave, UUID y las dos formas de URL, deduplique
   referencias y obligue a proporcionar el `projectId` esperado.
5. Actualizar los eventos de tarea para incluir la referencia necesaria sin filtrar información
   de proyectos ajenos.

**Fuera de alcance**

No se parsean pull requests ni se expone un buscador público de tareas. No se mueve ninguna
tarea automáticamente.

**Pruebas**

- Generación, formato, colisiones simuladas, unicidad e inmutabilidad.
- Migración/backfill sobre datos existentes, incluida reanudación tras interrupción.
- Resolución de cada sintaxis, múltiples referencias, duplicados y entradas malformadas.
- Seguridad: una referencia válida de otro proyecto se trata como no resoluble y no revela su
  existencia.
- Regresión de creación, edición y lectura de tareas.

**Criterios de finalización**

- Todas las tareas existentes y nuevas tienen una clave única no secuencial.
- Ninguna API permite modificarla o usarla para enumerar tareas.
- El resolvedor exige y respeta el proyecto esperado.
- Las formas de referencia documentadas producen el mismo UUID cuando son válidas.

### Bloque 7 — Conexiones GitHub e ingreso público autenticado

**Objetivo**

Permitir que un usuario autorizado solicite la instalación asistida de la GitHub App, registrar
el `installationId` verificado y aceptar webhooks firmados como eventos durables.

**Dependencias**

Bloques 1 a 6.

**Implementación**

1. Crear `GitHubInstallationRequest` y `GitHubConnection`, incluidos hashes, expiración,
   unicidad, estados y transiciones definidas en [Integración GitHub](#integración-github).
2. Completar la configuración operativa única de la GitHub App y validar todas las variables de
   ambiente descritas en [Configuración única de la GitHub App](#configuración-única-de-la-github-app).
3. Implementar `install-request`, el callback público y el patrón
   `automation_github_register` siguiendo íntegramente el flujo de obtención y verificación del
   `installationId`.
4. Implementar listado sanitizado y desconexión desde PRAXIS con los permisos exactos; la
   desconexión no debe desinstalar la App ni afectar otros repositorios.
5. Exponer `POST /api/webhooks/github` directamente por el gateway con raw body, HMAC de tiempo
   constante, cabeceras obligatorias, códigos de respuesta, límite de body, exclusión de Swagger
   y `SkipThrottle` especificados en [Ruta pública a través del gateway](#ruta-pública-a-través-del-gateway).
6. Persistir/deduplicar por `X-GitHub-Delivery` antes de responder `202` y normalizar pull
   requests abiertos como `github.pull-request.opened.v1` en el mismo pipeline durable.
7. Procesar `installation` e `installation_repositories` para suspender, revocar o desconectar y
   pausar reglas dependientes con causa auditable.

**Fuera de alcance**

El evento de pull request todavía no mueve tareas. No se implementa OAuth, instalación
completamente autoservicio, PR merged/closed/review ni una UI de conexión.

**Pruebas**

- Permisos cruzados: solo automatizaciones frente a solo integraciones, `canManageRoles`, dueño y
  colaborador.
- `state` expirado, repetido, alterado o desconocido; callback con IDs inyectados; instalación que
  no contiene el repositorio solicitado.
- Firma inválida, payload alterado, cabeceras ausentes, delivery repetido, evento/repo ajeno,
  `ping`, evento ignorado y automation no disponible.
- Verificación con API GitHub simulada de instalación, token temporal y lista de repositorios.
- Suspensión, eliminación y retiro de repositorio; pausa de reglas dependientes.
- Desconexión PRAXIS sin desinstalar la App ni modificar conexiones de otros proyectos.
- Prueba de routing que alcance exactamente `/api/webhooks/github` sin JWT, proxy Next o Swagger.

**Criterios de finalización**

- El `installationId` solo se registra tras consumir un `state` válido y comprobar el repositorio
  contra GitHub.
- Los secretos y tokens no aparecen en DB funcional, respuestas o logs, salvo los secretos en el
  almacén operativo correspondiente.
- Un delivery válido queda durable antes del `202`; un fallo de persistencia devuelve `503`.
- Repetir el delivery no crea un segundo evento lógico.
- Desconectar o perder acceso pausa reglas dependientes y nunca afecta instalaciones ajenas.
- La matriz completa de permisos de reglas e integraciones pasa.

### Bloque 8 — Pull request abierto y acción `MOVE_TASK`

**Objetivo**

Entregar la primera automatización vertical: mover de forma segura una tarea del proyecto cuando
un pull request abierto la referencia.

**Dependencias**

Bloques 5, 6 y 7.

**Implementación**

1. Habilitar el trigger `GITHUB_PULL_REQUEST_OPENED` y su correlación exclusiva con una conexión
   `ACTIVE` del mismo `repositoryId` y proyecto.
2. Extraer de título y descripción todas las referencias admitidas, deduplicarlas y resolverlas
   mediante el componente del Bloque 6.
3. Implementar el handler `MOVE_TASK`, validar `targetColumnId`, revalidar `canMoveTask` del
   principal delegado y resolver nombre/color antes de llamar al comando `task_move` existente.
4. Propagar actor, correlación y causación y tratar como `SKIPPED` una tarea ya ubicada en la
   columna destino.
5. Registrar logs por tarea expandida sin exponer el contenido sensible completo del pull
   request.

**Fuera de alcance**

No se procesan PR merged, closed, review ni commits. No se implementan correos o notificaciones
temporales.

**Pruebas**

- E2E vertical webhook → inbox → regla → cola → `task_move` → historial de tarea.
- Título, descripción, cada formato de referencia, múltiples tareas y referencias duplicadas.
- Repositorio o proyecto ajeno, conexión inactiva, columna inválida y tarea eliminada.
- Permiso `canMoveTask` presente, revocado y proyecto suspendido.
- Repetición de webhook, evento y job; tarea ya en destino.
- Fallas temporales del servicio de tareas frente a errores terminales.

**Criterios de finalización**

- Un PR válido mueve cada tarea referenciada del mismo proyecto como máximo una vez.
- Ninguna referencia de otro proyecto revela o muta la tarea.
- Perder `canMoveTask` pausa la regla y no ejecuta el comando.
- Las redeliveries y el estado ya alcanzado son idempotentes y auditables.
- La ejecución inicia en menos de 10 segundos p95 en el ambiente de aceptación.

### Bloque 9 — Programación de vencimientos y recordatorio por correo

**Objetivo**

Enviar una sola vez a cada responsable actual el recordatorio de una tarea próxima a vencer,
manteniendo la programación correcta ante cambios de la tarea y caídas del sistema.

**Dependencias**

Bloques 3 a 5.

**Implementación**

1. Implementar `TASK_DUE_SOON`, `leadTimeMinutes`, expansión por responsables actuales y el
   handler de correo descrito en [Tarea próxima a vencer → correo](#tarea-próxima-a-vencer--correo).
2. Crear/reprogramar/cancelar `ScheduledOccurrence` al recibir created, due-date-changed,
   assignees-changed, completed, reopened y deleted.
3. Hacer backfill al habilitar la regla, incluida la ejecución única inmediata dentro de la
   ventana y la omisión de tareas ya vencidas.
4. Resolver usuarios con `user_find_by_ids` justo antes del envío y descartar destinatarios que
   ya no apliquen.
5. Reutilizar Resend con `actionExecutionId` como `Idempotency-Key`, conservando la unicidad
   permanente en PostgreSQL.

**Fuera de alcance**

No se agregan plantillas de usuario, calendarios, zonas horarias avanzadas, resúmenes semanales ni
escalamiento de tareas vencidas.

**Pruebas**

- Reloj controlado para ventana, tarea vencida, fecha retirada/cambiada, completar, reabrir,
  eliminar y cambiar responsables.
- Backfill con tareas fuera, dentro y después de la ventana.
- Un `ActionExecution` por correo actual y deduplicación de responsables.
- Redelivery de evento/job y reintento después de 24 horas sin duplicar correo.
- `429`, timeout y `5xx` de Resend frente a correo inválido/usuario inexistente.
- Reconciliación tras borrar un delayed job o reiniciar Redis.

**Criterios de finalización**

- Cada destinatario válido recibe como máximo un recordatorio por ocurrencia.
- Cualquier cambio relevante deja en DB y BullMQ la misma programación efectiva.
- El reconciliador restaura trabajos perdidos desde `ScheduledOccurrence`.
- Las tareas vencidas antes de habilitar se omiten y las que ya están en ventana se procesan una
  sola vez.
- Las ejecuciones ocurren dentro de ±60 segundos del instante programado en aceptación.

### Bloque 10 — Tareas estancadas y notificación al project manager

**Objetivo**

Notificar a los project managers actuales cuando una tarea permanece sin moverse durante el
periodo configurado, sin que ediciones irrelevantes reinicien el reloj.

**Dependencias**

Bloques 3 a 5.

**Implementación**

1. Implementar `TASK_STALE` con siete días por defecto y duración configurable.
2. Derivar el punto inicial del último `TaskEvent` `CREATED` o `MOVED`, nunca de `updatedAt`, y
   mantener ocurrencias ante move, completed, reopened y deleted.
3. Implementar selectores por miembro y rol; resolver membresías actuales al ejecutar,
   deduplicar personas y excluir a quienes abandonaron el proyecto o cuyo rol dejó de existir.
4. Agregar `TASK_STALE` a `NotificationType` y llamar a `notification_create` para conservar
   bandeja y SSE.
5. Marcar `SKIPPED` sin reintento cuando no existan destinatarios válidos.

**Fuera de alcance**

No se implementa detección de riesgo por comentarios, reasignación automática, escalamiento de
tareas vencidas ni canales Slack/Teams.

**Pruebas**

- Historia con created/moved frente a cambios de título, descripción, asignados y `updatedAt`.
- Movimiento, completar, reabrir, eliminar y reconciliación tras caída.
- Selectores de miembro/rol, miembro con dos coincidencias, miembro removido y rol eliminado.
- Cero destinatarios como `SKIPPED` y fallo temporal de notification-service como reintentable.
- Integración `notification_create` y regresión del SSE, verificando que el interceptor no
  envuelva eventos SSE.

**Criterios de finalización**

- Solo `CREATED`/`MOVED` determinan la antigüedad de estancamiento.
- Cada PM aplicable recibe una notificación persistente como máximo una vez por ocurrencia.
- Cambios de membresía y rol se reflejan al ejecutar, no mediante destinatarios congelados.
- Sin PM válido no se reintenta indefinidamente.
- La notificación aparece tanto en bandeja como en el flujo SSE esperado.

### Bloque 11 — Integración completa, plantillas MVP y regresión

**Objetivo**

Validar el funcionamiento conjunto de todos los bloques, cerrar documentación y observabilidad y
dejar el MVP listo para una liberación controlada.

**Dependencias**

Bloques 1 a 10.

**Implementación**

1. Agregar las plantillas opt-in del MVP para los tres casos de uso sin habilitar reglas por
   defecto ni introducir nuevos tipos de automatización.
2. Completar Swagger, documentación operativa de GitHub, rotación de secretos, recuperación de
   outbox/inbox/colas, dead letter, métricas y runbooks.
3. Validar la purga por proyecto y la sanitización transversal de APIs, logs, errores y trazas.
4. Ejecutar escenarios conjuntos con caídas de Redis, automation-service, servicios de dominio y
   Resend, además de redeliveries de GitHub.
5. Confirmar compatibilidad con permisos, proyectos suspendidos/eliminados, notificaciones SSE y
   todos los flujos existentes del monorepo.
6. Medir los objetivos de latencia: acciones inmediatas bajo 10 segundos p95 y programadas dentro
   de ±60 segundos.

**Fuera de alcance**

No se implementa ninguna capacidad de [Automatizaciones adicionales](#automatizaciones-adicionales),
la UI autoservicio ni los elementos indicados en [Alcance posterior al MVP](#alcance-posterior-al-mvp).
Los hallazgos que requieran nuevas funciones se documentan como trabajo posterior, salvo defectos
que impidan cumplir las especificaciones ya definidas.

**Pruebas**

- Suites E2E específicas de permisos, reglas, instalación/callback/webhook GitHub, los tres
  triggers, idempotencia y recuperación.
- Casos de seguridad y aceptación enumerados en [Criterios globales de aceptación](#criterios-globales-de-aceptación).
- `pnpm e2e:regresion` y `pnpm e2e:seguridad` según la política vigente de marcadores.
- Pruebas de caos controladas para dependencias caídas y recuperación sin duplicados.
- Pruebas de carga/latencia suficientes para medir los dos SLO del MVP.

**Criterios de finalización**

- Todos los criterios globales tienen evidencia reproducible y están asociados a una prueba o
  verificación documentada.
- Las suites de regresión permanecen verdes y las pruebas de seguridad nuevas pasan.
- El sistema se recupera de las fallas contempladas sin perder hechos ni duplicar acciones.
- Los runbooks permiten instalar la App, registrar una conexión, inspeccionar una ejecución y
  recuperar trabajos sin editar datos manualmente.
- Los objetivos de latencia se cumplen en el ambiente de aceptación.

### Mapa de cobertura y orden

| Especificación autoritativa | Primer bloque que la implementa o verifica |
|---|---|
| Permisos, jerarquía y guard OR | 1 |
| Servicio TCP 3008, Prisma/Redis y operación base | 2 |
| Sobre de eventos, outbox, stream, inbox y recuperación | 3 |
| Modelos y API de reglas; validación; purga de proyecto | 4 |
| Logs, snapshots, colas, reintentos, idempotencia y reconciliación | 5 |
| Clave pública y resolución segura de tareas | 6 |
| Instalación asistida, `installationId`, conexión y webhook público | 7 |
| PR abierto y `MOVE_TASK` | 8 |
| Vencimiento próximo y correo | 9 |
| Estancamiento y notificación al PM | 10 |
| Plantillas opt-in, observabilidad, SLO y regresión conjunta | 11 |

El orden separa persistencia, transporte y ejecución antes de conectar efectos externos. Los
Bloques 9 y 10 son independientes entre sí una vez terminados los Bloques 3 a 5, por lo que
pueden desarrollarse en ramas separadas después de estabilizar esa base. El Bloque 8 sí requiere
la referencia de tarea y el ingreso GitHub; por eso no puede adelantarse. El Bloque 11 es siempre
el punto de integración final, incluso si 9 y 10 se desarrollan en paralelo.

## Alcance posterior al MVP

Quedan explícitamente para fases posteriores:

- UI autoservicio para reglas, conexiones, ejecuciones y dead letter.
- OAuth o vinculación de identidades si una capacidad futura requiere identidad GitHub↔PRAXIS.
- Triggers para PR merged, closed, reviews y otros eventos GitHub.
- Condiciones `OR`, grupos anidados y un lenguaje de expresiones más amplio.
- Calendarios laborales y tratamiento avanzado de zonas horarias.
- Acciones hacia Slack o Teams.
- Operación avanzada de dead letter, replay masivo y herramientas de soporte.
- Sustitución de Redis Streams por un broker dedicado solo si volumen y operación lo justifican.

## Automatizaciones adicionales

Estas propuestas no forman parte del MVP. Cada una responde a un problema concreto; la etiqueta
`core` indica una extensión natural respaldada por datos y comandos existentes, mientras que
`especulativa` requiere validar demanda, semántica o calidad de datos antes de diseñarla.

| Clasificación | Automatización | Caso de uso real que la justifica |
|---|---|---|
| **core** | PR fusionado → mover tarea a terminada | El equipo ya usa el estado del PR como evidencia de integración y hoy debe cerrar manualmente la tarea referenciada. |
| **core** | PR cerrado sin merge → regresar o avisar | Una tarea puede quedar en revisión aunque el cambio haya sido descartado; el equipo necesita recuperar esa excepción. |
| **core** | Tarea vencida → escalar | Un recordatorio previo no resuelve el incumplimiento; responsable y PM necesitan distinguir una fecha ya incumplida. |
| **core** | Miembro retirado con tareas asignadas → avisar | Al remover a una persona pueden quedar tareas huérfanas que no aparecen en su flujo habitual. |
| **core** | Tarea urgente sin responsable → avisar | Una prioridad alta sin dueño representa trabajo crítico que nadie ha aceptado. |
| **core** | Resumen semanal de reportes → correo | Los PM revisan periódicamente avance y bloqueos; un digest reduce la consulta manual repetitiva. |
| **especulativa** | Checklist completada → mover tarea | Solo es correcta si todos los proyectos interpretan la checklist completa como fin de etapa; esa convención debe validarse. |
| **especulativa** | Crear tareas recurrentes | Algunos equipos repiten ceremonias o mantenimiento, pero falta definir calendario, ownership y comportamiento ante cambios. |
| **especulativa** | Autoasignar por carga o experiencia | Busca reducir reparto manual, pero exige datos confiables y reglas de equidad que PRAXIS todavía no modela. |
| **especulativa** | Detectar riesgo por comentarios | Podría anticipar bloqueos, pero requiere clasificación probabilística, consentimiento y manejo de falsos positivos. |

## Criterios globales de aceptación

Los bloques asignan cada criterio a la primera entrega donde puede comprobarse; el Bloque 11 los
repite como regresión conjunta.

### Permisos y aislamiento

- Un usuario con `canManageAutomations` y sin `canManageIntegrations` puede usar una conexión
  activa en una regla, pero no crearla ni desconectarla.
- Un usuario con `canManageIntegrations` y sin `canManageAutomations` puede conectar o
  desconectar, pero no crear ni editar reglas.
- `canManageRoles` concede ambos permisos; un colaborador ordinario no recibe ninguno.
- El estado suspendido del proyecto bloquea configuración y ejecución.
- Una acción nunca se ejecuta si el principal delegado perdió el permiso requerido.

### Instalación y webhook GitHub

- Un `state` expirado, repetido, alterado o desconocido no registra instalaciones.
- Un `installationId` válido que no tenga acceso al repositorio solicitado se rechaza.
- Una firma inválida, payload alterado, delivery repetido o repositorio ajeno no produce una
  acción.
- Retirar un repositorio desde GitHub desconecta y pausa sus reglas dependientes.
- Desconectarlo desde PRAXIS no desinstala la App ni afecta otros repositorios.
- La ruta pública efectiva es `POST /api/webhooks/github` y no depende de JWT, cookie o proxy
  frontend.

### Durabilidad, idempotencia y recuperación

- Repetir un evento, webhook o job crea una sola ejecución lógica y como máximo una acción por
  target.
- Las caídas de Redis, automation-service, Resend o un microservicio producen reintento o dead
  letter según la clasificación especificada, sin pérdida silenciosa.
- Los mensajes sin confirmar se recuperan y las ocurrencias programadas se reconstruyen desde
  PostgreSQL.
- Logs y errores permiten explicar cada decisión sin exponer secretos.

### Comportamiento funcional

- Un PR abierto solo mueve tareas referenciadas del proyecto conectado y respeta `canMoveTask`.
- Cambiar o quitar `dueDate`, completar, reabrir, reasignar o eliminar una tarea actualiza la
  programación y los destinatarios del recordatorio.
- El estancamiento se calcula con `TaskEvent`, no con `updatedAt`.
- Destinatarios por rol/miembro se resuelven al ejecutar y se deduplican.
- El correo próximo a vencer no se duplica y la notificación de estancamiento queda persistida y
  llega por SSE.

### Calidad y operación

- Las suites de integración, webhook y seguridad nuevas pasan junto con
  `pnpm e2e:regresion` y la política vigente de `pnpm e2e:seguridad`.
- Las acciones inmediatas comienzan en menos de 10 segundos p95.
- Las acciones programadas se disparan dentro de ±60 segundos de su instante previsto.
- Existe documentación reproducible para instalar, conectar, auditar, recuperar y rotar secretos
  sin editar manualmente la base de datos.

## Supuestos vigentes

- La UI de automatizaciones no forma parte del MVP; se usarán API y Swagger.
- Un operador de plataforma crea y mantiene una GitHub App por ambiente.
- El solicitante de PRAXIS necesita `canManageIntegrations`; la persona que completa la
  instalación necesita autoridad suficiente en GitHub.
- Las reglas y APIs nunca almacenan ni devuelven secretos.
- “Project manager” se expresa mediante selectores de miembros o roles del proyecto, no mediante
  un nombre de rol codificado.
- El umbral de estancamiento es configurable y su default es siete días.
- Se reutilizan PostgreSQL, Redis 7, BullMQ y Resend conforme a las decisiones anteriores.
