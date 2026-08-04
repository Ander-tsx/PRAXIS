# Sistema de permisos

El sistema tiene dos capas completamente independientes que no se mezclan entre sí.

---

## Capa 1 — Roles globales

Define qué puede hacer una persona dentro de la **plataforma completa**.

Son tres, **con jerarquía**:

| Rol | Nivel | Descripción |
|---|---|---|
| `SuperAdmin` | 2 | Administra la plataforma, **incluidos los demás administradores** |
| `Admin` | 1 | Administra la plataforma. No puede tocar a otros administradores |
| `User` | 0 | Trabaja en sus proyectos. Sin acceso al panel |

Los literales son exactamente esos, en PascalCase. Antes eran dos (`admin`, `user`) y el
guard comparaba contra el literal `'Admin'`, lo que **dejaba fuera al SuperAdmin**.

### ⚠️ Una cuenta sin rol es `User`, no «sin nivel»

`POST /auth/register` **no asigna ningún rol**, así que la mayoría de las cuentas reales
no tienen ni una fila en `user_roles`. Una lista vacía se trata como `User`: es el caso
mayoritario, no un caso raro.

Los nombres desconocidos **se ignoran** al calcular el nivel. `permissions.roles` es una
tabla abierta, y si un nombre inventado subiera de nivel, un `INSERT` sería una escalada
de privilegios.

### La regla: se actúa hacia abajo

Solo se administran cuentas de nivel **estrictamente inferior** al propio, y nunca la
propia. Un Admin no puede suspender ni degradar a otro Admin; un SuperAdmin sí.

El rol global es **privado**: no se enseña en el directorio de usuarios ni en la lista de
miembros de un proyecto. Cada quien ve el suyo, y el panel ve los de todos. De ahí que
`suspendedBy` no salga por ninguna ruta de usuario — diría qué cuenta es administradora.

Este rol lo consulta el **gateway** antes de dejar pasar ciertas peticiones:

```
¿Quieres entrar al panel de administración?
→ Gateway pregunta a permissions-service: ¿qué roles tiene este userId?
→ Nivel insuficiente → 403 "Se requiere el rol global: Admin"
→ Suficiente (Admin o SuperAdmin) → pasa
```

---

## Capa 2 — Roles internos de proyecto

Define qué puede hacer una persona dentro de **un proyecto específico**.

Estos roles los crea el administrador de cada proyecto (no el admin global). Ejemplos: Scrum Master, Dev, QA. Cada proyecto tiene sus propios roles y no se comparten entre proyectos.

A cada rol se le asignan permisos concretos:

| Permiso | Descripción |
|---|---|
| `canViewProject` | Ver el proyecto y su contenido. **Es el suelo de la jerarquía**: todos los demás lo implican |
| `canCreateTask` | Puede crear tareas |
| `canMoveTask` | Mover una tarea de columna **sin poder tocar su contenido** |
| `canEditTask` | Puede editar tareas |
| `canDeleteTask` | Puede eliminar tareas |
| `canComment` | Comentar en una tarea |
| `canCreateBoard` | Puede crear tableros |
| `canEditBoard` | Puede editar tableros |
| `canDeleteBoard` | Puede eliminar tableros |
| `canCreateColumn` | Puede agregar columnas a un tablero |
| `canEditColumn` | Renombrar y recolorear columnas |
| `canDeleteColumn` | Puede eliminar columnas |
| `canManageLabels` | Crear, renombrar y borrar las etiquetas del proyecto |
| `canManageMembers` | Puede agregar o quitar personas del proyecto |
| `canManageRoles` | Puede crear roles y modificar sus permisos |
| `canEditProject` | Cambiar el nombre y la descripción del proyecto |
| `canViewReports` | Ver los informes **y preguntarle al asistente** sobre el proyecto |
| `canDeleteProject` | Eliminar el proyecto entero |

Los permisos se asignan por rol, no por persona. Si cambias el permiso de un rol, afecta a todos los miembros que tienen ese rol en ese proyecto.

Los tres primeros de grano fino —`canViewProject`, `canMoveTask`, `canComment`— existen
porque sin ellos **un perfil de solo lectura era imposible de representar**: ver un
proyecto exigía `canEditBoard`, mover una tarjeta a «Hecho» exigía poder reescribir la
tarea, y comentar exigía editarla. Quien ejecuta el trabajo tiene que poder decir que lo
terminó sin poder redefinir en qué consistía.

Solo `canViewProject` y `canViewReports` son de **lectura**; todo lo demás escribe. Esa
distinción es la que usa la suspensión de proyectos (abajo), y vive declarada en
`READ_ONLY_PROJECT_PERMISSIONS` dentro de `@praxis/contracts`.

---

## Cómo interactúan las dos capas

Son independientes. Tener un rol global **no otorga permisos dentro de un proyecto**. Un administrador de la plataforma que no es miembro de un proyecto no puede crear tareas ahí, y está bien que sea así.

**Ejemplo:**

```
Persona A — rol global: Admin
  └── Proyecto X — rol interno: Dev
        └── puede: canCreateTask, canEditTask
        └── no puede: canDeleteTask, canManageMembers

Persona B — rol global: User
  └── Proyecto X — rol interno: Scrum Master
        └── puede: todos los permisos excepto canManageRoles
  └── Proyecto Y — rol interno: Dev
        └── puede: canCreateTask solamente
```

### El panel de administración no es una excepción a esto

Podría parecerlo: `/api/admin/projects` deja ver **cualquier** proyecto y suspenderlo. No
es un atajo a `ProjectPermissionGuard` sino **otra puerta**: una proyección
administrativa de solo lectura, más las acciones de estado, servida bajo el rol global. El
administrador no gana `canEditTask` por mirar.

De ahí una consecuencia que se ve en la interfaz: **el panel no enlaza a
`/projects/<slug>`**. Ese enlace le daría 403 a quien no sea miembro y parecería roto.

---

## Capa 0 — El estado del proyecto

Antes de las dos capas hay una pregunta anterior: **si el proyecto acepta cambios**.

| Estado | Quién lo ve | Qué se puede hacer |
|---|---|---|
| `ACTIVE` | dueño y miembros | lo que digan las dos capas |
| `SUSPENDED` | dueño y miembros, **entero** | solo leer: `canViewProject`, `canViewReports` |
| `DELETED` | solo el panel de administración | nada; el resto responde **404** |

Lo pone y lo quita quien administra la plataforma, y **no es** el `DELETE /projects/:id`
del dueño (ese cascadea, purga tareas en otro microservicio y no se deshace). Los dos
estados se deshacen.

No es autorización, y por eso es «capa 0»: no depende de quién eres. Se comprueba en
`ProjectPermissionGuard`, que ya resuelve el proyecto de cada petición, así que **una
comprobación cubre de golpe** tareas, columnas, comentarios, adjuntos, miembros, roles,
etiquetas e informes, sin tocar ninguno de los servicios.

### ⚠️ El orden importa: el estado va antes del bypass del dueño

Si se comprobara después, el dueño —que es justo la persona a la que se le suspendió el
proyecto— seguiría pudiendo hacer de todo, y la suspensión solo afectaría a los demás
miembros. Lo mismo en `permissions/me`: el mapa se recorta **después** de aplicar el
bypass, no antes.

### El motivo se guarda en el proyecto, no solo en la auditoría

`Project.suspendedReason` vive en la tabla porque el registro de actividad es admin-only:
si el motivo estuviera solo allí, el dueño vería un proyecto donde nada funciona y ni una
palabra que lo explique, y cada botón fallaría en silencio.

Y por eso el 403 lleva el código **`PROJECT_SUSPENDED`** en vez del `FORBIDDEN` genérico:
un 403 de permisos se arregla pidiéndoselos a quien administra el proyecto, y este no se
arregla. Sin distinguirlos, el dueño de un proyecto suspendido se pone a pedirse permisos
a sí mismo.

---

## Flujo completo de una petición protegida

Ejemplo: **crear una tarea en un tablero**

```
1. Cliente envía:
   POST /api/boards/:boardId/tasks
   Authorization: Bearer <token>
   Body: { title, columnId, status, ... }        ← NUNCA projectId: mandarlo da 400

2. Gateway — JwtGuard
   → Verifica el token
   → Extrae userId del JWT

3. Gateway — ProjectPermissionGuard
   → Identifica qué proyecto contiene ese boardId  (y lo deja en request.projectId)
   → Pregunta a projects-service por el proyecto (una sola vez, sirve para 3a y 3b)

   3a. ¿Está ACTIVE?
       → DELETED   → 404, para todos, dueño incluido
       → SUSPENDED → ¿el permiso pedido es de lectura?
                        no → 403 code PROJECT_SUSPENDED, con el motivo
       → ACTIVE    → sigue

   3b. ¿Es el dueño? → sí → pasa (bypass)         ← después de 3a, nunca antes

   3c. Pregunta a projects-service:
       "¿el userId tiene permiso canCreateTask en este proyecto?"
       → projects-service verifica:
           i.   ¿Es miembro del proyecto? → sí
           ii.  ¿Qué rol interno tiene? → Dev
           iii. ¿Dev tiene canCreateTask, ya expandido por jerarquía? → sí
       → Devuelve { allowed: true }

4. Gateway
   → allowed: true → reenvía la petición a tasks-service, con el projectId resuelto

5. tasks-service
   → Crea la tarea directamente, sin volver a verificar permisos
   → Devuelve la tarea creada al gateway → al cliente
```

Si en el paso 3c el usuario no es miembro del proyecto, o su rol no tiene el permiso
requerido, el gateway devuelve `403 FORBIDDEN` y la petición nunca llega a
`tasks-service`.

⚠️ **El `projectId` lo resuelve el guard desde la ruta, no lo manda el cliente.** Estuvo al
revés, y mientras lo elegía el cliente era un bypass completo: declarar un proyecto propio
daba acceso a las tareas de cualquier otro.

---

## Dónde vive cada cosa en el código

```
permissions-service                                  (TCP 3002 — no «roles-service»)
├── Roles globales: SuperAdmin, Admin, User
├── Asignación de rol global a usuarios
└── Registro de actividad administrativa (solo-añadir)

projects-service/src/project-roles/                  (TCP 3003)
├── Roles internos por proyecto (Scrum Master, Dev, QA...)
├── Permisos por rol (canCreateTask, canEditTask...)
├── Jerarquía implícita: expandPermissions()
├── Recorte por estado del proyecto: recortarPorEstado()
└── Verificación: dado userId + projectId + permiso → ¿allowed?

projects-service/src/projects/
├── project-status.guard.ts  → exigirProyectoActivo(), para las 3 rutas sin permiso
└── projects.service.ts      → setStatus(), findAllForAdmin(), findOneForAdmin()

commons/contracts/src/
├── roles/project-permission.enum.ts   → el catálogo de permisos
├── admin/admin-project.dto.ts         → ProjectStatus, READ_ONLY_PROJECT_PERMISSIONS,
│                                        PROJECT_SUSPENDED_CODE
└── admin/admin-action.dto.ts          → AdminActionType, AdminTargetType

gateway/src/common/guards/
├── global-role.guard.ts        → consulta permissions-service (rutas de /admin)
└── project-permission.guard.ts → consulta projects-service, y aplica el estado

gateway/src/admin/
├── admin-users.controller.ts     → cuentas
├── admin-activity.controller.ts  → registro
├── admin-projects.controller.ts  → inventario y estado
└── admin-activity.recorder.ts    → escribe el registro, siempre después del hecho
```

---

## Resumen de decisiones

- **Una cuenta sin rol es `User`** — el registro no asigna ninguno, así que es el caso mayoritario, no una excepción
- Los roles globales son tres, tienen jerarquía y no son configurables
- Se administra **hacia abajo**: solo cuentas de nivel estrictamente inferior, nunca la propia
- El rol global es **privado**: cada quien ve el suyo, y el panel ve los de todos
- Los roles internos son creados y configurados por el administrador de cada proyecto
- Los permisos internos se asignan por rol, nunca por persona individual
- Las dos capas son independientes — una no implica la otra, **y el panel de administración tampoco es una excepción**
- La autorización ocurre siempre en el gateway, nunca dentro de los servicios de negocio

### ⚠️ La última regla tiene tres excepciones, y son a propósito

Aceptar una invitación, rechazarla y salir de un proyecto **no declaran ningún permiso**,
así que no pasan por `ProjectPermissionGuard`. El estado del proyecto se comprueba dentro
de projects-service (`exigirProyectoActivo`) para esas tres.

No contradice la regla: lo que se comprueba ahí no es autorización —no depende de quién
eres— sino el estado del propio proyecto. Ponerlo en el gateway habría exigido resolver el
proyecto desde el id de la invitación con un salto de red extra y una copia de la
resolución que ya vive en el servicio.

⚠️ **Una ruta nueva que escriba sin declarar permiso volvería a abrir el agujero.** El
`canActivate` del guard devuelve `true` en la primera línea si el handler no declara
ninguno, así que se salta también la comprobación de estado.