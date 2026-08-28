# PRAXIS — Contrato de API para el frontend

> Extraído leyendo los controladores del gateway y los servicios, **no** de la documentación.
> Fuente: `apps/backend/gateway/src/**` + `apps/backend/commons/contracts/src/**` (commit `ae01766`).
> La sección «Administración» se añadió después, verificada petición a petición contra
> el backend en marcha (rama `feature/administracion-global`).
> Swagger vivo: `http://localhost:3000/api/docs`

---

## Reglas globales

- **Prefijo:** todo cuelga de `/api` (`app.setGlobalPrefix('api')`). Gateway en `:3000`.
- **Auth:** `Authorization: Bearer <accessToken>` en todo excepto `/auth/login`, `/auth/register`, `/auth/refresh`.
- **Rate limit:** 100 req / 60 s (`ThrottlerModule`).
- **Validación:** `whitelist: true` + `forbidNonWhitelisted: true` → **enviar un campo de más devuelve 400**. No mandes propiedades que el DTO no declare.

### Sobre de respuesta — éxito

```jsonc
{ "success": true, "data": <payload>, "meta": {} }
```

### Sobre de respuesta — error

```jsonc
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | CONFLICT |
             UNPROCESSABLE_ENTITY | INTERNAL_SERVER_ERROR | BAD_GATEWAY | HTTP_ERROR
             | <código de dominio>",
    "message": "…",
    "details": {}          // en errores de validación: { "errors": ["…", "…"] }
  }
}
```

En validación fallida el `message` es literalmente `"Validation failed"` y los mensajes útiles están en `details.errors`.

#### `code` puede ser de dominio, no solo la familia del status

Lo normal es que se derive del número HTTP —los ocho literales de arriba—, pero un
caso concreto puede traer el suyo cuando **el status no basta para saber qué hacer**.
Hoy hay uno: **`PROJECT_SUSPENDED`** (ver «Administración»), un 403 que no se arregla
pidiendo permisos. Al leer errores, compara contra el `code` y deja un `default` para
lo desconocido; no asumas que un 403 siempre es de permisos.

⚠️ Esto estuvo roto hasta `standard-exception.filter.ts` de esta sesión: el filtro
derivaba el código del status **siempre** y se comía el explícito en sus dos ramas
—`HttpException` lo ignoraba, y en la de `RpcException` se miraba `statusCode` antes
que `code`, que como todos los `RpcException` del repo lo llevan, hacía la rama
inalcanzable—. Si ves un `FORBIDDEN` donde el backend dice mandar otra cosa, es esto.

### ⚠️ Reglas que rompen cosas si se olvidan

1. **Ninguna ruta de tarea o checklist acepta `projectId` en el body.** Es al revés de como estuvo: el guard lo resuelve desde la ruta y mandarlo responde `400 "property projectId should not exist"`. Se quitó porque, mientras lo elegía el cliente, bastaba con declarar el id de un proyecto propio para leer, editar y borrar tareas de un proyecto ajeno (PENDIENTES-BACKEND §9).
2. **Al mover una tarea manda `columnId` Y `status` coherentes.** `status` es un string que debe igualar el **nombre** de la columna destino, no su id. Quien mueva necesita la correspondencia nombre ↔ id; en la interfaz la resuelve `BoardColumns`, que ya tiene las columnas.
   El mismo hecho por el otro lado: **renombrar una columna cambia el `status` de sus tareas**, y lo hace el backend en cascada. Ver «Columns».
3. Solo el `ownerId` del proyecto hace bypass de permisos. El rol global **no** concede permisos dentro de proyectos ajenos, y sigue siendo cierto con el panel de administración: quien administra la plataforma no gana `canEditTask` en ningún sitio. Lo que tiene es **otra puerta** —`/api/admin/projects`, solo lectura y suspensión— que no pasa por `ProjectPermissionGuard`. Por eso el panel no enlaza a `/projects/<slug>`: ese enlace le daría 403 y parecería roto.
4. **Un 403 puede no ser de permisos.** Si el proyecto está suspendido, todas las escrituras dan 403 con `code: 'PROJECT_SUSPENDED'` aunque tengas el permiso, y al dueño también. Ver «Administración».

---

## Auth — `/api/auth` · público

| Método | Ruta | Body | `data` de respuesta |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ userId, accessToken, refreshToken }` |
| POST | `/auth/register` | `{ email, password }` → 201 | `{ userId, accessToken, refreshToken }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ accessToken }` |
| POST | `/auth/logout` 🔒 | — | `{ success: true }` |

- `password`: 8–64 caracteres. `email`: formato válido.
- **No acepta `firstName`/`lastName` en el registro.** El perfil se crea con nombre vacío.
- Email duplicado → `409` con `message: "El email ya está registrado"`.
- Cuenta no `ACTIVE` → `403 "Cuenta suspendida o inactiva"`.
- JWT: `{ sub: userId, iat, exp }`. Refresh token válido 7 días, sesión en Redis.

---

## Users — `/api/users` 🔒

| Método | Ruta | Entrada | Notas |
|---|---|---|---|
| GET | `/users` | query params | `page`, `limit`, `search`… |
| GET | `/users?ids=a,b,c` | query params | **Varios perfiles concretos, en una petición** |
| GET | `/users/me` | — | **Tu perfil**, resuelto desde el token |
| GET | `/users/:id` | — | Incluye `credential.email` |
| PATCH | `/users/:id` | `{ firstName?, lastName? }` | camelCase de entrada y de salida |
| DELETE | `/users/:id` | — | Borra usuario + credencial + sesión Redis |

`data` de listado: `{ items: User[], total: number }`.

✅ **`?ids=` resuelve varios perfiles de una vez**, y es lo que hay que usar
siempre que se tenga una lista de `userId` que poner cara: la bandeja de avisos,
el equipo de un proyecto, el chat, la rejilla de proyectos. Antes se pedía un
`GET /users/:id` **por persona**.

- Responde con **la misma forma que el listado** (`{ items, total }`): quien la
  consume no tiene que desenvolver dos formas según el parámetro que mandó.
- **No se pagina** y no se combina con `search`: si llegan los dos, mandan los
  ids. Tope de 200 (`FindUsersByIdsDto`).
- Un id que ya no exista **simplemente no sale**. No es un error, así que hay que
  tolerar que `items.length < ids.length` — es justo el caso de quien ya no está
  en el equipo.
- ⚠️ **No uses `?limit=100` para «traerte el directorio y cruzar en memoria».**
  Miente en cuanto la plataforma pasa de cien cuentas, y ya nos mordió tres
  veces: la bandeja decía «Alguien», la pestaña Equipo enseñaba UUID crudos.

```ts
User = { id, credentialId, firstName, lastName, avatarUrl, status, createdAt, updatedAt,
         credential: { email } }
status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
```

`GET /users/me` evita tener que sacar el `sub` del JWT: la sesión es una cookie
httpOnly y el navegador no puede abrirla.

`PATCH /users/:id` **entra en camelCase**, igual que sale. Aceptaba `first_name`
y devolvía `firstName`, así que devolverle el objeto que acababas de leer daba
**200 sin guardar nada**. Las claves viejas se siguen aceptando marcadas como
obsoletas.

---

## Permisos globales — `/api/permissions` 🔒

| Método | Ruta | Body | Requiere |
|---|---|---|---|
| GET | `/permissions` | — | Lista roles globales |
| POST | `/permissions/assign` | `{ userId, roleId }` | rol global `Admin` |
| DELETE | `/permissions/revoke` | `{ userId, roleId }` | rol global `Admin` |
| GET | `/permissions/user/:userId` | — | Roles de un usuario |
| POST | `/permissions/check` | `{ userId, roleName }` | → `{ hasRole: boolean }` |

Roles globales: **`SuperAdmin`, `Admin`, `User`**, con jerarquía. Eran solo dos y el
guard comparaba contra el literal `'Admin'`, que **dejaba fuera al SuperAdmin**.

⚠️ Estas rutas son las de bajo nivel sobre la tabla de roles. Para administrar cuentas
usa `/api/admin/users`, que aplica la jerarquía, exige un motivo y **deja constancia en
el registro de actividad**; `POST /permissions/assign` no hace ninguna de las tres cosas.

---

## Projects — `/api/projects` 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| POST | `/projects` | `{ name, description? }` | — (`ownerId` sale del token) |
| GET | `/projects` | query params (`page`, `limit`, `search`, `permission`…) | — |
| GET | `/projects/:idOrSlug` | — | `canViewProject` |
| PATCH | `/projects/:idOrSlug` | `{ name?, description? }` | `canEditProject` |
| DELETE | `/projects/:idOrSlug` | — | `canDeleteProject` |

- `name`: 2–100 chars, único **por dueño**. Repetirlo en tu propia cuenta da 409
  («Ya tienes un proyecto llamado X»); otro equipo puede llamar igual al suyo.

### ⚠️ `:idOrSlug` acepta las dos formas, pero **solo estas tres rutas**

`GET /projects/rediseno-del-panel` funciona igual que con el UUID: el
`ProjectPermissionGuard` traduce el slug antes de comprobar permisos. Un slug
que no existe da **404**, no 403.

**Todo lo que cuelga del proyecto sigue esperando el UUID** —
`/projects/:projectId/members`, `/tasks`, `/reports/*`, `/assistant/*`—. La
traducción se paga una vez, no en cada petición: la pantalla resuelve el
proyecto al entrar y a partir de ahí usa `project.id`.

`slug` es único **global** (a diferencia de `name`) porque quien resuelve una
URL puede ver proyectos de varios dueños. Los choques llevan sufijo: el segundo
"Sprint 1" del sistema es `sprint-1-2`.

⚠️ **Renombrar regenera el slug** y el anterior deja de resolver. No hay tabla
de slugs históricos: lo que no caduca nunca es el UUID, así que un enlace
copiado de la barra de direcciones antes de un renombrado se rompe, y uno con
el id no. Al renombrar desde la interfaz, la propia pantalla corrige la barra
con `replaceState`.
- `GET /projects` → `{ items, total }`, filtrado por **dueño o miembro**.
- `?permission=<clave>` estrecha el listado a los proyectos donde **tienes ese
  permiso**, ya expandido por jerarquía; el dueño pasa siempre, como en el
  guard. La clave tiene que ser una de `ProjectPermission` — cualquier otra da
  400. Existe para no pedir `/projects/:id/permissions/me` una vez por proyecto
  solo para descartar casi todos: hoy lo usa el selector de Reportes con
  `?permission=canViewReports`. El filtro entra en el `where`, así que `total` y
  la paginación cuentan lo que de verdad se puede ver.
- `GET /projects/:id` viene con todo el árbol embebido (ver abajo).

### `PATCH` exige `canEditProject`, no `canEditBoard`

Pedía `canEditBoard`, que es el permiso de otra cosa: renombrar el proyecto no
tiene nada que ver con editar uno de sus tableros. `canEditProject` entra
**implicado por `canEditBoard`**, así que ningún rol existente perdió capacidad
—el mismo movimiento que `canMoveTask`, `canComment` y `canDeleteProject`.

⚠️ **`name` es único por dueño, así que un `PATCH` puede dar 409 a medio texto.**
Si guardas mientras se escribe, hace falta debounce y hace falta que el conflicto
se enseñe **sin perder lo escrito**: el nombre a medias («Redis» camino de
«Rediseño») puede chocar con otro proyecto tuyo.

Un cuerpo vacío no describe ningún cambio: manda solo el campo que cambia.

### El árbol embebido de `GET /projects/:id`

```ts
Project = {
  id, name, description, ownerId, createdAt, updatedAt,
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED',   // estado administrativo, ver «Administración»
  suspendedReason: string | null,               // el texto que se le enseña al dueño
  suspendedAt: string | null,
  workspaces: [{ id, name, projectId, createdAt,
                 boards: [{ id, name, workspaceId, createdAt,
                            columns: [{ id, name, order, color, boardId }] }] }],   // ordenadas por `order`
  roles: ProjectRole[],
  _count: { members: number }
}
```

⚠️ **No trae `suspendedBy`**, y no es un olvido: es el id de quien administra la
plataforma, y el rol global es privado —devolverlo diría qué cuenta es
administradora—. Se omite en `GET /projects/:id` y en `GET /projects`. Quién actuó se
lee en `/admin/activity`, que ya está detrás del rol.

⚠️ **Un `DELETED` no llega aquí: responde 404.** Y `GET /projects` tampoco lo lista,
ni para su dueño. En la práctica, por estas rutas solo se ven `ACTIVE` y `SUSPENDED`.

Cacheado en Redis 5 min — un cambio puede tardar en reflejarse. **Suspender y archivar
invalidan esa clave**, así que el estado sí es inmediato; lo que puede ir con retraso
es un renombrado.

✅ **`GET /projects` (el listado) trae además `members`**: los **cuatro primeros**
miembros, solo su `userId`, ordenados por antigüedad.

```ts
members: [{ userId: string }]   // solo en el listado, máximo 4
```

Existe para pintar las caras del equipo en la rejilla sin pedir
`GET /projects/:projectId/members` una vez por tarjeta. Los nombres y las fotos
se resuelven aparte con **`GET /users?ids=`**, en una sola petición.

⚠️ **No es el equipo entero: el total sigue siendo `_count.members`.** Contar
`members.length` para saber cuánta gente hay da cuatro como mucho.

⚠️ **El detalle (`GET /projects/:id`) no lo trae.** Ahí los miembros van por su
propia ruta, con su rol y su fecha de entrada, que es lo que necesita la pestaña
de Equipo.

---

## Workspaces 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| GET | `/projects/:projectId/workspaces` | — | — |
| POST | `/projects/:projectId/workspaces` | `{ name }` | `canEditBoard` |
| GET | `/workspaces/:workspaceId` | — | — |
| PATCH | `/workspaces/:workspaceId` | `{ name }` | `canEditBoard` |
| DELETE | `/workspaces/:workspaceId` | — | `canDeleteBoard` |

`name` único dentro del proyecto. Borrar el proyecto cascadea a workspaces → boards → columnas.

---

## Boards 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| POST | `/workspaces/:workspaceId/boards` | `{ name }` | `canCreateBoard` |
| GET | `/workspaces/:workspaceId/boards` | — | — |
| GET | `/boards/:boardId` | — | — |
| PATCH | `/boards/:boardId` | `{ name }` | `canEditBoard` |
| DELETE | `/boards/:boardId` | — | `canDeleteBoard` |

---

## Columns 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| POST | `/boards/:boardId/columns` | `{ name, order, color? }` | `canCreateColumn` |
| PATCH | `/boards/:boardId/columns/reorder` | `{ columnIds: string[] }` | `canEditColumn` |
| PATCH | `/boards/:boardId/columns/:id` | `{ name?, color? }` | `canEditColumn` |
| DELETE | `/boards/:boardId/columns/:id` | — | `canDeleteColumn` |

```ts
Column = { id, name, order, color, boardId }
```

**No hay `GET` de columnas.** Se obtienen embebidas en `GET /projects/:id`.
`reorder` recibe el array completo de IDs en el orden nuevo.

### Color: token del sistema, y de la columna

`color` es un token del design system, igual que en las etiquetas:
`primary` · `accent` · `info` · `warning` · `error` · `success`. Un hex da 400
con la lista de válidos.

Si no se manda al crear, el backend lo reparte **por posición**, rotando entre
los cuatro primeros. Verde y rojo quedan fuera del reparto: el rojo se lee como
una alarma y el verde **significa algo** (ver abajo). A partir de ahí el color es
de la columna y **viaja con ella al reordenarla** — antes lo elegía la interfaz
por índice y moverla le cambiaba el color.

### 🟢 El verde es la columna de cierre

`success` no es solo un color: marca la columna donde el trabajo termina. Las
tareas que están ahí **dejan de contar como pendientes** en
`GET /me/tasks?excludeDone=true`.

Hacía falta porque el `status` de una tarea es el **nombre** de su columna, y ese
nombre lo elige cada proyecto —«Hecho», «Finalizado», «Cerrado», «Done»—, así que
no había forma de saber cuál termina el trabajo: una tarea acabada seguía
contando como pendiente.

⚠️ Es color y significado a la vez, decidido a sabiendas. No se puede tener una
columna verde que no cierre ni una de cierre de otro color. La alternativa limpia
es un campo `isFinal` aparte; el día que haga falta, es una columna más en la
tabla. **Si lo enseñas en una interfaz, dilo donde se elige el color.**

### ⚠️ Renombrar arrastra el `status` de las tareas

`Task.status` guarda el **nombre** de la columna, no su id, así que renombrar
dejaría el estado de todas sus tareas apuntando a un nombre que ya no existe.
El `PATCH` lo resuelve en cascada: si el cuerpo lleva `name`, el gateway avisa a
tasks-service (`task_restatus`) después de confirmar el cambio, y las tareas de
esa columna pasan al nombre nuevo.

Consecuencias para quien llama:

- **Manda solo el campo que cambias.** Un `color` suelto no dispara la cascada;
  mandar `name` sin necesidad provoca una llamada extra entre microservicios.
- Es **idempotente**: solo toca las filas cuyo `status` no coincide ya.
- Es **best-effort**: si tasks-service no responde, la columna ya se renombró y
  el `PATCH` devuelve 200. Se registra en el log del gateway y el siguiente
  renombrado lo cuadra.
- Un cuerpo **vacío** (`{}`) da `400 "No hay nada que cambiar…"`: no describe
  ningún cambio.

### ⚠️ Borrar una columna se lleva sus tareas

Igual que borrar un tablero, un espacio o un proyecto. Antes no: la tarea
conservaba `boardId` y `projectId`, así que seguía abriéndose por su ruta y
contando en «mis tareas», pero no se pintaba en ningún tablero porque su columna
ya no existía. Si la interfaz avisa de cuántas tareas se van, ese número es
real.

---

## Members 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| GET | `/projects/:projectId/members` | — | — |
| POST | `/projects/:projectId/members` | `{ userId, projectRoleId }` | `canManageMembers` |
| DELETE | `/projects/:projectId/members` | `{ userId }` | `canManageMembers` |

⚠️ Un proyecto recién creado **no tiene roles ni miembros**. Hay que crear un `ProjectRole` antes de poder añadir a nadie.

⚠️ **`POST /members` da de alta directamente**: la persona entra sin enterarse,
sin aceptar y sin estado «pendiente». **No es lo que usa la interfaz** — para
meter a alguien en un proyecto se manda una invitación (abajo), y el
`ProjectMember` lo crea el backend **al aceptarla**. Esta ruta sigue existiendo
para altas administrativas; si la usas, no lo llames «invitar».

Recibe un `userId`, no un correo. Para pasar de correo a `userId` hay que
traerse `GET /users` y buscar en el cliente, lo que solo encuentra a quien ya
tiene cuenta — sigue sin haber invitación por correo a alguien de fuera.

---

## Invitaciones 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| GET | `/projects/:projectId/invitations` | — | `canManageMembers` |
| POST | `/projects/:projectId/invitations` | `{ userId, projectRoleId }` → 201 | `canManageMembers` |
| DELETE | `/projects/:projectId/invitations/:id` | — | `canManageMembers` |
| GET | `/me/invitations` | — | solo `JwtGuard` |
| POST | `/me/invitations/:id/accept` | — | solo `JwtGuard` |
| POST | `/me/invitations/:id/reject` | — | solo `JwtGuard` |
| DELETE | `/projects/:projectId/membership/me` | — | solo `JwtGuard` — salir del proyecto |

**Esto sí es invitar.** Existe desde `a88e804` y es lo que usa la interfaz.
Antes solo estaba `POST /members`, que daba de alta a la persona sin avisarla.

El flujo: se envía la invitación con el rol que tendrá al entrar, queda
`PENDING`, y **el `ProjectMember` se crea al aceptar**. Mientras esté pendiente
no hay membresía y por tanto no hay permisos — no basta con estar invitado.

- **409** si esa persona ya es miembro o ya tiene una invitación pendiente. Solo
  se admite una viva por persona y proyecto; las resueltas se conservan como
  historial.
- Las de `/me` cuelgan de `/me` y **no llevan permiso de proyecto**: quien
  responde todavía no es miembro, así que no hay permiso que comprobar. El
  usuario sale del token, como en `/me/tasks`.
- Invitar y aceptar generan aviso (`INVITATION_RECEIVED`, `INVITATION_ACCEPTED`,
  `INVITATION_REJECTED`). Ver «Avisos».
- Filtra el directorio antes de enseñarlo: quien ya es miembro **y** quien tiene
  invitación sin responder no deberían salir como opción.

---

## Project Roles 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| POST | `/projects/:projectId/roles` | `{ name, permissions }` | `canManageRoles` |
| PATCH | `/projects/:projectId/roles/:id` | `{ name?, permissions? }` | `canManageRoles` |
| DELETE | `/projects/:projectId/roles/:id` | — | `canManageRoles` |

**No hay `GET` de roles.** Vienen en `GET /projects/:id` bajo `roles`.

`name`: 2–50 chars, único por proyecto. `permissions` es un objeto plano de booleanos:

```ts
{
  canViewProject?,
  canCreateTask?, canMoveTask?, canEditTask?, canDeleteTask?, canComment?,
  canCreateBoard?, canEditBoard?, canDeleteBoard?,
  canCreateColumn?, canEditColumn?, canDeleteColumn?,
  canManageLabels?, canManageMembers?, canManageRoles?,
  canManageAutomations?, canManageIntegrations?,
  canEditProject?, canViewReports?, canDeleteProject?
}
```

> `canEditColumn` **sí existe y sí se usa**: es el permiso de
> `PATCH /boards/:boardId/columns/:id` (renombrar y recolorear), su primer y
> único consumidor. `reorder` sigue pidiendo `canCreateColumn`
> (PENDIENTES-BACKEND §8).

### 🔴 `permissions` debe ser un diccionario de booleanos

`permissions` **tiene que ser el objeto de booleanos**. El gateway rechaza un
array, claves desconocidas o valores no booleanos con `400`. Los roles creados
antes de esa validación que conservan un array se normalizan al leer para no
dejarles permisos vacíos en silencio.

```ts
// ❌ 400
{ name: 'Colaborador', permissions: ['canEditBoard'] }

// ✅
{ name: 'Colaborador', permissions: { canEditBoard: true } }
```

Valida también en el cliente contra la lista de arriba para señalar el campo
antes de que el gateway responda.

### Jerarquía implícita — refléjala en la interfaz

Al evaluar, el backend expande los permisos hacia abajo
(`project-roles.service.ts`, `PERMISSION_HIERARCHY`):

| Si concedes | También concede |
|---|---|
| `canDeleteBoard` | `canEditBoard`, `canCreateBoard`, `canEditProject` |
| `canEditBoard` | `canCreateBoard`, `canEditProject` |
| `canDeleteColumn` | `canEditColumn`, `canCreateColumn` |
| `canEditColumn` | `canCreateColumn` |
| `canDeleteTask` | `canEditTask`, `canMoveTask`, `canComment`, `canCreateTask` |
| `canEditTask` | `canMoveTask`, `canComment`, `canCreateTask` |
| `canDeleteProject` | `canDeleteBoard`, `canEditBoard`, `canCreateBoard`, `canEditProject` |
| `canManageRoles` | `canManageAutomations`, `canManageIntegrations` |

`canManageMembers` no arrastra permisos adicionales.

`expandPermissions` itera hasta un punto fijo, por lo que las implicaciones son
transitivas y no dependen del orden de la tabla.

No hace falta guardar los implicados: el backend los deduce al comprobar. Pero
el formulario de roles **debe enseñarlo** —marcar "eliminar" implica "editar" y
"crear"— o el usuario creerá que está dando menos permiso del que da.

✅ **Hay permiso de lectura.** `canViewProject` es el suelo de la jerarquía
—cualquier permiso lo implica— y es lo que exige `GET /projects/:id`, así que un
rol de solo lectura se modela con él y nada más.

### `GET /projects/:projectId/permissions/me` — lo que puedes hacer aquí

Exige `canViewProject`, o sea que **cualquier miembro puede preguntarlo**, incluido
uno de solo lectura. Es la pieza que evita descubrir los permisos a base de 403.

```ts
{
  isOwner: boolean,
  permissions: Record<ProjectPermission, boolean>,   // mapa COMPLETO, los no concedidos en false
  projectStatus: 'ACTIVE' | 'SUSPENDED' | 'DELETED',
  suspendedReason: string | null
}
```

El mapa viene **ya expandido por jerarquía** y con todas las claves presentes: no hay
que distinguir «false» de «ausente».

⚠️ **En un proyecto suspendido llega recortado a `canViewProject` + `canViewReports`,
y al dueño también** —es justo la persona a la que se le suspendió el proyecto, así
que si el bypass de dueño sobreviviera al recorte la suspensión solo afectaría a los
demás—. El recorte **solo quita**: no concede `canViewReports` a quien no lo tenía.

Consecuencia práctica: una pantalla **no necesita mirar el estado** para dejar de
enseñar botones, porque el mapa ya lo dice. Lo que sí necesita el estado es para
**explicarlo** — un mapa vacío sin motivo parece que te han degradado de rol, y por eso
`projectStatus` y `suspendedReason` viajan aquí y no hay que cruzarlos con otra
petición (que además podría discrepar por la caché de 5 minutos del proyecto).

### Los permisos se cachean 5 minutos

`project:<projectId>:user:<userId>:permissions` en Redis, TTL 300s. Se invalida
al cambiar un rol y al añadir un miembro, así que el camino normal es
consistente; tenlo en cuenta si algo parece no aplicarse.

El recorte por estado **no pasa por esa caché**: se aplica al construir la respuesta,
sobre lo que salga de ella. Así suspender surte efecto en la siguiente petición y no
cuando expire el TTL.

---

## Tasks 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| POST | `/boards/:boardId/tasks` | ver abajo → 201 | `canCreateTask` |
| GET | `/boards/:boardId/tasks?columnId&page&limit` | — ✅ query params | `canViewProject` |
| GET | `/tasks/:id` | — | `canViewProject` |
| PATCH | `/tasks/:id` | `{ title?, description?, status?, columnId?, assigneeIds?, priority?, dueDate? }` | `canEditTask` |
| POST | `/tasks/:id/move` | `{ columnId, status?, order? }` | `canMoveTask` ⚠️ |
| POST | `/tasks/:id/assign` | `{ assigneeIds }` | `canEditTask` |
| DELETE | `/tasks/:id` | — | `canDeleteTask` |

⚠️ **Ninguna lleva `projectId`.** Lo resuelve el guard desde la ruta; mandarlo da 400.

### Mover no es editar

`POST /tasks/:id/move` es el único endpoint que pide **`canMoveTask`**. Existe
porque arrastrar una tarjeta a «Hecho» exigía `canEditTask`, que también deja
reescribir el título, cambiar la prioridad y reasignar a quien sea: quien ejecuta
el trabajo no podía decir que lo terminó sin poder redefinir en qué consistía.

La jerarquía dice `canEditTask → canMoveTask`, así que ningún rol pierde nada.

⚠️ `PATCH /tasks/:id` **también** acepta `columnId` y `status`, y sigue exigiendo
`canEditTask`. No es un agujero —quien edita puede mover por definición—, pero si
lo que quieres es solo mover, usa la ruta de mover.

### Encargados: `assigneeIds`, no `assigneeId`

`Task.assigneeId` **ya no existe**. Una tarea puede tener varios encargados y
viven en una tabla aparte. Mandar `assigneeId` da 400.

- `assigneeIds` es el conjunto **completo**: sustituye a los que hubiera, no
  añade. Es lo que hace un selector múltiple al cerrarse, y así repetir la
  llamada no acumula. `[]` desasigna a todo el mundo.
- En `PATCH`, **omitirlo** deja los encargados como estaban; mandarlo vacío los
  quita. No es lo mismo.
- Cada id tiene que ser **miembro del proyecto** (o el dueño). Si no:
  `400 "Esa persona no es miembro del proyecto"`. Saca la lista de
  `GET /projects/:id/members`.
- Máximo 20 por tarea.

La tarea sale con `assignees`, no con `assigneeIds`:

```ts
assignees: [{ id, taskId, userId, assignedBy, assignedAt }]
```

Son ids: tasks-service no conoce a los usuarios. El nombre lo resuelve la
interfaz contra los miembros del proyecto, que ya carga.

Body de creación:

```ts
{
  columnId,           // requerido
  title,              // 1–255
  status,             // requerido — debe coincidir con el nombre de la columna
  description?,
  assigneeIds?,       // string[] — encargados iniciales, miembros del proyecto
  dueDate?,           // ISO 8601
  priority?,          // 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' (default MEDIUM)
  order?,             // int ≥ 0
  parentTaskId?       // si viene → se crea como SUBTAREA. La interfaz NO lo manda nunca
}
```

`boardId`, `projectId` y `requesterId` los inyecta el gateway; **no los mandes** (`forbidNonWhitelisted` → 400).

⚠️ **`parentTaskId` no se usa desde la interfaz, y es una decisión, no un olvido.**
El backend soporta subtareas porque venían del modelo original del otro equipo;
el checklist ya cubre «partir una tarea en pasos» con mucha menos ceremonia. La
tarea sigue trayendo `subtasks` en la respuesta —siempre `[]`— y no se pinta en
ninguna pantalla. Ver ESTADO-ACTUAL §24.5.

```ts
Task = { id, title, description, status, boardId, columnId, reporterId,
         projectId, parentTaskId, dueDate, priority, order, createdAt, updatedAt,
         completedAt, assignees, subtasks, checklists }
```

### `completedAt`: cuándo se cerró

`null` mientras la tarea siga abierta. Se pone al entrar en una **columna de
cierre** (la verde) y **vuelve a `null`** si alguien la saca de ahí.

Lo resuelve el backend solo: quien mueve la tarea no manda nada extra. El gateway
mira el color de la columna destino y se lo dice a tasks-service, que es lo mismo
que ya hacía `excludeDone`.

⚠️ **Solo existe hacia adelante.** Las tareas que ya estaban en una columna verde
antes de que esto se implementara tienen `completedAt: null` y **no se pueden
rellenar**: nunca se guardó cuándo llegaron ahí. Una interfaz que las cuente como
«cerradas» debe seguir mirando el color de su columna, no este campo.

### El historial de la tarea

Cada movimiento, cierre, reapertura, asignación y cambio de prioridad queda
registrado con su fecha y su autor. **Todavía no hay endpoint que lo exponga**:
existe para alimentar la sección de Reportes. Detalle en ESTADO-ACTUAL §25.

Las cinco rutas que devuelven tareas traen **la misma forma**: `assignees` y
`checklists` siempre vienen, también en el listado del tablero. Así la interfaz no
tiene que saber de dónde salió cada tarea.

### 🔴 `GET /boards/:boardId/tasks` cachea sin la paginación en la clave

La respuesta se guarda en `tasks:board:<boardId>` durante 60 s, y **la clave no
incluye `page` ni `limit`**. Consecuencia directa, reproducida:

```
GET /boards/<id>/tasks?limit=1    → items: 1, total: 7   ← se cachea así
GET /boards/<id>/tasks?limit=100  → items: 1, total: 7   ← durante 60 s
```

**Pide siempre con el mismo `limit` que use el resto de la interfaz** (hoy 100).
Una petición con otro límite —típicamente `limit=1` para leer solo el `total`—
deja el tablero pintándose con una sola tarjeta por columna.

El `total` es un `count` aparte y **sí es correcto** en cualquier caso, así que
para contar sirve la respuesta de `limit=100`, que además comparte la entrada de
caché en vez de envenenarla.

⚠️ No está arreglado a propósito: la clave se invalida con `del` exacto en catorce
sitios de tasks-service, y meterle la paginación los dejaría todos sin efecto en
silencio. Ver ESTADO-ACTUAL §24.3.

`dueDate: null` en un `PATCH` quita la fecha límite.

---

## Etiquetas 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| GET | `/projects/:projectId/labels` | — | `canViewProject` |
| POST | `/projects/:projectId/labels` | `{ name, color }` → 201 | `canManageLabels` |
| PATCH | `/projects/:projectId/labels/:id` | `{ name?, color? }` | `canManageLabels` |
| DELETE | `/projects/:projectId/labels/:id` | — | `canManageLabels` |

```ts
Label = { id, projectId, name, color, createdAt }
```

- Son del **proyecto**, no del tablero: la misma etiqueta sirve en todos sus
  tableros.
- `color` es un **token del design system**, no un hex:
  `primary` · `accent` · `success` · `warning` · `error` · `info`. Cualquier
  otra cosa da 400 con la lista de válidos.
- `name` es único por proyecto: repetirlo da **409** con su mensaje.
- Borrarla la quita de todas las tareas que la llevaban (la relación cascadea).
  La respuesta trae `removedFrom` con cuántas eran.

Para poner etiquetas en una tarea se usa `labelIds` en crear y actualizar, con
la misma semántica que `assigneeIds`: **conjunto completo**, sustituye. Una
etiqueta de otro proyecto da `400 "Alguna etiqueta no existe o no es de este
proyecto"`.

La tarea sale con `labels`, que trae la etiqueta entera embebida:

```ts
labels: [{ taskId, labelId, label: Label }]
```

Gestionarlas exige **`canManageLabels`**, su permiso propio desde `ee8be65`.
Antes las gobernaba `canEditTask`: quien podía tocar una tarea rehacía el
vocabulario del proyecto entero.

---

## Comentarios 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| GET | `/tasks/:taskId/comments` | — | `canViewProject` |
| POST | `/tasks/:taskId/comments` | `{ body }` → 201 | `canComment` |
| PATCH | `/tasks/:taskId/comments/:id` | `{ body }` | `canComment` + **ser el autor** |
| DELETE | `/tasks/:taskId/comments/:id` | — | `canComment` + autor **o** `canDeleteTask` |

```ts
TaskComment = { id, taskId, authorId, body, createdAt, editedAt }
```

- Orden cronológico, del más antiguo al más nuevo.
- `body`: 1–4000 caracteres.
- `editedAt` es `null` mientras no se toque el texto; solo se marca al editarlo
  de verdad, no en cada escritura de la fila.
- **Editar es solo del autor**, aunque puedas moderar: moderar es poder retirar
  lo que otro escribió, no reescribirlo con su nombre. Ajeno → `403 "Solo
  puedes editar tus propios comentarios"`.
- **Borrar** lo puede el autor o quien tenga `canDeleteTask`.
- `authorId` es un id: el nombre lo resuelve la interfaz contra los miembros.

Comentar exige **`canComment`**, su permiso propio desde `ee8be65`. Antes pedía
`canEditTask`, así que un perfil de solo lectura leía el hilo y no podía
responder.

⚠️ Los comentarios **viajan dentro de la tarea** (`task.comments`), también en
`GET /boards/:id/tasks`. Se decidió así para que la revalidación de la página
los refresque sin un segundo camino de datos; el coste es un listado más
pesado.

---

## Adjuntos 🔒

| Método | Ruta | Cuerpo | Permiso |
|---|---|---|---|
| GET | `/tasks/:taskId/attachments` | — | `canViewProject` |
| POST | `/tasks/:taskId/attachments` | **multipart**, campo `file` → 201 | `canEditTask` |
| GET | `/tasks/:taskId/attachments/:id/content` | — | `canViewProject` |
| DELETE | `/tasks/:taskId/attachments/:id` | — | `canEditTask` + quien lo subió **o** `canDeleteTask` |

```ts
TaskAttachment = { id, taskId, filename, mimeType, size, uploadedBy, createdAt }
```

**Los bytes nunca vienen en el listado ni en la tarea.** Viven en otra tabla y
solo se leen en la ruta de `/content`. `task.attachments` trae los metadatos.

- **Máximo 10 MB** por archivo. Pasarse da **413** `"File too large"`, que lo
  corta multer antes de leerlo entero.
- **Lista blanca de tipos**: PNG, JPEG, GIF, WebP, PDF, texto plano, CSV, ZIP,
  Word y Excel. Otro tipo da 400 con el mime rechazado.
- **El SVG no se admite**: es XML con scripts, y servirlo desde el mismo origen
  que la aplicación sería XSS.

### Cómo se sirve la descarga

| Tipo | `Content-Disposition` |
|---|---|
| PNG · JPEG · GIF · WebP | `inline` — se puede usar en un `<img>` |
| Todo lo demás, PDF incluido | `attachment` — descarga forzada |

Siempre con `X-Content-Type-Options: nosniff` y `Cache-Control: private`.

⚠️ **Enlaza al proxy de la zona, no al gateway.** El gateway está en otro puerto
y la sesión es una cookie httpOnly del origen de la aplicación: un enlace a
`:3000` iría sin credenciales y daría 401. Lo correcto es
`/projects/api/gateway/tasks/:taskId/attachments/:id/content`.

Se guardan en Postgres porque la infra son Postgres y Redis. Con cientos de
archivos va sobrado; el punto por donde cortar si algún día pesa es la tabla
`attachment_blobs`, y la API no cambiaría.

---

## Mis tareas 🔒

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/me/tasks?dueBefore&status&priority&projectId&limit` | — (solo las tuyas) |

Devuelve `{ items, total }` con la misma forma de `Task` que las demás rutas.

**No existe `GET /tasks?assigneeId=`**, que era como lo pedía PENDIENTES §5:
con el id como parámetro cualquiera consultaría las tareas de cualquiera. El
usuario sale del token.

| Parámetro | Qué hace |
|---|---|
| `dueBefore` | ISO 8601. Solo con fecha límite **anterior**. Las tareas **sin fecha quedan fuera** |
| `status` | Nombre de la columna. Para dejar fuera lo terminado |
| `priority` | `LOW` · `MEDIUM` · `HIGH` · `URGENT` |
| `projectId` | Acota a un proyecto |
| `excludeDone` | `true` deja fuera las tareas que están en una **columna verde** (de cierre) |
| `limit` | Por defecto 50, máximo 100 |

Orden: lo que vence antes primero, y a igualdad de fecha lo más urgente.

**Para los avisos del panel, una sola petición basta.** Pide
`?dueBefore=<hoy+7d>&excludeDone=true` y separa en cliente comparando con ahora:
lo anterior es **vencido** y lo posterior **vence pronto**. Son dos avisos
distintos y no se mezclan en un contador único.

⚠️ `excludeDone` filtra **después** de aplicar `limit`, porque para saber qué
columnas excluir hay que conocer las de las tareas que ya salieron. Puede
devolver menos de lo pedido. Y si projects-service no responde, devuelve las
tareas **sin filtrar** en vez de fallar: enseñar de más en un aviso es mejor que
quedarse sin panel.

⚠️ Solo trae tareas de proyectos donde **sigues estando**. Salir de un proyecto
no borra tus asignaciones —las filas siguen en la base—, pero dejan de salir
aquí. Verificado: tras salir, 6 filas de asignación vivas y `items: []`.

---

## Avisos 🔒

| Método | Ruta | Entrada | Notas |
|---|---|---|---|
| GET | `/me/notifications?limit&unreadOnly` | — | `{ items, total, unread }` |
| PATCH | `/me/notifications/:id/read` | — | Solo las tuyas |
| POST | `/me/notifications/read-all` | — | → `{ marked }` |

```ts
Notification = { id, userId, type, actorId, projectId, projectName,
                 taskId, taskTitle, readAt, createdAt }

type: 'INVITATION_RECEIVED' | 'INVITATION_ACCEPTED' | 'INVITATION_REJECTED'
    | 'MEMBER_LEFT' | 'MEMBER_REMOVED' | 'TASK_ASSIGNED' | 'TASK_UNASSIGNED'
```

Cuelga de `/me` como las tareas y las invitaciones: **el usuario sale del token**,
nunca de la petición. No existe una ruta con `userId` por parámetro porque sería
leer la bandeja de cualquiera.

- **`unread` viaja siempre**, también con `unreadOnly=true`: es lo que pinta la
  insignia, y sacarlo de `items.length` daría un número recortado por el `limit`.
- **Nadie recibe aviso de lo que hizo él.** Se filtra al crear, así que un evento
  que solo te afecta a ti no genera nada.
- **`projectName` y `taskTitle` son copias del momento**, no referencias: el
  aviso sobrevive al borrado del proyecto o la tarea. Píntalos tal cual; no
  intentes resolverlos.
- `actorId` es un id, como en encargados y comentarios: el nombre lo resuelve la
  pantalla contra el directorio.
- Marcar una ajena responde **404**, no 403: no se confirma que exista.
- No hay `TASK_EDITED` a propósito: emitirlo en cada `PATCH` llenaría la bandeja
  de ruido y el aviso útil se perdería.

### Tiempo real — `GET /me/notifications/stream` (SSE)

Un flujo SSE **de una sola vía**: el servidor empuja y el navegador nunca
escribe por aquí. No hay WebSocket a propósito — una conexión bidireccional
habría que autorizarla por mensaje, y aquí la autorización es la de siempre: el
guard del controlador, una vez, al abrir.

```
event: aviso          data: { type, actorId, projectId, projectName, taskId, taskTitle, createdAt }
event: latido         data: { t }        cada 25 s
```

- ⚠️ **`EventSource` no puede mandar cabeceras.** El token no viaja desde el
  navegador: llega porque la petición cruza **el proxy de la zona**, que lee la
  cookie httpOnly y añade el `Authorization`. Llamar a esta ruta directamente
  contra el gateway da 401, y así debe ser.
- Los **latidos cada 25 s no son la latencia**. Solo existen para que ningún
  intermediario cierre una conexión en silencio: el balanceador de Google corta
  a los 60 s sin tráfico. Cuando hay algo que enviar, se envía en el momento.
- El `latido` se ignora en el cliente. Existe como tipo propio para no
  confundirlo con un aviso vacío.
- ⚠️ **Por aquí viaja también `CHAT_MESSAGE`, que NO está en el enum de
  `Notification` y no deja fila en la bandeja.** Ver la sección del chat. Trata
  `type` como texto libre: la lista no está cerrada.
- 🔴 **El sobre `{success, data, meta}` NO se aplica aquí.** Envolverlo tapaba el
  `type` del `MessageEvent` y Nest dejaba de escribir la línea `event:`, así que
  `addEventListener('aviso', …)` no se disparaba **nunca** y los avisos morían
  en el navegador sin ningún error. Arreglado exceptuando los handlers `@Sse()`
  en `StandardResponseInterceptor`.

---

## Chat del proyecto 🔒

### Chat de proyecto

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| GET | `/projects/:id/chat/messages?limit&before` | — | `canViewProject` |
| POST | `/projects/:id/chat/messages` | `{ body?, replyToId?, attachmentIds? }` | `canComment` |
| POST | `/projects/:id/chat/read` | — | `canViewProject` |
| POST | `/projects/:id/chat/mute` | `{ muted }` | `canViewProject` |
| POST | `/projects/:id/chat/messages/:mid/react` | `{ emoji, on }` | `canComment` |
| GET | `/projects/:id/chat/mentionables` | — | `canViewProject` |
| DELETE | `/projects/:id/chat/messages/:mid` | — | autor, o `canManageMembers` |
| POST | `/projects/:id/chat/attachments` | **multipart**, campo `file` → 201 | `canComment` |
| GET | `/projects/:id/chat/attachments/:aid/content` | — | `canViewProject` |
| DELETE | `/projects/:id/chat/attachments/:aid` | — | autor, o `canManageMembers` |

### Chat privado — cuelga de `/me`, sin proyecto en la ruta

🔴 **La puerta es la organización, no el proyecto, desde 2026-08-28.** Se puede
escribir a quien comparta **alguna organización** contigo; antes hacía falta
compartir un proyecto, lo que dejaba fuera a alguien de tu propio equipo al que
todavía no habías metido en ningún tablero — y no protegía de nada más, porque
quien está en un proyecto está por fuerza en su organización.

Dos consecuencias en el contrato:

- **`GET /me/chats/contacts` devuelve a todo tu equipo**, no solo a quien
  comparte tablero contigo. Los proyectos en común siguen viniendo como detalle,
  y **la lista puede venir vacía**: podéis hablar porque estáis en el mismo
  equipo, no porque trabajéis en lo mismo.
- ⚠️ **`GET /me/chats/:peerId/mentionables` devuelve `refs: []` siempre.** No se
  referencian tareas ni tableros en privado: `/Sprint 1` no dice de qué proyecto
  sale ni si quien lo recibe puede verlo. El menú `/` queda solo en los chats de
  proyecto. `people` ya venía vacío —sois dos—.

| Método | Ruta | Body |
|---|---|---|
| GET | `/me/chats` | — · tus conversaciones |
| GET | `/me/chats/contacts` | — · quién comparte proyecto contigo, con sus roles |
| GET | `/me/chats/projects` | — · tus chats de proyecto, para el centro de mensajes |
| GET | `/me/chats/:peerId/messages?limit&before` | — |
| POST | `/me/chats/:peerId/messages` | `{ body?, replyToId?, attachmentIds? }` |
| POST | `/me/chats/:peerId/read` · `/mute` | — · `{ muted }` |
| POST | `/me/chats/:peerId/messages/:mid/react` | `{ emoji, on }` |
| GET | `/me/chats/:peerId/mentionables` | — |
| DELETE | `/me/chats/:peerId/messages/:mid` | — · **solo propios** |
| POST | `/me/chats/:peerId/attachments` | **multipart**, campo `file` → 201 |
| GET | `/me/chats/:peerId/attachments/:aid/content` | — |
| DELETE | `/me/chats/:peerId/attachments/:aid` | — · **solo propios** |

```ts
ChatMessage = { id, channelId, authorId, body, createdAt,
                replyTo: { id, authorId, body } | null,
                reactions: { messageId, userId, emoji }[],
                attachments: ChatAttachment[] }

ChatAttachment = { id, channelId, messageId: string | null,
                   filename, mimeType, size, uploadedBy, createdAt }

GET → { items, hasMore, unread, muted }   // items del más antiguo al más nuevo
```

### Adjuntos del chat — se suben aparte, antes de enviar

- **El archivo viaja por su propia ruta y queda como borrador** (`messageId`
  `null`). Al enviar, `attachmentIds` del mensaje lo reclama. Así se pueden
  adjuntar varios, verlos como chips y mandarlos todos de una vez — si fuera con
  el mensaje, cada intento de enviar volvería a subir el archivo.
- `body` es opcional **solo** si el mensaje lleva adjuntos: un mensaje puede ser
  un archivo a secas. Sin adjuntos, el cuerpo sigue siendo obligatorio.
- ⚠️ **El `mimetype` lo declara quien sube**: el gateway comprueba la firma de
  los primeros bytes contra el tipo declarado (el texto se verifica como «no
  arranca como binario»). Renombrar un ejecutable como `.png` no pasa.
- Tipos admitidos: las doce de siempre (imágenes, PDF, texto, CSV, ZIP, Word,
  Excel) **más MP4 y WebM**. El **SVG no entra**: es XML con scripts, y servirlo
  desde el origen de la aplicación sería XSS.
- Límites: **25 MB por archivo** (el doble que en tareas: es donde se comparten
  vídeos), **máximo 5 por mensaje**.
- Al enviar, el servidor comprueba que cada `attachmentId` sea **de esta
  conversación, de quien escribe y que siga sin dueño**. Si alguno falla, el
  mensaje entero se rechaza y los archivos se quedan en borrador — el cliente
  recupera el estado sin enviar a medias.
- **La descarga se sirve por el proxy de la zona** (mismo origen → la cookie va
  sola). Imágenes y vídeo en línea; PDF en línea dentro de un
  `Content-Security-Policy: sandbox allow-scripts allow-downloads` (sin
  `allow-same-origin`, así un PDF con scripts no toca la sesión); el resto como
  descarga con `nosniff`.

🔴 **Solo puedes escribir a quien comparta algún proyecto contigo.** Es la única
regla del chat privado y la aplica projects-service en el único camino por el que
se resuelve un canal. Sin ella esto sería mensajería abierta a toda la
plataforma.

### Menciones y referencias — van **dentro del texto**

```
@[Juan Pérez](user:2222…)        /[Sprint 1](board:88ab…)
```

⚠️ **El nombre va escrito dentro a propósito.** Si sacan a Juan del equipo o
borran el tablero, el nombre ya está en el mensaje y se pinta como texto plano —
**degradar es no hacer nada**, sin una sola consulta. Es también lo que hace que
un mensaje viejo se lea como se escribió aunque hayan renombrado las cosas.

Tipos: `user`, `project`, `workspace`, `board`, `task`.

- **El catálogo (`/mentionables`) es el control de acceso**, no una validación al
  enviar. Devuelve solo lo que quien pregunta ya puede ver: en un chat de
  proyecto, lo de ese proyecto; en uno privado, **solo los proyectos que
  compartís**.
- 🔴 **Al enviar no se revalidan las referencias, y es correcto**: el nombre de la
  etiqueta lo escribe quien manda, así que fabricar una a mano no le enseña nada
  que no supiera. Al pulsarla, quien la recibe pasa por sus permisos de siempre.
- ⚠️ **El día que una mención genere un aviso, esto cambia**: entonces sí serviría
  para hacer sonar el teléfono de cualquiera y habría que validarla al enviar.

- ⚠️ **El `projectId` va en la ruta y NUNCA en el cuerpo**: mandarlo da 400. Es
  la misma regla que tareas y checklists.
- **Escribir pide `canComment`, no un `canChat`.** Los permisos de un rol son un
  diccionario, así que una clave nueva nace en `false` para todos los roles que
  ya existen y el chat saldría mudo hasta editarlos uno a uno en cada proyecto.
- El `projectId` de las rutas anidadas es el **UUID**, no el slug.
- **Se pagina hacia atrás con cursor (`before`), no con `page`.** En un chat el
  número de página de un mensaje cambia cada vez que alguien escribe, así que
  «la página 2» devolvería mensajes ya vistos y se saltaría otros.
- `unread` **no cuenta los propios**: nadie tiene pendiente de leer lo suyo. Y
  escribir adelanta tu marca de lectura.
- Lo no leído es **un instante por persona** (`project_chat_reads`), no una
  marca por mensaje.
- **Un mensaje nuevo publica un aviso en vivo a todos los miembros menos el
  autor**, con `type: 'CHAT_MESSAGE'`, por el mismo flujo SSE de arriba. Eso es
  lo que hace que suene y salga la tarjeta **aunque no estés en el chat**.
- ⚠️ **Ese aviso NO crea fila en `notifications`** y no sale en la bandeja: una
  conversación de cincuenta mensajes serían cincuenta avisos por persona y
  taparía el aviso que sí importa.
- ⚠️ **El aviso no lleva el texto del mensaje**, a propósito: reproducirlo lo
  enseñaría en la pantalla de quien tenga el portátil abierto en una reunión.
- Borrar uno que no existe —o ajeno sin moderar— responde **404**, no 403.
- Los mensajes de un proyecto **cascadean** al borrarlo. Los privados **no**:
  no son del proyecto, y lo que dos personas se dijeron no desaparece porque
  alguien borre uno.
- Reaccionar es **idempotente en las dos direcciones**. El emoji sale de una
  lista cerrada (`CHAT_REACTIONS`); otro da 400.
- Una respuesta tiene que citar un mensaje **del mismo canal**: si no, 400.
- Borrar el original **no borra las respuestas** (`SET NULL`): se quedan sin
  cita, que es lo correcto — son de otras personas.

---

## Facturación 🔒

| Método | Ruta | Body | Notas |
|---|---|---|---|
| GET | `/me/billing/planes` | — | El catálogo y cuáles se pueden contratar aquí |
| GET | `/me/billing/resumen?organizationId` | — | Plan, topes y consumo **de esa organización**, en una llamada |
| GET | `/me/billing/estado` | — | `{ disponible, gestionable }` |
| POST | `/me/billing/checkout` | `{ tier, seats, organizationId }` | → `{ url }` de Stripe Checkout |
| POST | `/me/billing/portal` | — | → `{ url }` del portal. 400 si no eres cliente |
| POST | `/webhooks/stripe` | crudo | **público, sin JWT**. Su auth es la firma |

- 🔴 **`resumen` habla de UNA organización desde 2026-08-28, no de la persona.**
  El plan vale solo dentro de la organización que lo paga, así que el `tier`, los
  `quotas` y el `uso` que devuelve son los de la que se pida. Sin
  `organizationId` cae en la **personal**, nunca en «la mejor que tengas».
  ⚠️ El identificador se **valida**: mandar una organización ajena da 403
  `NOT_IN_ORG`, no su plan.
- ⚠️ **`uso.proyectos` cuenta los de la organización, no los tuyos.** Contaba los
  que sostenía la persona contra un tope que se cuenta por organización: quien
  tuviera dos proyectos en un equipo con veinte veía «2 de 25» y creía que le
  quedaban veintitrés.
- Cuelga de `/me` y **nunca acepta un `userId`**: quien paga es quien trae el
  token. Un parámetro aquí sería abrir el portal —con sus recibos dentro— a
  nombre de otro.
- 🔴 **`portal` NO acepta organización, y el cliente de Stripe es de la
  persona.** Quien tenga dos suscripciones las verá las dos en un solo portal.
  No es un riesgo —todo lo de dentro es suyo— pero la interfaz **no puede
  prometer «la suscripción de este equipo»**: dice «Gestionar mis
  suscripciones». Está en PENDIENTES-BACKEND.
- **Devuelve la URL en vez de redirigir**: un 303 lo seguiría el propio `fetch`
  en lugar de mover la pestaña.
- `disponible` depende de que **el backend** tenga claves de Stripe, cosa que el
  navegador no puede saber. Sin ellas, `/me/billing/*` responde **503** con un
  mensaje claro y la interfaz no debe ofrecer el botón.
- `gestionable` es «ya eres cliente de Stripe». Alguien con PRO puesto a mano
  desde administración **no** tiene suscripción que gestionar.
- 🔴 **El plan lo concede el webhook, JAMÁS la vuelta del navegador.** La
  `success_url` la puede escribir cualquiera en la barra de direcciones; si
  diera PRO, PRO sería gratis.
- El webhook es **idempotente**: Stripe reintenta hasta recibir un 2xx y manda
  eventos que se solapan. Todo lo que hace es un `upsert` de estado final.
- Sin firma válida → **400**. Sin `STRIPE_WEBHOOK_SECRET` configurado rechaza
  **todo**: es su única autenticación.
- 🔴 **`checkout` exige `organizationId` SIEMPRE**, desde 2026-08-26. Todos los
  planes de pago van por asiento y los contrata una organización — incluida la
  personal de quien trabaja solo, que es una organización de un asiento. Antes
  los «individuales» iban sin él y era la única excepción; ya no hay ninguna.
- ⚠️ **`ENTERPRISE` no se puede pedir aquí**, y no por falta de dinero: no tiene
  precio en Stripe porque se negocia. Aceptarlo abriría un checkout contra un
  precio que no existe. La lista buena es `PLANES_AUTOSERVICIO`.
- ⚠️ Cada precio que falte en el entorno **apaga solo su plan**, no el cobro
  entero. `planes.disponibles` dice cuáles se pueden pedir; ofrecer uno que no
  está da **503** al pulsar.

---

## Organizaciones 🔒

La unidad que paga **y que contiene los proyectos**. Todo el mundo tiene al menos
una: quien trabaja solo tiene la suya, de un asiento.

| Método | Ruta | Body | Notas |
|---|---|---|---|
| GET | `/me/organizations` | — | Las tuyas, con `myPermissions` ya resuelto |
| POST | `/me/organizations` | `{ name, tier, seats }` | Nace en `FREE`; el plan lo aplica el webhook. **402 si ya tienes 3** |
| POST | `/me/organizations/invitations/accept` | `{ token }` | El token del enlace del correo |
| GET | `/organizations/:id` | — | 403 `NOT_IN_ORG` si no perteneces |
| PATCH | `/organizations/:id` | `{ name }` | `canManageOrganization` |
| GET | `/organizations/:id/members` | — | Basta con tener asiento |
| POST | `/organizations/:id/members` | `{ email, roleId? }` | `canInviteMembers`. Manda correo **y** devuelve el enlace |
| PATCH | `/organizations/:id/members/:userId` | `{ roleId }` | `canManageMembers` |
| DELETE | `/organizations/:id/members/:idOrEmail` | — | `canManageMembers`. Libera el asiento |
| GET | `/organizations/:id/roles` | — | `canManageMembers` — es el mapa del poder interno |
| POST | `/organizations/:id/roles` | `{ name, permissions }` | `canManageMembers` |
| PATCH | `/organizations/:id/roles/:roleId` | `{ name, permissions }` | `canManageMembers` |
| DELETE | `/organizations/:id/roles/:roleId` | — | **409** si todavía lo lleva alguien |
| GET | `/organizations/:id/role-templates` | — | Basta con tener asiento |
| POST | `/organizations/:id/role-templates` | `{ name, permissions }` | `canManageRoleTemplates` |
| PATCH | `/organizations/:id/role-templates/:templateId` | `{ name, permissions }` | `canManageRoleTemplates` |
| DELETE | `/organizations/:id/role-templates/:templateId` | — | No toca ningún proyecto ya creado |
| PATCH | `/organizations/:id/seats` | `{ seats }` | `canManageBilling`. Stripe prorratea |
| POST | `/organizations/:id/transfer` | `{ userId }` | **Solo el dueño**. El destino tiene que estar dentro |
| GET | `/organizations/:id/history` | — | `canViewAuditLog` |

**Reglas que ya han mordido:**

1. 🔴 **`permissions` es un diccionario de booleanos, nunca un array.** Igual que
   los roles de proyecto, pero **con validador desde el primer día** — allí se
   aprendió tarde y todavía hay filas guardadas como lista que se normalizan al
   leer.
2. 🔴 **No se puede conceder un permiso que no se tiene.** El servidor rechaza un
   papel cuyos permisos no quepan en los de quien lo guarda, y lo comprueba
   también **al invitar** — que es la puerta trasera que se olvida. Sin esa
   regla, quien gestiona miembros se fabrica un papel con `canManageBilling` y se
   lo pone.
3. ⚠️ **Ser dueño no es un papel**, así que no se concede por
   `PATCH .../members/:userId`. Traspasar tiene su propia ruta y solo la usa el
   dueño: si fuera un valor más del desplegable, quien administra podría
   regalarse la organización con un `PATCH`.
4. ⚠️ **Una invitación ocupa asiento desde que se manda.** Si no lo ocupara, se
   podrían mandar mil sobre tres y el tope reventaría al aceptarlas.
5. ⚠️ **Borrar un papel que lleva gente da 409**, con el número dentro: sin saber
   a cuánta gente hay que mover, no se puede arreglar. El de por defecto tampoco
   se borra — sin él, la siguiente invitación no se puede escribir.
6. ⚠️ **La lista de papeles exige `canManageMembers`; la de miembros no.** Saber
   con quién compartes organización es lo mínimo para trabajar; saber quién puede
   tocar la facturación es un mapa del poder interno.
7. ⚠️ **`GET /projects` acepta `organizationId`**, y es un **filtro sobre lo que
   ya puedes ver**, no una llave: se suma al «dueño o miembro» de siempre. Poner
   ahí una organización ajena devuelve cero proyectos.
8. ⚠️ **`POST /projects` acepta `organizationId` opcional.** Sin él cae en tu
   organización personal. El gateway comprueba pertenencia **y**
   `canCreateProject` antes de contar la cuota: primero dónde va, después si cabe.

---

## Checklists 🔒

| Método | Ruta | Body | Permiso |
|---|---|---|---|
| POST | `/tasks/:taskId/checklists` | `{ text, order? }` | `canEditTask` |
| POST | `/tasks/:taskId/checklists/:id/toggle` | — | `canMoveTask` ⚠️ |
| DELETE | `/tasks/:taskId/checklists/:id` | — | `canEditTask` |

⚠️ **Marcar un paso pide `canMoveTask`, no `canEditTask`:** marcarlo es ejecutar
el trabajo, no redefinirlo. Añadir y borrar pasos sí es definir la tarea.

⚠️ Igual que en tareas: **sin `projectId`**, que lo pone el guard.

```ts
Checklist = { id, taskId, text, completed, order }
```

No hay `GET`; llegan embebidos en `GET /tasks/:id`.

---

## Flujo mínimo para dejar un proyecto usable

```
POST /auth/register            → accessToken
POST /projects                 → projectId
POST /projects/:id/roles       → projectRoleId   (obligatorio antes de añadir miembros)
POST /projects/:id/members     → { userId, projectRoleId }
POST /projects/:id/workspaces  → workspaceId
POST /workspaces/:wid/boards   → boardId
POST /boards/:bid/columns  ×N  → columnIds       (guarda name ↔ id: `status` usa el name)
POST /boards/:bid/tasks        → { columnId, title, status: <name de la columna> }
```

---

## Administración — `/api/admin` 🔒 rol global

Todo cuelga de `@RequireGlobalRole(Admin)`, que se satisface con **`Admin` o
`SuperAdmin`** por jerarquía. Un `User` recibe `403 "Se requiere el rol global:
Admin"`. Lo consume `admin-front` (zona 4105, servida en `/admin`).

### Las dos capas siguen separadas

El rol global **no concede nada dentro de un proyecto**, y estas rutas no son un
atajo a `ProjectPermissionGuard`: son otra puerta, de solo lectura más las acciones
de estado. Quien administra la plataforma no gana `canEditTask` en ningún sitio.

⚠️ **Por eso el panel no enlaza a `/projects/<slug>`**: ese enlace daría 403 a quien
no sea miembro y parecería roto. La ficha se pinta con `GET /admin/projects/:id`.

### Roles globales

`SuperAdmin > Admin > User`, en jerarquía. Una cuenta sin ninguna fila de rol **es
`User`** —`POST /auth/register` no asigna ninguno, así que es el caso mayoritario—, y
los nombres desconocidos se ignoran al calcular el nivel, para que un `INSERT` en la
tabla de roles no sea una escalada de privilegios.

La regla es **actuar hacia abajo**: solo se administran cuentas de nivel
*estrictamente* inferior al propio, y nunca la propia. El rol global es **privado**: no
se enseña en el directorio de usuarios ni en la lista de miembros de un proyecto.

### Cuentas — `/admin/users`

| Método | Ruta | Entrada | Notas |
|---|---|---|---|
| GET | `/admin/users` | `page`, `limit`, `search`, `status` | `{ items, total }` |
| PATCH | `/admin/users/:id/status` | `{ status, reason? }` | `reason` obligatorio salvo al reactivar |
| PUT | `/admin/users/:id/role` | `{ role, reason? }` | **PUT: reemplaza**, no añade |

```ts
AdminUser = { id, firstName, lastName, status, createdAt, credential: { email },
              globalRole: 'SuperAdmin' | 'Admin' | 'User',   // el efectivo, el más alto
              globalRoles: string[] }                        // las filas tal cual
```

- `status`: `ACTIVE | SUSPENDED | INACTIVE`. `INACTIVE` es una **baja**, no una
  sanción; el login rechaza las dos igual, pero llamar «suspensión» a una baja es
  acusar a alguien de algo.
- `PUT` y no `PATCH` en el rol porque el nivel efectivo es el más alto de las filas:
  «añadir User» a un Admin no lo degradaría.
- ⚠️ **Suspender no corta la sesión al instante**: el access token abierto aguanta lo
  que le quede, hasta 15 min. El refresh sí se corta ya. Dilo en la interfaz o quien
  administra creerá que no funcionó y volverá a pulsar.
- No hay borrado de cuentas, a propósito: dejaría tareas, comentarios e historial
  apuntando a alguien que ya no está, y eso vive en otros microservicios donde la
  cascada no llega.

### Registro de actividad — `/admin/activity`

| Método | Ruta | Entrada |
|---|---|---|
| GET | `/admin/activity` | `page`, `limit`, `actorId`, `targetId`, `action`, `targetType`, `from`, `to` |

```ts
AdminActivityEntry = { id, actorId, actorLabel, action, targetType: 'USER' | 'PROJECT',
                       targetId, targetLabel, reason, metadata, createdAt }

action = 'USER_SUSPENDED' | 'USER_REACTIVATED' | 'USER_DEACTIVATED'
       | 'ROLE_GRANTED'   | 'ROLE_REVOKED'
       | 'PROJECT_SUSPENDED' | 'PROJECT_REACTIVATED'
       | 'PROJECT_ARCHIVED'  | 'PROJECT_RESTORED'
```

- **Solo-añadir.** No hay ruta de edición ni de borrado, ni para un SuperAdmin: si se
  pudiera reescribir no sería auditoría.
- Verbos concretos y no un `STATUS_CHANGED` con `metadata` que haya que abrir: un
  registro se filtra y se cuenta por acción.
- `actorLabel` y `targetLabel` son **copias del momento**, no referencias, así que la
  entrada se sigue leyendo cuando la cuenta o el proyecto ya no existen.
- ⚠️ **`PROJECT_REACTIVATED` y `PROJECT_RESTORED` no son lo mismo**: el primero levanta
  una suspensión, el segundo recupera un archivado. Los dos terminan en `ACTIVE` y el
  backend los distingue por el estado **anterior**.

### Proyectos — `/admin/projects`

| Método | Ruta | Entrada | Notas |
|---|---|---|---|
| GET | `/admin/projects` | `page`, `limit`, `search`, `status` | `{ items, total }`, **archivados incluidos** |
| GET | `/admin/projects/:id` | — | Ficha de solo lectura, con el árbol |
| PATCH | `/admin/projects/:id/status` | `{ status, reason? }` | `reason` obligatorio salvo al reactivar |

```ts
AdminProject = Project & {
  owner: { id, name, email } | null   // resuelto por el gateway; null si credentials no responde
}
```

- `status`: `ACTIVE | SUSPENDED | DELETED`.
- `search` busca en **nombre y descripción**, insensible a mayúsculas.
- Es otra ruta y no un parámetro de `GET /projects` **a propósito**: aquella filtra por
  dueño o miembro, y añadirle una forma de ver todos sería poner un interruptor de
  bypass en la ruta que usa cualquiera.
- `owner` lo cruza el gateway con **una** llamada a credentials por página (los ids
  únicos), no una por fila. Solo nombre y correo: si hace falta el estado de esa cuenta,
  se mira en Cuentas.
- `reason`: 4–500 caracteres. Sin él, `400` — y aquí importa más que en las cuentas,
  porque es el texto que va a leer el dueño en su propia pantalla.

#### `DELETED` no es un borrado

`DELETE /projects/:id` existe, **es del dueño**, cascadea, purga tareas en otro
microservicio y no se deshace. El panel no lo ofrece. Ofrece dos estados, y los dos se
deshacen:

| Estado | Quién lo ve | Qué se puede hacer |
|---|---|---|
| `SUSPENDED` | dueño y miembros, **entero** | solo leer: `canViewProject` y `canViewReports` |
| `DELETED` | solo `/admin/projects` | nada; el resto de rutas responden **404** |

**Suspendido se sigue viendo** a propósito: esconderlo lo haría indistinguible de uno
borrado y nadie sabría a quién preguntar. **Archivado da 404 y no 403** porque un 403
diría «existe y no es tuyo», que es falso y encima filtra que ese proyecto existe.

Los dos conservan el `slug`: recuperar un proyecto tiene que devolverte tu URL, así que
ese slug sigue ocupado y no lo puede tomar un proyecto nuevo.

#### ⚠️ `PROJECT_SUSPENDED` — el 403 que no se arregla con permisos

Toda escritura en un proyecto suspendido da:

```jsonc
{
  "success": false,
  "error": {
    "code": "PROJECT_SUSPENDED",
    "message": "Este proyecto está suspendido por la administración: <motivo>",
    "details": { "reason": "<motivo>" }
  }
}
```

Compara contra el `code` (`PROJECT_SUSPENDED_CODE` en `commons/api/domain.ts`), nunca
contra el status: un `FORBIDDEN` se arregla pidiendo permiso a quien administra el
proyecto, y esto **no se arregla** —hay que esperar a que la plataforma lo reactive—.
Sin distinguirlos, el dueño de un proyecto suspendido acaba pidiéndose permisos a sí
mismo.

Se aplica en `ProjectPermissionGuard`, que ya resuelve el proyecto de cada petición, así
que **cubre de golpe** tareas, columnas, comentarios, adjuntos, miembros, roles,
etiquetas e informes — incluidos los que viven en otro microservicio.

⚠️ **Las rutas sin `@RequireProjectPermission` no pasan por ese guard.** Eran tres
escrituras —aceptar una invitación, rechazarla y salir del proyecto
(`DELETE /projects/:projectId/membership/me`)— y están cerradas a mano en
projects-service, con el mismo código. Una ruta nueva que escriba sin declarar permiso
volvería a abrir el agujero.

### Cómo se pinta esto en la interfaz

1. `GET /projects/:id/permissions/me` → si `projectStatus === 'SUSPENDED'`, el mapa ya
   viene recortado: **no hay que apagar nada a mano**.
2. Enseña el aviso con `suspendedReason`. Es obligatorio: sin él la pantalla es
   indistinguible de una donde te han quitado los permisos, o de una rota.
3. No ocultes el contenido. Lo que hay dentro sigue siendo el trabajo del equipo,
   consultarlo no rompe nada, y taparlo convierte una suspensión reversible en una
   pérdida de acceso.

---

## No existe (y lo necesitamos)

- `GET /projects/:projectId/roles`
- `GET /boards/:boardId/columns`
- `POST /projects/:id/members` que acepte **email**
- Dominio de **reportes** completo
- **Logs / auditoría**
- Subida de avatar (`avatarUrl` existe en el modelo, no hay endpoint)
- **Tiempo real** para los avisos: hoy la bandeja reconsulta cada 60 s

---

## Reportes 🔒

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/projects/:projectId/reports/snapshot` | `canViewReports` |
| GET | `/projects/:projectId/reports/flow?days` | `canViewReports` |
| GET | `/projects/:projectId/reports/cycle-time?days` | `canViewReports` |
| GET | `/projects/:projectId/reports/forecast?days` | `canViewReports` |
| GET | `/projects/:projectId/reports/weekly?weeks` | `canViewReports` |
| GET | `/projects/:projectId/reports/blocked?days` | `canViewReports` |
| GET | `/projects/:projectId/reports/people` | `canViewReports` |

`days` va acotado a 1–365 en el gateway; por defecto 60. `weeks`, a 2–52.

### La cartera 🔒 — `GET /me/reports/portfolio`

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/me/reports/portfolio?dias` | Solo sesión |

Cuelga de `/me` porque no hay proyecto en la ruta contra el que comprobar nada,
igual que `/me/tasks`. **La línea de acceso es la lista**: el gateway pide los
proyectos con `canViewReports` y agrega solo esos, así que sin ninguno devuelve
`[]` — que no es un error.

```ts
[{
  projectId, name, slug,
  total, abiertas, cerradas,
  vencidas,      // abiertas con la fecha pasada. Una entregada no vence
  sinAsignar,    // abiertas sin nadie
  paradas,       // abiertas sin cambiar de columna desde hace `dias` (por defecto 7)
  cerradasSemana, cerradasSemanaAnterior,
}]
```

⚠️ **Salen todos los proyectos, incluidos los que no tienen ni una tarea**, con
ceros. Un `GROUP BY` los habría dejado fuera, y desaparecer de la cartera se lee
como que no tienes acceso.

⚠️ **`paradas` aquí no distingue las que no tienen historial**, al contrario que
`/reports/blocked`. En una fila por proyecto no cabe el matiz.

⚠️ **No acepta los filtros de abajo.** `boardId`, `assigneeId` y `labelId` son
ids de **un** proyecto, así que cruzarlos con una lista no significa nada.

⚠️ **Y no devuelve ninguna variación del ritmo**, solo los dos números. La semana
en curso está a medias: un lunes, comparar contra siete días completos da un
«−80 %» falso con toda la apariencia de un dato exacto.

### Filtros — los mismos seis en las ocho rutas

Las siete de arriba **y el paquete** aceptan además:

| Parámetro | Forma | Qué acota |
|---|---|---|
| `from` / `to` | ISO 8601 | El tramo. **Manda sobre `days`** |
| `boardId` | UUID | Las tareas de ese tablero |
| `assigneeId` | UUID | Las de esa persona |
| `labelId` | UUID | Las de esa etiqueta |
| `priority` | `LOW` · `MEDIUM` · `HIGH` · `URGENT` | |

⚠️ **Un tramo de más de 365 días responde 400**, no se recorta —al revés que
`days`, que sí se acota en silencio—. Dos fechas son una pregunta concreta y
estrecharla por detrás devolvería un gráfico que se lee como su respuesta.

⚠️ **Un `to` sin `from` se ignora**, y no da error: es la ventana por defecto
acabando antes, que no es ninguna pregunta.

⚠️ **`from`/`to` no acota lo mismo en todos los informes**, y no puede:

| Informe | El tramo acota |
|---|---|
| `snapshot`, `blocked`, `people` | `createdAt` — miden estado de ahora |
| `cycle-time`, `forecast` | `completedAt` — miden lo que se cerró |
| `flow` | `occurredAt` — mide movimientos |
| `weekly` | **es el eje**: qué semanas salen, no qué tareas cuentan |

⚠️ **Y el `days` de `blocked` sigue significando «lleva sin moverse»**, no una
ventana de historial. Los filtros le aplican; su `days` no cambia de sentido.

Un valor mal formado —un UUID que no lo es, una prioridad inventada— responde
**400 al paquete entero**, así que las ocho tarjetas se quedan sin datos por un
parámetro. Si construyes la query desde algo que puede venir de la barra de
direcciones, comprueba al menos `priority`, que es conjunto cerrado.

### ⚠️ Las siete piden `canViewReports`. Antes solo la última.

Seis de las siete pedían `canViewProject`, con la idea de que la línea fuese de
**privacidad y no de acceso**: los agregados no nombran a nadie —son el estado
del trabajo— y lo único que había que decidir a propósito era enseñar las cifras
de cada cual, porque un tablero con todas a la vista se convierte en una
clasificación aunque nadie lo pretenda.

Se cerró entero por una razón de producto: un perfil cuyo trabajo en la
plataforma es concretar y mover tareas no necesita el análisis de datos, y
ofrecérselo es ruido. Con la página cerrada, la distinción interna se quedaba
sin trabajo que hacer —quien entra lo tiene por definición— así que se eliminó
en vez de dejar un permiso con dos significados.

**Si escribes un fetch a reportes, cuenta con el 403.** Un miembro con
`canViewProject` que antes recibía `snapshot` ahora no. La forma de saberlo por
adelantado es la de siempre: `GET /projects/:id/permissions/me`.

`canViewReports` entra **implicado por `canManageMembers`, `canEditProject` y
`canDeleteProject`**, así que los roles «Administrador» ya existentes lo reciben
sin migración y un «Colaborador» no.

Para **listar solo los proyectos cuyo informe puedes abrir**, sin preguntar uno
a uno, está `GET /projects?permission=canViewReports` — ver «Proyectos».

### `snapshot` — el único que funciona sin historial

```ts
{
  total, completed, overdue, unassigned, checklistItems, checklistDone,
  byPriority: [{ priority, count }],
  byColumn:   [{ columnId, name, color, order, count }],   // ordenado
  byLabel:    [{ labelId, count }],
  byAssignee: [{ userId, count }],
}
```

⚠️ `completed` cuenta lo que tiene `completedAt`, y eso **solo existe desde que
se captura el historial**. Una tarea que ya estaba en la columna verde de antes
cuenta como abierta. Si la pantalla necesita «lo que está en una columna de
cierre», eso es `byColumn` cruzado con el color, no `completed`.

### `cycle-time` — percentiles, nunca la media

```ts
{
  suficiencia: { suficiente, tareasCerradas, faltanTareas, diasDeHistorial, faltanDias },
  muestras: [{ taskId, completedAt, leadHours, cycleHours }],
  lead:  { p50, p85 },                          // de crear a cerrar
  cycle: { p50, p85, muestrasConMovimiento },    // del primer movimiento a cerrar
}
```

`cycleHours` es `null` si la tarea nunca se movió antes de cerrarse, y esas
muestras no entran en el percentil: por eso `muestrasConMovimiento` puede ser
menor que `muestras.length`.

⚠️ **No se devuelve ninguna media, a propósito.** El tiempo de ciclo tiene cola
larga y la media se va detrás de las pocas tareas que se eternizan: acaba
describiendo un caso que no existe. Si hace falta un número, es `p50`.

### `forecast` — se niega a predecir sin datos

```ts
{ suficiencia, pendientes, throughputDiario: { media }, prediccion: { p50, p85, p95 } | null }
```

**`prediccion` es `null` mientras no haya 10 tareas cerradas y 14 días de
historial**, y `suficiencia` dice cuánto falta. La interfaz debe enseñar eso, no
un gráfico vacío: una predicción sacada de cuatro tareas parece igual de seria
que una sacada de cuatrocientas.

El número sale de **Monte Carlo sobre el ritmo observado** —se remuestrean los
cierres por día, incluidos los días de cero— y no de estimaciones de esfuerzo,
que no existen en el modelo.

### `weekly` — cómo fue la semana

```ts
{
  semana:   { semana: 'YYYY-MM-DD', cerradas, creadas, diasTranscurridos },  // lunes de esta
  anterior: { semana: 'YYYY-MM-DD', cerradas, creadas },
  variacion: number | null,          // % de cierres frente a la anterior
  ritmoDiario: { semana, anterior },  // cierres por día
  serie: [{ semana, cerradas, creadas }],
}
```

⚠️ **La semana en curso está a medias.** Un lunes por la mañana `variacion`
siempre sale catastrófica; por eso viaja `diasTranscurridos` y el ritmo diario de
las dos. Enseña la variación con esa aclaración, o el ritmo.

`variacion` es `null` si la semana anterior fue de cero: no hay porcentaje que
sacar de una división entre cero.

⚠️ `cerradas` y `creadas` **no miden lo mismo**: la primera va por `completedAt`,
que solo existe desde que se captura el historial; la segunda por `createdAt`,
que es completo.

### `blocked` — lo que está parado

```ts
{ dias, total,
  tareas: [{ taskId, titulo, columna, columnId, diasParada, sinHistorial, vencida }] }
```

**No existe ningún estado «bloqueada» en el modelo.** Son las tareas abiertas que
llevan `dias` o más sin cambiar de columna, deducido del historial. Por defecto 7,
máximo 20 filas, ordenadas de más parada a menos.

Se mira el último evento `CREATED`/`MOVED`, **no `updatedAt`**: ese lo pisa
cualquier edición —el título, una etiqueta— y también la cascada que reescribe el
`status` al renombrar una columna, así que una tarea parada un mes parecería
recién tocada.

⚠️ `sinHistorial: true` significa **anterior a la captura de eventos**: ahí
`diasParada` es su edad, no su parón. Dilo al pintarlo; acusar de estar parada a
una tarea que simplemente es vieja es la clase de error que quita la confianza al
informe entero.

`columna` viene con el nombre **actual** de la columna, no con el `status`
congelado en la tarea.

### `flow` — flujo acumulado

```ts
{ columnas: [{ id, name, color }], serie: [{ day, porColumna: { [columnId]: n } }] }
```

`porColumna` es el **acumulado** —cuántas hay ese día—, no el movimiento del día.

### ⚠️ `COUNT(*)` de Postgres es `bigint`, y un BigInt no se serializa a JSON

Costó un rato: las consultas agregadas devolvían 500 sin más pista que «Internal
server error». Todas las cuentas se castean a `::int` en el propio SQL. Si añades
una consulta agregada nueva, hazlo también.

---

## Automatizaciones académicas 🔒

Todas exigen `canManageAutomations` y usan el `projectId` resuelto por la ruta.

| Método | Ruta | Uso |
|---|---|---|
| GET | `/projects/:projectId/automations` | Lista reglas |
| POST | `/projects/:projectId/automations` | Crea una regla |
| GET | `/projects/:projectId/automations/:id` | Obtiene una regla |
| PATCH | `/projects/:projectId/automations/:id` | Sustituye definición y estado |
| DELETE | `/projects/:projectId/automations/:id` | Elimina una regla |
| POST | `/projects/:projectId/automations/review` | Ejecuta la revisión manual de la demo |
| GET | `/projects/:projectId/automations/executions` | Últimas 20 evaluaciones |

El MVP admite solo `TASK_DUE_SOON` con `{ leadTimeMinutes }` y `TASK_STALE` con
`{ days }`. Ambos ejecutan `CREATE_NOTIFICATION`: el primero usa
`recipientSelector: 'ASSIGNEES'`; el segundo, `'PROJECT_OWNER'`. Las condiciones
se combinan por `AND`, hay un máximo de cinco acciones secuenciales y cada acción
se reintenta una sola vez. La revisión es manual a propósito: la pantalla ofrece
“Revisar ahora” para que la demostración no dependa del reloj ni de una cola.

### El catálogo real es más estrecho que el enum

⚠️ **`AutomationTriggerType` y `AutomationActionType` (`@praxis/contracts`) no
son el catálogo.** El enum declara `GITHUB_PULL_REQUEST_OPENED`, `MOVE_TASK` y
`SEND_EMAIL` porque vienen del diseño original; el validador de
`rule-definition.ts` los rechaza con «no soportado en el MVP académico». Quien
construya contra el contrato debe seguir al validador, no al enum — verificado
en runtime, `e2e/tests/api/17-automatizaciones.spec.ts`.

| Trigger | Config admitida | Condiciones (`field`) | Acción y destinatario |
|---|---|---|---|
| `TASK_DUE_SOON` | `{ leadTimeMinutes }`, entero ≥ 1, **obligatorio** | `priority` (texto), `dueDate` (`YYYY-MM-DD`), `assigneeCount` (entero ≥ 0) | `CREATE_NOTIFICATION` → `ASSIGNEES` |
| `TASK_STALE` | `{ days }`, entero ≥ 1, **opcional**, por defecto 7 | `staleDays` (entero ≥ 0), `overdue` (booleano), `withoutHistory` (booleano) | `CREATE_NOTIFICATION` → `PROJECT_OWNER` |

Operadores: `EQUALS`, `NOT_EQUALS`, `IN`. `IN` exige una **lista no vacía**; los
otros dos, un **valor escalar** — un array o un objeto con `EQUALS`/`NOT_EQUALS`
da 400, igual que un escalar con `IN`.

`priority` se compara con `===` contra `task.priority`: el validador solo exige
«texto no vacío», así que un valor fuera de `LOW`/`MEDIUM`/`HIGH`/`URGENT` **se
guarda sin error y no coincide nunca** con ninguna tarea.

Cinco trampas que ya mordieron construyendo la interfaz:

1. ⚠️ **`hasOnlyKeys` es estricto en `trigger.config` y en `action.config`.**
   Una clave de más —aunque el valor sea válido— da 400, igual que el
   `forbidNonWhitelisted: true` del gateway con el body entero.
2. ⚠️ **`recipientSelector` lo decide el trigger, no quien llama.** Mandar
   `PROJECT_OWNER` con `TASK_DUE_SOON` (o al revés) da 400. No es una opción de
   formulario: es una consecuencia del trigger elegido.
3. ⚠️ **`status` desde el cliente solo admite `ENABLED` o `DISABLED`.**
   `PAUSED_SYSTEM` e `INVALID` existen en el enum pero los pone el sistema;
   enviarlos da 400 con «Solo el sistema puede pausar o invalidar una regla».
4. 🔴 **`PATCH` es reemplazo total, no parcial.**
   `UpdateAutomationRuleBodyDto extends CreateAutomationRuleBodyDto`: `name`,
   `trigger`, `conditions` y `actions` son obligatorios en cada `PATCH`, incluso
   para cambiar solo `status`. No hay forma de desactivar una regla sin
   revalidarla entera — y una regla guardada antes de un endurecimiento del
   validador puede quedar **imposible de desactivar** por esa vía. Ver
   PENDIENTES-BACKEND-AUTOMATIZACION.md §2.
5. ⚠️ **`GET /automations` y `GET /automations/executions` no son la misma
   forma de tarea.** El primero trae `trigger`/`conditions`/`actions`
   embebidos y ordenados por `position`; el segundo, en `conditionResult`,
   solo trae `context` con los campos de condición — nunca `taskId` ni
   `taskTitle` de forma legible (`causeKey` los lleva incrustados en una
   cadena de deduplicación, no para leerse). Ver
   PENDIENTES-BACKEND-AUTOMATIZACION.md §3.

## Asistente 🔒

| Método | Ruta | Entrada | Permiso |
|---|---|---|---|
| GET | `/projects/:projectId/assistant/quota` | — | `canViewReports` |
| POST | `/projects/:projectId/assistant/chat` | `{ message, history? }` | `canViewReports` |
| GET | `/me/assistant/quota` | — | ninguno propio, solo `JwtGuard` |
| POST | `/me/assistant/chat` | `{ message, conversationId?, attachmentIds?, organizationId? }` | ninguno propio, solo `JwtGuard` |
| POST | `/me/assistant/project-draft` | `{ brief }` | ninguno propio, solo `JwtGuard` |
| POST | `/projects/:projectId/assistant/proposals/:id/resolve` | `{ status }` | `canViewReports` |
| POST | `/me/assistant/proposals/:id/resolve` | `{ status }` | ninguno propio, solo `JwtGuard` |

Las dos primeras cuelgan de `/projects/:projectId` para que el guard resuelva el
proyecto desde la ruta, igual que los reportes. La cuota es **del usuario**, no
del proyecto, pero va ahí porque sin proyecto en la ruta no hay nada contra lo
que comprobar el permiso — el mismo motivo por el que `/me/tasks` cuelga de
`/me`.

`GET /me/assistant/quota` es la misma cuota, sin proyecto: existe para
pantallas como Configuración, que no tienen ningún proyecto abierto. Sin
`ProjectPermissionGuard` — el usuario sale del token, como en `/me/tasks` y
`/me/notifications` — y reenvía al mismo `{ cmd: 'assistant_quota' }` que la
ruta de proyecto. Misma forma de respuesta que «La cuota», más abajo.

⚠️ **Las dos de proyecto pasaron de `canViewProject` a `canViewReports`.** El
asistente lee este mismo informe, así que quien no puede abrirlo tampoco puede
preguntarle por él: dejarlo abierto habría sido una puerta trasera al contenido
que la pantalla ya no enseña. `/me/assistant/quota` **no** cambia — es la cuota
del usuario, no de ningún proyecto, y Configuración la sigue leyendo sin
permisos de proyecto.

### `POST /me/assistant/chat` — hablar sin ningún proyecto

Misma entrada y misma salida que la de proyecto. Lo que cambia es todo lo demás:
**no hay proyecto, así que no hay contexto**. Sin briefing, sin miembros, sin
chat de equipo y sin permisos que filtrar.

Existe porque la otra cuelga de `/projects/:projectId` y exige `canViewReports`
sobre ese proyecto: para hablar de uno que **todavía no existe** habría que
inventarse un id que satisficiera al guard.

Las herramientas que se le declaran al modelo son **tres**, y ninguna sale de un
permiso porque ninguna toca datos de ningún proyecto:

| Herramienta | Qué propone |
|---|---|
| `proponer_pregunta` | Lo mismo que en el otro modo: desambiguar con opciones |
| `proponer_abrir_proyecto` | Cargar uno de **tus** proyectos en esta conversación |
| `proponer_plantilla` | La estructura de arranque de un proyecto nuevo |

⚠️ **`proponer_abrir_proyecto` se valida contra la lista que resuelve el
gateway** —`GET /projects?permission=canViewReports` con la sesión de quien
pregunta—, no contra lo que diga el modelo. Un id inventado, o el de un proyecto
ajeno, se descarta antes de llegar al navegador. Y aceptar no da acceso a nada:
carga el proyecto por el camino de siempre, con los guards de siempre.

⚠️ **Una conversación sin foco puede adoptar un proyecto; una con foco no lo
cambia.** El turno siguiente va por la ruta del proyecto con el mismo
`conversationId` y el servicio fija el foco ahí. Al revés —mandar un turno sin
proyecto a una conversación que ya lo tiene— responde **409**: se respondería sin
briefing, así que PRAX diría que no tiene datos de un proyecto que la pantalla
enseña como cargado.

### Los adjuntos de PRAX

| Método | Ruta | Entrada |
|---|---|---|
| POST | `/me/assistant/attachments` | **multipart**, campo `file` → 201 |
| GET | `/me/assistant/attachments/:id/content` | — |
| DELETE | `/me/assistant/attachments/:id` | — · **solo borradores propios** |

**Se sube antes de enviar el mensaje** y queda como borrador; el turno lo reclama
con `attachmentIds`. No es una preferencia de diseño: la pregunta viaja por una
Server Action, cuyo cuerpo está topado en 1 MB, y con el archivo dentro
cualquier foto de teléfono moría con un «Body exceeded 1 MB limit» de Next — sin
traducir y sin decir qué archivo.

Tres por mensaje, 5 MB cada uno, y solo PDF, PNG/JPEG/WebP, texto y Markdown.
⚠️ `text/x-markdown` **también**: Safari y algunos Linux declaran así un `.md`.

**Qué sobrevive al turno**, que es lo que hay que saber para escribir la pantalla:

| Tipo | En el turno que lo lleva | En los siguientes |
|---|---|---|
| `.txt`, `.md` | pegado como texto en el prompt | **sí**, su texto se guardó al subirlo |
| PDF | nativo, con su maquetación | **sí**, su capa de texto |
| PDF escaneado | nativo | no: no tiene capa de texto que guardar |
| Imagen | nativa, el modelo la ve | **no** — lo que queda es lo que PRAX dijo de ella |

Por eso el prompt le pide a PRAX **contar qué ve** cuando el turno lleva una
imagen: su propia respuesta es lo único que quedará. Y lo reinyectado tiene
presupuesto (`ASSISTANT_EXTRACT_BUDGET_CHARS`, 24 000 caracteres en total, del
más reciente hacia atrás), así que un bloque puede llegar recortado o reducido a
su nombre — el prompt le prohíbe hablar como si lo hubiera leído entero.

### `POST …/assistant/proposals/:id/resolve` — anotar lo que se decidió

**No aplica nada.** Solo deja escrito si una propuesta se aceptó o se descartó,
para que al releer el hilo dentro de una semana no vuelva a ofrecer un botón que
ya se pulsó. Aplicarla es otra petición, al endpoint de siempre y con su permiso;
el cliente llama aquí **después** de que aquella haya salido bien.

🔴 **La versión de `/me` existe porque la de proyecto respondía 404** a cualquier
tarjeta de una conversación sin foco: no hay `projectId` que poner en la ruta. Lo
que protege a las dos es que el `userId` sale del token y assistant-service
comprueba que la propuesta cuelga de una conversación de esa persona.

### `POST /me/assistant/project-draft` — la plantilla de un proyecto nuevo

Cuelga de `/me` por un motivo más fuerte que el de la cuota: **se pide para crear
un proyecto, así que el proyecto todavía no existe**. No hay `projectId` que
poner en la ruta ni permisos de proyecto que resolver.

```jsonc
// Entrada — la primera vez
{ "brief": "Somos un estudio de arquitectura de seis personas. Llevamos tres obras a la vez..." }

// Entrada — un ajuste sobre lo que ya propuso
{
  "brief": "…el mismo de antes…",
  "ajuste": "Quita el rol de becario y añade un tablero para licencias",
  "previa": "{\"nombre\":\"Estudio — obras 2026\", …}"  // el plan anterior, en JSON
}

// Salida (envuelta en { success, data, meta } como todo)
{
  "plantilla": {
    "nombre": "Estudio — obras 2026",
    "descripcion": "…",
    "etiquetas": [{ "nombre": "licencias", "color": "warning" }],
    "roles": [{ "nombre": "Aparejador", "permisos": { "canCreateTask": true } }],
    "espacios": [
      { "nombre": "Obras", "tableros": [
        { "nombre": "Obra Chamberí", "columnas": [
          { "nombre": "Proyecto" }, { "nombre": "Entregado", "color": "success" }
        ] }
      ] }
    ],
    "porQue": "Un tablero por obra porque llevas tres a la vez y…"
  },
  "cuota": { "plan": "FREE", "usados": 3, "limite": 5 }
}
```

- **429** cuota agotada, con la cuota en `details`.
- **502** Gemini no respondió, o respondió algo inservible. En el primer caso
  **no se ha consumido cuota**.

⚠️ **`permisos` es un diccionario de booleanos**, no el array que el modelo
rellena: la conversión la hace assistant-service al validar. Trampa 8.

⚠️ **`color: "success"` en una columna no es un color, es un significado**:
marca la columna de cierre. El servicio recorta a una sola por tablero.

⚠️ **`previa` es una cadena JSON, no un objeto.** El `ValidationPipe` corre con
`forbidNonWhitelisted` y un objeto anidado obligaría a seis clases DTO para algo
que el servicio solo reenvía al modelo como texto del turno anterior. Tope en
`PLANTILLA_PREVIA_MAX`. Con `ajuste` **y** `previa` ajusta; sin ellos genera de
cero. **Cuesta una consulta de cuota en los dos casos.**

**No crea nada.** Materializarlo son N peticiones del frontend a los endpoints de
siempre, y esa lista está abajo.

### ⚠️ Ninguna de las dos escribe nada

`chat` devuelve **propuestas**, no hechos. Si el asistente dice que ha creado,
movido o cambiado algo, está mintiendo: mira la tabla.

Aplicar una propuesta es **otra petición**, y siempre a un endpoint que ya
existía, con su permiso de siempre:

| `tool` | Endpoint al aceptar | Permiso |
|---|---|---|
| `proponer_tarea` | `POST /boards/:boardId/tasks` | `canCreateTask` |
| `proponer_asignacion` | `POST /tasks/:id/assign` | `canEditTask` |
| `proponer_edicion` | `PATCH /tasks/:id` | `canEditTask` |
| `proponer_movimiento` | `POST /tasks/:id/move` | `canMoveTask` |
| `proponer_checklist` | `POST /tasks/:id/checklists` | `canEditTask` |
| `proponer_comentario` | `POST /tasks/:id/comments` | `canComment` |

Y la plantilla de arranque, que no es una `tool` del chat sino la respuesta de
`project-draft`, se materializa igual — un endpoint por trozo, todos existentes:

| Trozo del plan | Endpoint al aceptar |
|---|---|
| `nombre`, `descripcion` | `POST /projects` |
| `etiquetas[]` | `POST /projects/:id/labels` |
| `roles[]` | `POST /projects/:id/roles` |
| `espacios[]` | `POST /projects/:id/workspaces` |
| `espacios[].tableros[]` | `POST /workspaces/:id/boards` |
| `…tableros[].columnas[]` | `POST /boards/:id/columns` |
| El color de una columna | `PATCH /boards/:id/columns/:columnId` |

Sin permiso no hace falta comprobar nada: el proyecto lo acaba de crear quien
acepta, así que nace con rol de administración y con esa persona dentro
(trampa 7). Lo ejecuta `commons/plantilla/aplicar.ts`.

**No hay ninguna vía de escritura nueva.** Sin el permiso de la fila, aceptar
falla igual que le fallaría a esa persona pulsando el botón a mano.

⚠️ **Ninguna borra, y no es un descuido.** No existe herramienta de borrado, así
que el modelo no tiene forma de expresar esa intención; el servicio descarta
cualquier `tool` fuera de esta tabla, y quien la ejecuta solo sabe llamar a estos
endpoints. Son tres capas y ninguna depende de que el modelo obedezca. Si añades
una herramienta, sabe que rompes las tres a la vez.

### `chat`

```ts
// entrada
{ message: string,                          // 1–2 000 caracteres
  history?: [{ role: 'user' | 'model', text: string }] }   // máx. 12 turnos, 2 000 c/u

// salida
{ reply: string,
  proposals: [{ tool, args }],
  cuota: { plan, usados, limite, periodo, reinicia } }
```

**El historial lo manda el cliente y el servidor no lo guarda** — no hay tabla de
conversaciones. Pasarse de 12 turnos da 400, así que recórtalo antes de mandarlo.

`args` de `proponer_tarea`: `title`, `description?`, `columnId`, `columnName`,
`priority`, `dueDate?` (`YYYY-MM-DD`), `assigneeIds?`, `labelIds?`, `porQue`.
`columnName` viaja ya resuelto porque **`status` tiene que igualar el nombre de
la columna destino** al crear la tarea.

Las otras cinco actúan sobre una tarea que ya existe y comparten `taskId` y
`taskTitle` — el título va resuelto por el servicio contra su inventario, para
que la confirmación pueda nombrar la tarea sin ir a buscarla:

| `tool` | Resto de `args` |
|---|---|
| `proponer_asignacion` | `assigneeIds` (lista **completa**: sustituye) |
| `proponer_edicion` | `title?`, `description?`, `priority?`, `dueDate?`, `labelIds?` — **solo los que cambian** |
| `proponer_movimiento` | `columnId`, `columnName`, `columnaActual?` |
| `proponer_checklist` | `items: string[]` (1–10, **se suman** a los que haya) |
| `proponer_comentario` | `body` (máx. 2 000) |

⚠️ **Aun así, comprueba la tarea con un `GET /tasks/:id` antes de aceptar.** El
servicio ya validó el `taskId` contra el inventario del proyecto, pero la
propuesta ha pasado por el navegador: entre proponer y aceptar la tarea puede
haberse borrado. Comprobar que es de **este** proyecto evita además un 403 que
se leería como un fallo de permisos de quien acepta.

⚠️ En `proponer_edicion`, **omitir un campo no es lo mismo que mandarlo vacío**:
lo omitido se queda como estaba, lo vacío se borra. Manda al `PATCH` solo lo que
la propuesta trae, sin rellenar huecos.

⚠️ `POST /tasks/:id/checklists` **crea un paso por llamada**, así que un
`proponer_checklist` son N peticiones y no una. Van en secuencia: el `order` es
la posición, y lanzadas en paralelo el orden lo decide quién llegue antes. No hay
transacción que las abarque — si falla a mitad, las anteriores ya están creadas y
hay que decirlo.

`porQue` es obligatorio en las seis y es el texto que explica **por qué** se
propone. Con function calling lo normal es que el modelo devuelva la llamada y ni
una palabra, y por eso es un parámetro y no una petición del prompt. Píntalo
**dentro de cada tarjeta**: con varias propuestas en una respuesta —cosa
habitual desde que el contexto trae las tareas— un bloque de razones aparte no se
puede emparejar con la tarjeta que justifica.

### Códigos propios

| Código | Cuándo | Qué hacer |
|---|---|---|
| **429** | Cuota mensual agotada | El cuerpo trae `error.details.cuota`: pinta el contador al tope y la fecha de `reinicia` |
| **502** | Gemini no respondió | **No se ha consumido cuota.** Se puede reintentar |

### La cuota

```ts
{ plan: 'FREE' | 'PRO', usados, limite, periodo: 'YYYY-MM', reinicia: ISO }
```

`FREE` da 50 mensajes al mes y `PRO` 500. **No hay pasarela de pago**: pasar a
`PRO` es hoy un `UPDATE` a mano en `assistant.assistant_subscriptions`, así que
no montes una pantalla de suscripción — prometería algo que no existe.

Se consume **después de una respuesta correcta**: si Gemini falla no se cobra.
Enseña el número que venga en cada respuesta y no lleves una cuenta local: un
contador que diga «quedan 12» mientras el servidor rechaza el siguiente es peor
que no tener contador.

### Lo que ve el modelo, y lo que decide

El contexto sale del briefing de `reports-service`: columnas, etiquetas,
instantánea, **avance**, **la semana**, **lo que está parado**, percentiles,
predicción, el desglose por persona con su experiencia por etiqueta y **el
inventario de tareas**. No entran descripciones, comentarios ni adjuntos.

`tareas` trae **todas** las del proyecto con `id`, `titulo`, `columna`,
`columnId`, `prioridad`, `vence`, `cerrada`, `encargados` y `etiquetas`. Es lo
que permite pedirle cosas por nombre —«las que no tienen encargado»— y sacar el
`taskId` de las cinco herramientas que actúan sobre algo existente. Antes solo
había agregados, y con «5 sin asignar» no se puede apuntar a ninguna.

⚠️ **Es el bloque más caro del briefing y el único que crece con el proyecto.**
Viaja entero en cada turno dentro de la instrucción de sistema: con 69 tareas el
briefing pesa ~32 KB. El tope duro es `LIMITE_INVENTARIO` en tasks-service, y es
un cortafuegos contra la ventana del modelo, no un criterio de producto.

El desglose por persona ya no va condicionado: hablar con el asistente exige
`canViewReports`, el mismo permiso que antes filtraba esa parte del briefing.

⚠️ **Las cuentas vienen hechas, y eso es a propósito.** `avance` trae el
porcentaje ya calculado y `semana` la variación: el modelo hace aritmética simple
sobre lo que tiene delante, pero las cifras que acaban repitiéndose en una reunión
no dependen de que hoy le salga bien. Lo que **no** puede es estimar duraciones,
deducir fechas de entrega ni suponer un ritmo que nadie midió.

Las herramientas se filtran por permisos antes de declarárselas: sin
`canCreateTask` no existe `proponer_tarea`, así que el modelo **no puede ni
sugerirlo**. Con cero herramientas responde diciendo que esa persona no puede
hacerlo, en vez de quedarse mudo.
