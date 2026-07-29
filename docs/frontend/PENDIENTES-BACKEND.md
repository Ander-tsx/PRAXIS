# Pendientes del equipo de backend

> Lista de cosas que el frontend necesita del backend y no puede resolver por su
> cuenta. Escrita por el equipo de frontend; **no modificamos `apps/backend/`**.
>
> Cada punto indica si está **verificado en runtime** (reproducido contra el
> stack levantado) o **leído en el código**.
>
> Última revisión: 2026-07-29 · gateway en `localhost:3000`
>
> **Estado: 12 de 15 resueltos.** El equipo de frontend recibió autorización para
> tocar `apps/backend/` y los ha ido cerrando; cada punto resuelto lleva el
> commit y cómo se verificó. Lo que queda abierto está al principio.

---

## Cómo leer esta lista

| Severidad | Significado |
|---|---|
| 🔴 Crítico | Fallo de seguridad o de corrección. Debe arreglarse antes de producción |
| 🟠 Alto | Bloquea o deforma una pantalla que tenemos que construir |
| 🟡 Medio | Nos obliga a un rodeo, pero hay forma de avanzar |
| 🔵 Bajo | Inconsistencia o deuda. No bloquea nada |

**La numeración es estable y no se reordena.** Se cita desde el código
(`Ver PENDIENTES-BACKEND.md §2`), así que los puntos nuevos se añaden al final
con su severidad en el título, aunque queden fuera del orden por impacto.

---

## Resumen

### Abiertos

| # | Severidad | Qué | Verificado |
|---|---|---|---|
| 5 | 🟠 | Faltan `GET /users/me` y «mis tareas» (lo demás de este punto ya está) | código |
| 6 | 🟡 | `Project.name` es único **global**: dos equipos no pueden tener un "Sprint 1" | diseño |
| 8 | 🟡 | Falta `canDeleteProject`; `reorder` de columnas exige `canCreateColumn` | código |
| 10 | 🔵 | `PATCH /users/:id` entra en snake_case y sale en camelCase; `AuthResponseDto` muerto | runtime |

### Resueltos

| # | Severidad | Qué | Commit |
|---|---|---|---|
| 1 | 🔴 | Cualquiera podía editar o borrar la cuenta de otro | `94721d8` |
| 2 | 🔴 | El `ValidationPipe` no se aplicaba en 22 de 28 endpoints | `94721d8` `477616f` `2bad47c` |
| 9 | 🔴 | El `projectId` del body decidía el permiso: escritura entre proyectos | `48a0058` |
| 11 | 🔴 | Un rol mal formado se creaba con 201 y no concedía nada | `477616f` `9c03e87` |
| 14 | 🔴 | Los dos `GET` de tareas no pedían ningún permiso | `48a0058` |
| 15 | 🟠 | Borrar un tablero dejaba sus tareas huérfanas para siempre | `PENDIENTE` |
| 3 | 🟠 | `GET /projects` devolvía todos los del sistema | `477616f` |
| 4 | 🟠 | Filtros por body en peticiones GET | `94721d8` `477616f` |
| 12 | 🟠 | No existía ningún flujo de invitación | `a88e804` |
| 13 | 🟠 | Sin permiso de lectura: no había rol observador | `477616f` |
| 7 | 🟡 | Un proyecto nacía sin roles ni miembros | `477616f` |
| — | 🟡 | Nombre duplicado devolvía 500 (proyectos y espacios) | `477616f` `fb4a758` |

**Lo que más pesa de lo que queda:** el punto 6, porque es una decisión de
diseño del modelo y no un arreglo; y el 5, que bloquea los avisos del panel.

---

## ✅ 1. ~~Cualquier usuario puede editar o eliminar la cuenta de otro~~

> **Resuelto** en `94721d8`. `AccountOwnerGuard` deja pasar solo al dueño de la
> cuenta o a un administrador global. La segunda vía también: el payload se
> compone como `{ ...body, id }`, con el id de la ruta al final, así que un `id`
> colado en el cuerpo ya no lo pisa —ahora ni siquiera llega, porque el DTO no
> lo declara y el pipe responde 400.
>
> Verificado: miembro sobre cuenta ajena → 403 en `PATCH` y en `DELETE`; `id`
> ajeno en el cuerpo → 400.


**Verificado en runtime.** `PATCH` y `DELETE /api/users/:id` solo llevan
`JwtGuard`. No comprueban que el `:id` coincida con el del token ni exigen rol
global.

```
# con el token de una cuenta recién creada, contra el id de otra cuenta
PATCH  /api/users/{id_ajeno}  → 200, perfil modificado
DELETE /api/users/{id_ajeno}  → 200, cuenta eliminada
```

Hay una **segunda vía** por si se añade la comprobación solo sobre el parámetro
de ruta: el gateway compone el payload como `{ id, ...body }`, con el body
expandido **después**, así que un `id` en el cuerpo pisa el de la ruta. Un
atacante puede llamar a su propia URL y modificar a otro. Comprobado.

`apps/backend/gateway/src/users/user.controller.ts:61`

> Comparar con `projects.controller.ts:49`, que inyecta `ownerId` **después**
> del spread y por eso no es vulnerable. El orden correcto es `{ ...body, id }`.

**Impacto en el frontend:** ninguno técnico, pero la página de perfil se apoya
en este endpoint. No la publiquemos con esto abierto.

---

## ✅ 2. ~~El `ValidationPipe` no se aplica en 22 de los 28 endpoints~~

> **Resuelto** en `94721d8`, `477616f` y `2bad47c`. Todos los `@Body()` declaran
> ahora una **clase** `*BodyDto` real en vez de `Omit<XDto, ...>`. El patrón
> quedó: el DTO base es lo que manda el cliente, y el DTO completo lo extiende
> añadiendo lo que inyecta el gateway (`requesterId`, ids de ruta).
>
> Verificado: `PATCH /users/:id` con `{"firstName":"X"}` → 400 "property
> firstName should not exist"; con `{"first_name":"A"}` → 400 "al menos 2
> caracteres". Se acabó el 200 mentiroso.


**Verificado en runtime.** Solo validan los que declaran una **clase** DTO en
`@Body()`. Los demás usan `@Body() body: Omit<XDto, '...'>`, y un tipo de
TypeScript no existe en runtime: el metatype llega como `Object` y el pipe se
desentiende.

| Petición | Esperado | Real |
|---|---|---|
| `POST /projects` con campo inventado | 400 | **201** |
| `POST /projects` con `name` de 1 char (DTO exige 2) | 400 | **201** |
| `PATCH /users/:id` con `firstName` en vez de `first_name` | 400 | **200 sin cambiar nada** |
| `POST /auth/register` con campo inventado | 400 | 400 ✅ |

**Sí validan (6):** `/auth/login`, `/auth/register`, los tres de `/permissions`
y `GET /users`.

**No validan (22):** todo `projects`, `workspaces`, `boards`, `columns`,
`members`, `project-roles`, `tasks`, `checklists` y `PATCH /users/:id`.

Los microservicios reciben clases DTO con `whitelist` y `forbidNonWhitelisted`,
pero en la práctica tampoco frenan estos payloads.

**Arreglo:** declarar clases DTO reales en el `@Body()` en vez de `Omit<>`, o
aplicar el pipe explícitamente por parámetro.

**Lo más grave no es la permisividad, es el 200 mentiroso:** un `PATCH` con el
casing equivocado responde éxito sin haber guardado nada.

---

## ✅ 3. ~~`GET /api/projects` devuelve todos los proyectos del sistema~~

> **Resuelto** en `477616f`. `FindProjectsDto` declara `userId` y el servicio
> filtra por **dueño o miembro** (`OR` sobre `ownerId` y `members.some`), que era
> lo que hacía falta y no solo corregir el nombre del campo.
>
> Verificado con 7 proyectos en el sistema: admin ve 2, y el otro usuario ve 2
> incluida una donde solo es miembro.


**Leído en el código.** El gateway envía `{ userId }`, pero `FindProjectsDto`
solo declara `ownerId`. El servicio hace `if (dto.ownerId) where.ownerId = …`,
nunca se cumple, y el `where` queda vacío.

Y aunque se corrigiera el nombre, filtraría por **propietario**, no por
membresía: alguien invitado a un proyecto ajeno no lo vería.

**Lo que necesitamos:** proyectos donde el usuario es **owner o miembro**.

**Impacto:** bloquea el dashboard y la lista de proyectos. Sin esto solo
podemos mostrar todo a todos, que es justo lo contrario del modelo de permisos.

---

## ✅ 4. ~~`GET /projects` y `GET /users` reciben filtros por body~~

> **Resuelto** en `94721d8` y `477616f`. Los dos aceptan query params
> (`page`, `limit`, `sortBy`, `sortOrder`, `search`). Las clases `*QueryDto` los
> aplanan para la URL y los pliegan a la forma anidada que espera el
> microservicio, que no cambió de contrato.
>
> Verificado: `?search=admin` → 1 resultado; `?limit=999` → 400 (máximo 100).


**Leído en el código.** Ambos usan `@Body()` en un `GET`. `fetch` no puede
enviar cuerpo en un GET, así que desde el navegador **no hay forma de paginar ni
de buscar**: siempre recibimos la página 1 con el límite por defecto.

**Arreglo:** migrar a query params, como ya hace bien
`GET /boards/:boardId/tasks`.

---

## 🟠 5. Faltan endpoints de lectura

| Endpoint | Estado |
|---|---|
| Permisos efectivos en un proyecto | ✅ `GET /projects/:id/permissions/me` (`477616f`) |
| `GET /api/projects/:id/roles` | ➖ innecesario: vienen embebidos en el detalle |
| `GET /api/boards/:id/columns` | ➖ ídem |
| `GET /api/users/me` | ❌ **falta** |
| `GET /api/tasks?assigneeId=…` (mis tareas) | ❌ **falta**, y es la que más duele |

- ✅ **Permisos efectivos: resuelto** en `477616f`. Nueva ruta
  `GET /projects/:projectId/permissions/me`, que devuelve el mapa completo ya
  expandido por jerarquía, con los denegados en `false`, más `isOwner`. La
  lógica ya existía en el microservicio; solo faltaba exponerla.

  (`POST /api/permissions/check` no servía: solo verifica **roles globales**.)

- ❌ Sin **mis tareas**, el panel no puede mostrar en qué está trabajando cada
  persona sin una cascada de peticiones por cada tablero de cada proyecto. Es la
  pieza que falta para que el panel sea realmente útil, y **sigue abierta**.

- ❌ `GET /users/me` **sigue faltando**: cada pantalla privada saca el `sub` del
  JWT y pide `/users/:id` aparte. Funciona, pero es una petición de más en cada
  carga.

Los dos de tablero (`/projects/:id/roles`, `/boards/:id/columns`) dejaron de
molestar en la práctica: el detalle del proyecto trae el árbol entero embebido,
así que la interfaz no los necesita.

---

## 🟡 6. El nombre de proyecto es único a nivel global

> El 500 **está resuelto** en `477616f`: se captura el P2002 y sale un 409 con
> mensaje. Lo mismo para los espacios de trabajo en `fb4a758`.
>
> **Sigue abierto el problema de diseño que había debajo**, que es lo que ahora
> da nombre a este punto.

**Leído en el código.** `Project.name` es `@unique` **sin más**: no por
propietario, no por organización. Dos equipos que no se conocen no pueden tener
cada uno un proyecto llamado "Sprint 1", y el segundo recibe un conflicto que no
puede entender porque el proyecto que choca no es visible para él.

**Impacto:** hoy la interfaz dice "ya existe un proyecto con ese nombre; los
nombres son únicos en toda la plataforma, prueba con uno más específico". Es lo
más honesto que se puede decir, y sigue siendo una mala experiencia.

**Arreglo:** `@@unique([ownerId, name])`, o por organización cuando exista ese
concepto. Es un cambio de esquema con migración, así que es **decisión vuestra**
y no algo que vayamos a tocar por nuestra cuenta.

> Nota: `Workspace` sí lo hace bien —`@@unique([projectId, name])`— y ahí la
> unicidad por proyecto es justo lo que se quiere.

---

## ✅ 7. ~~Un proyecto nuevo nace sin roles ni miembros~~

> **Resuelto** en `477616f`. `createProject` va en transacción y crea también un
> rol "Administrador" con los doce permisos y un `ProjectMember` para el dueño.
> Un proyecto recién creado ya es usable: se puede invitar a alguien sin pasos
> intermedios.
>
> Verificado: proyecto nuevo → 1 rol, 1 miembro, y `POST members` responde 201
> acto seguido.


**Leído en el código.** `createProject` solo inserta la fila: no crea un rol por
defecto ni añade al owner como `ProjectMember`. El owner tiene acceso porque el
guard hace bypass por `ownerId`, pero:

- `GET /projects/:id/members` devuelve vacío
- `POST /projects/:id/members` exige un `projectRoleId` que **todavía no existe**

**Consecuencia:** la UI está obligada a forzar el orden *crear proyecto → crear
rol → añadir miembros*. Sería más natural que el backend creara un rol de
administrador y metiera al owner al crear el proyecto.

Y como no hay **catálogo de roles** —cada proyecto define los suyos desde
cero—, el frontend tendrá que ofrecer plantillas ("Administrador",
"Colaborador", "Observador") y crearlas él con `POST /projects/:id/roles`. Eso
mete una decisión de producto en el cliente, que no es su sitio: si mañana el
backend define plantillas, habrá dos fuentes de verdad.

---

## 🟡 8. Permisos con nombres que no corresponden a la acción

**Leído en el código.**

| Endpoint | Exige | Debería | Estado |
|---|---|---|---|
| `GET /projects/:id` (ver) | ~~`canEditBoard`~~ → `canViewProject` | — | ✅ `477616f` |
| `DELETE /projects/:id` | `canDeleteBoard` | `canDeleteProject` (no existe) | ❌ abierto |
| `PATCH /boards/:id/columns/reorder` | `canCreateColumn` | `canEditColumn` | ❌ abierto |

`canEditColumn` ya **está en el enum** (`477616f`), pero sigue sin usarlo ningún
endpoint: el `reorder` continúa pidiendo `canCreateColumn`, así que quien puede
crear columnas puede reordenarlas aunque no debiera poder editarlas.

Y `canDeleteProject` sigue sin existir: borrar un proyecto entero exige
`canDeleteBoard`, un permiso de otra cosa y de menor alcance.

---

## ✅ 9. ~~Las rutas de tarea usan `:id` pero el guard busca `taskId`~~

> **Resuelto** en `48a0058`, y **subió de 🟡 a 🔴 al reproducirlo**: no era una
> fragilidad, era un bypass de autorización completo.
>
> El guard resuelve ahora el `projectId` **solo desde la ruta** (`params.id` en
> `TasksController`, `params.taskId` en `ChecklistsController`) y lo deja en
> `request.projectId`, que el controlador inyecta **después** del spread del
> cuerpo. `projectId` desapareció de los DTO de cuerpo: mandarlo da 400.
> Y tasks-service comprueba además que la tarea pertenezca de verdad a ese
> proyecto, porque un microservicio no puede fiarse de quien lo llama.
>
> Verificado con dos cuentas: los cinco casos de abajo dan 403, el camino
> legítimo sigue en 200 sin `projectId`, y mandarlo responde
> `400 "property projectId should not exist"`.

**Verificado en runtime (2026-07-29).** El diagnóstico original —el guard busca
`params.taskId` y `TasksController` declara `:id`, así que cae al fallback
`body.projectId`— era correcto, pero se quedaba corto en la consecuencia.

El fallback no era un apaño: era una **credencial que elegía el cliente**. El
guard aceptaba el `projectId` del cuerpo, comprobaba el permiso sobre *ese*
proyecto —concediéndolo por `ownerId` si era tuyo— y después nadie comparaba
con el proyecto real de la tarea. Ni el guard ni tasks-service.

Reproducido con `A` (admin) y `B`, sobre un proyecto de `B` que `A` **no ve**
en `GET /projects`:

| Petición de `A` sobre la tarea de `B` | Antes | Ahora |
|---|---|---|
| `GET /tasks/:id` | 200, tarea completa | **403** |
| `GET /boards/:boardId/tasks` | 200, el tablero entero | **403** |
| `PATCH /tasks/:id` con `projectId` de un proyecto de `A` | 200, título cambiado | **403** |
| `POST /tasks/:taskId/checklists` ídem | 201 | **403** |
| `DELETE /tasks/:id` ídem | 200, tarea borrada | **403** |

Las dos primeras filas son en realidad el **punto 14**, que es un fallo
distinto: esas rutas no pedían ningún permiso, así que ni siquiera hacía falta
el truco del `projectId`.

El dato que cerró el diagnóstico: la misma llamada **sin** `projectId` en el
cuerpo ya devolvía 403 correctamente. La vía de resolución buena existía desde
el principio; el fallback del cuerpo la cortocircuitaba.

> Comprobado también que un rol de solo `canViewProject` en el proyecto ajeno
> lee (200) pero no escribe (403): el permiso se evalúa de verdad, no es que
> todo pase por ser dueño.

---

## 🔵 10. Inconsistencias de contrato

- `PATCH /users/:id` **acepta** `first_name` / `last_name` (snake_case) y
  **devuelve** `firstName` / `lastName` (camelCase). Sigue así a propósito:
  cambiarlo rompería a cualquiera que ya lo use, y ahora al menos el pipe avisa
  con un 400 claro si te equivocas de casing.
- `AuthResponseDto` en `@praxis/contracts` declara `access_token`, pero
  credentials-service emite `accessToken`. El DTO está muerto y desorienta.
- `POST /auth/register` no acepta nombre ni apellido: crea el perfil vacío.
  Acordamos completarlo después desde la página de datos del usuario, así que
  **no hace falta cambiarlo** — queda anotado para que no sorprenda.

---

## ✅ 11. ~~Un rol de proyecto mal formado se crea con 201 y no concede nada~~

> **Resuelto** en `477616f` (entrada) y `9c03e87` (datos ya guardados).
>
> `IsPermissionMap` rechaza arrays, claves fuera del enum y valores no
> booleanos. Y como los roles creados **antes** seguían en la base con un array,
> `normalizePermissions` los convierte al leer: recuperan el significado que
> tenían al crearlos, sin migración de datos.
>
> Verificado: array / clave inventada / valor no booleano → 400 con mensaje que
> dice qué falla. Un rol legado `["canCreateBoard","canEditBoard"]` pasó de
> conceder solo `canViewProject` a conceder los tres.


**Verificado en runtime (2026-07-28).** Es la forma más peligrosa del punto 2:
aquí no se ignora un campo, se crea un **rol entero que parece existir y está
vacío**.

`CreateProjectRoleDto` declara `permissions` como **diccionario**
(`@IsObject()`), pero nada lo valida, así que un **array** también se acepta:

```
POST /projects/:id/roles  {"name":"Admin","permissions":["canEditBoard"]}   → 201 ✅
POST /projects/:id/roles  {"name":"Admin","permissions":{"canEditBoard":true}} → 201 ✅
```

Las dos respuestas son idénticas en forma. Pero el guard evalúa
`effective[permission]` sobre ese valor, y sobre un array eso es `undefined`.
Reproducido con dos cuentas y el mismo miembro:

| Permisos guardados como | `GET /projects/:id` (exige `canEditBoard`) |
|---|---|
| `["canCreateBoard","canEditBoard"]` | **403** |
| `{"canEditBoard":true,"canEditTask":true}` | **200** |

Tampoco se validan los nombres contra `ProjectPermission`:

```
POST /projects/:id/roles  {"name":"Inventado","permissions":{"canHackearTodo":true}}  → 201
```

**Por qué importa más que el punto 2:** un administrador de proyecto crea el
rol, la interfaz le dice que se guardó, ve el rol en la lista con sus permisos,
se lo asigna a alguien — y esa persona no puede hacer nada. No hay ningún
mensaje de error en ningún punto de la cadena.

**Arreglo:** declarar la clase DTO real en el `@Body()` y validar las claves
contra el enum `ProjectPermission`, rechazando arrays y claves desconocidas.

`apps/backend/commons/contracts/src/projects/project-role.dto.ts`
`apps/backend/services/projects/src/project-roles/project-roles.service.ts:108`

---

## ✅ 12. ~~No existe ningún flujo de invitación~~

> **Resuelto** en `a88e804`. Modelo `ProjectInvitation` con estados
> `PENDING` / `ACCEPTED` / `REJECTED` / `CANCELLED`.
>
> La regla que lo define: **la membresía se crea al aceptar, no al invitar.**
> Mientras está pendiente no hay `ProjectMember`, así que no hay permisos y el
> proyecto no aparece en la lista de esa persona.
>
> ```
> POST   /projects/:id/invitations      invitar (canManageMembers)
> GET    /projects/:id/invitations      pendientes del proyecto
> DELETE /projects/:id/invitations/:id  retirar una pendiente
> GET    /me/invitations                las mías
> POST   /me/invitations/:id/accept     aceptar y entrar
> POST   /me/invitations/:id/reject     rechazar
> DELETE /projects/:id/membership/me    salir del proyecto
> ```
>
> Responder cuelga de `/me` y no del proyecto: `ProjectPermissionGuard` exigiría
> permisos sobre un proyecto en el que aún no estás, que es justo la situación de
> una invitación pendiente.
>
> Verificado: invitar → 0 miembros y no ve el proyecto; aceptar → 1 miembro y ya
> lo ve; aceptar dos veces → 409; salir → deja de verlo; el dueño intenta salir
> → 409; aceptar la invitación de otro → 404.
>
> **Sigue sin haber aviso**: no hay correo ni notificaciones. La persona se
> entera al entrar al panel, donde las invitaciones salen arriba.


**Verificado en el código.** Buscado en todo `apps/backend`:

- `invitation|invite|invitac` → **cero resultados**
- `nodemailer|smtp|sendgrid|resend|mailer` → **cero resultados**

No hay tabla de invitaciones, ni estados, ni token, ni canal de aviso.

Lo que hay es un alta directa:

```
POST /projects/:projectId/members   { userId, projectRoleId }
```

Recibe un **`userId`**, no un correo. Y surte efecto inmediato: la persona
queda dentro del proyecto sin enterarse, sin poder aceptar ni rechazar, y sin
estado "pendiente".

**Lo que el frontend puede hacer hoy:** resolver correo → `userId` con
`GET /users` y mandar el id. Funciona, con tres límites:

1. Solo encuentra a quien **ya tiene cuenta**; no se puede invitar a alguien que
   no se ha registrado.
2. `GET /users` recibe filtros por body en un GET (punto 4), así que la búsqueda
   por correo se hace **en el cliente** sobre la primera página. Con pocos
   usuarios va; no escala.
3. Sigue sin haber aceptación, así que la interfaz tiene que llamarlo **"añadir
   miembro"** y no "invitar". Prometer una invitación que nadie recibe sería
   mentir en la propia UI.

`Credential.email` sí es `@unique`, así que sirve como identificador; lo que
falta es el flujo alrededor.

**Lo que necesitamos, por orden de utilidad:**

1. `POST /projects/:id/members` que acepte **email** además de `userId`.
2. Modelo de invitación con estados (`pendiente` / `aceptada` / `rechazada` /
   `caducada`) y token.
3. Un canal de aviso. Aunque no haya correo, una bandeja de invitaciones
   consultable (`GET /invitations`) ya haría el flujo real y es puramente
   backend.

---

## ✅ 13. ~~No existe permiso de lectura: el rol "observador" no se puede modelar~~

> **Resuelto** en `477616f`. Se añade `canViewProject` al enum y `GET
> /projects/:id` lo exige en vez de `canEditBoard`. Cualquier permiso lo implica,
> y eso se resuelve en `expandPermissions` y no en la tabla de jerarquía, para
> que no se olvide al añadir permisos nuevos. También se añadió `canEditColumn`,
> que estaba en el DTO y en la jerarquía pero faltaba en el enum.
>
> Verificado con un rol de solo `canViewProject`: `GET` 200, `PATCH` 403, crear
> rol 403.


**Verificado en runtime y en el código.** El enum `ProjectPermission` tiene diez
permisos y **todos son de escritura o de gestión**:

```
canCreateTask   canEditTask   canDeleteTask
canCreateBoard  canEditBoard  canDeleteBoard
canCreateColumn canDeleteColumn
canManageMembers  canManageRoles
```

Ver un proyecto (`GET /projects/:id`) exige `canEditBoard` (punto 8). La
consecuencia no es solo un nombre feo: **para que alguien pueda mirar un
proyecto hay que darle permiso de editar tableros.** Un perfil de solo lectura
—cliente, dirección, auditoría— es imposible de representar.

Además `canEditBoard` arrastra `canCreateBoard` por la jerarquía implícita
(`PERMISSION_HIERARCHY` en `project-roles.service.ts:22`), así que el supuesto
observador acaba pudiendo crear tableros.

**Arreglo:** añadir `canViewProject` (o equivalente) al enum, exigirlo en los
`@Get` y dejar `canEditBoard` para lo que su nombre dice.

> Nota: la jerarquía implícita en sí está bien resuelta y la respetamos en la
> interfaz — marcar "eliminar" enciende "editar" y "crear". El problema es que
> no hay nada por debajo de "crear".

---

## ✅ 14. ~~Los dos `GET` de tareas no exigían ningún permiso~~

> **Resuelto** en `48a0058`. Los dos declaran ahora
> `@RequireProjectPermission(CAN_VIEW_PROJECT)`, que es el permiso que existe
> desde el punto 13 justo para esto.
>
> Verificado: cuenta sin relación con el proyecto → 403 en las dos; miembro con
> un rol de solo `canViewProject` → 200 en las dos y 403 al editar.

**Verificado en runtime (2026-07-29).** Se encontró reproduciendo el punto 9,
pero **es un fallo distinto** y por eso va aparte: aquí no hacía falta ningún
truco con el `projectId`, bastaba un JWT válido.

```
GET /api/tasks/:id              → 200, la tarea de cualquiera
GET /api/boards/:boardId/tasks  → 200, el tablero entero de cualquiera
```

Ninguna de las dos llevaba `@RequireProjectPermission`. El comentario del
código decía «la membresía basta», pero **no había nada que comprobara la
membresía**: `ProjectPermissionGuard` deja pasar de largo cuando el handler no
declara permiso (`if (!requiredPermission) return true`).

Con el id de una tarea —que viaja en cualquier URL de tablero— cualquier cuenta
registrada leía el título, la descripción, la fecha, el encargado y el checklist
entero de un proyecto al que no pertenece. Y con el `boardId`, el tablero
completo de una sola petición.

`apps/backend/gateway/src/tasks/tasks.controller.ts`

---

## ✅ 15. ~~Borrar un tablero dejaba sus tareas en la base para siempre~~

> **Resuelto** en `PENDIENTE`. El gateway avisa a tasks-service (`task_purge`)
> después de borrar un proyecto, un espacio o un tablero. Al borrar un espacio
> los tableros se leen **antes**, porque el cascade interno de projects-service
> los arrastra y después ya no habría forma de saber qué tareas quedaron sin
> sitio.
>
> Va en el gateway y no en projects-service: hacer que projects llamara a tasks
> montaría un ciclo entre los dos, y el gateway ya habla con ambos.
>
> Verificado: borrar un tablero se lleva solo sus tareas y deja las del vecino;
> borrar el espacio se lleva las de todos sus tableros; borrar el proyecto se
> lleva las suyas. Se limpiaron además las 8 que ya estaban sueltas.

**Verificado en runtime (2026-07-29).** `Board` vive en projects-service y
`Task` en tasks-service, en esquemas distintos y sin clave foránea entre ellos:
el `ON DELETE CASCADE` de Postgres **no cruza ese límite**, y nadie avisaba.

Se encontró al comprobar la migración de encargados: las 7 tareas que había en
la base tenían el tablero borrado. Todas devolvían
`403 "Tarea no encontrada o no se pudo resolver el proyecto"`, porque el guard
resuelve el proyecto a través del tablero y el tablero ya no existía.

Tres consecuencias, por orden de gravedad:

1. **Se acumulan para siempre.** Nada las borra nunca.
2. **Habrían salido en «mis tareas»** (punto 5), que consulta por `projectId` y
   encargado, no por tablero: tareas imposibles de abrir, contando como
   pendientes y venciendo eternamente.
3. Son invisibles e irrecuperables: no aparecen en ningún listado y no se pueden
   abrir ni borrar por la API.

---

## Cambios que hicimos en `apps/backend/`, con autorización

Todos con permiso explícito y verificados contra el stack levantado. Si tocáis
alguno de estos archivos, avisad para evitar conflictos.

| Commit | Qué |
|---|---|
| `35013e3` | El filtro de excepciones del gateway degradaba **todo** error de microservicio a 500 |
| `94721d8` | `AccountOwnerGuard`, DTO de usuario y query params en `GET /users` |
| `477616f` | `canViewProject`, permisos efectivos, validador de roles, filtro por membresía, 409 en duplicado, rol por defecto al crear proyecto |
| `2bad47c` | Cuerpos tipados en tareas y checklists |
| `a88e804` | Modelo e infraestructura de invitaciones, y salir de un proyecto |
| `fb4a758` | 409 al repetir el nombre de un espacio |
| `48a0058` | El `projectId` de las tareas se resuelve desde la ruta, y los `GET` piden `canViewProject` |
| `3cbe735` `c276067` `9c03e87` | Invalidación de caché al tocar roles, miembros, tableros y columnas |

### Un patrón que apareció cuatro veces

`findOneProject` cachea el proyecto entero durante 5 minutos **con su árbol
dentro** (espacios → tableros → columnas, roles, `_count.members`). Cuatro
mutaciones distintas no invalidaban esa clave, así que la escritura funcionaba y
la pantalla seguía enseñando lo viejo: parecía que la acción no había hecho nada.

Lo mismo con `board:<id>`, que tampoco se invalidaba al reordenar columnas.

**Regla para quien añada mutaciones:** al tocar cualquier cosa que cuelgue de un
proyecto, invalidad `project:<projectId>`; y si son columnas, también
`board:<boardId>`.

### Deuda que dejamos

Los roles creados antes del validador siguen guardados con un **array** en
`permissions`. `normalizePermissions` los interpreta al leer, así que funcionan,
pero los datos están sucios. Una migración que los convierta de una vez estaría
bien; no la hicimos por no tocar datos sin acordarlo.

---

## Mientras tanto, cómo trabaja el frontend

Reglas que seguimos para que nada se rompa cuando estos puntos se arreglen:

1. **Validamos siempre en el cliente.** El gateway ya valida, pero el mensaje
   llega antes, sin ida y vuelta, y marca el campo concreto.
2. **Enviamos solo los campos que el DTO declara**, ni uno de más. Antes sobraban
   sin consecuencia; ahora dan 400, que es lo correcto.
3. **Confirmamos el resultado contra el `data` de la respuesta, no contra el
   status.** El hábito viene de cuando el gateway no validaba y devolvía 200 sin
   guardar; sigue siendo lo correcto.
4. Ninguna llamada de tarea o checklist manda `projectId` en el body: lo pone
   el guard desde la ruta y mandarlo da 400 (punto 9).
5. `permissions` de un rol se envía **siempre como diccionario de booleanos**,
   nunca como array, y con claves del enum (punto 11).
6. La interfaz decide qué enseñar con `GET /projects/:id/permissions/me`, no
   probando y reaccionando al 403.
