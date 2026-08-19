# Pendientes del equipo de backend

> Lista de cosas que el frontend necesita del backend y no puede resolver por su
> cuenta. Escrita por el equipo de frontend; **no modificamos `apps/backend/`**.
>
> Cada punto indica si está **verificado en runtime** (reproducido contra el
> stack levantado) o **leído en el código**.
>
> Última revisión: 2026-07-29 · gateway en `localhost:3000`
>
> **Estado: 17 de 17 resueltos.** El equipo de frontend recibió autorización para
> tocar `apps/backend/` y los ha ido cerrando; cada punto resuelto lleva el
> commit y cómo se verificó.
>
> Lo que queda no es de esta lista. Hoy es un solo hueco de producto: **no se
> pueden reordenar tareas dentro de una columna**.
>
> **Las subtareas no son un pendiente.** `Task.parentTaskId` y `subtask_create`
> existen porque venían del modelo original, y **decidimos no exponerlas**: el
> checklist ya cubre partir una tarea en pasos con mucha menos ceremonia. Es
> capacidad heredada que no usamos, no un hueco. Ver ESTADO-ACTUAL §24.5.

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

Ninguno de la lista vieja. El punto 18 es un hueco nuevo, de escalado, no de
seguridad: los adjuntos guardan en Postgres y el código ya está listo para GCS.

El **21** es de 2026-08-19 y tampoco es de seguridad: un proyecto cuyo slug sea
`cartera`, `tablero` o `tarea` queda oculto tras una ruta estática del frontend.
Tres palabras de espacio de colisión, y ningún proyecto afectado hoy.

### Resueltos

| # | Severidad | Qué | Commit |
|---|---|---|---|
| 1 | 🔴 | Cualquiera podía editar o borrar la cuenta de otro | `94721d8` |
| 2 | 🔴 | El `ValidationPipe` no se aplicaba en 22 de 28 endpoints | `94721d8` `477616f` `2bad47c` |
| 9 | 🔴 | El `projectId` del body decidía el permiso: escritura entre proyectos | `48a0058` |
| 11 | 🔴 | Un rol mal formado se creaba con 201 y no concedía nada | `477616f` `9c03e87` |
| 14 | 🔴 | Los dos `GET` de tareas no pedían ningún permiso | `48a0058` |
| 15 | 🟠 | Borrar un tablero —o una columna— dejaba sus tareas huérfanas para siempre | `8fa3263` `fce78c5` |
| 3 | 🟠 | `GET /projects` devolvía todos los del sistema | `477616f` |
| 4 | 🟠 | Filtros por body en peticiones GET | `94721d8` `477616f` |
| 12 | 🟠 | No existía ningún flujo de invitación | `a88e804` |
| 13 | 🟠 | Sin permiso de lectura: no había rol observador | `477616f` |
| 7 | 🟡 | Un proyecto nacía sin roles ni miembros | `477616f` |
| 6 | 🟡 | `Project.name` era único **global**: dos equipos no podían tener un "Sprint 1" | `b9c17fa` |
| 5 | 🟡 | Faltaba `GET /users/me` | `b974030` |
| 8 | 🟡 | Faltaban `canEditColumn`, `canMoveTask` y `canDeleteProject`; `reorder` pedía crear | `667c1cb` `7cab9a2` `ee8be65` `0d3afb5` |
| 10 | 🔵 | `PATCH /users/:id` entraba en snake_case y salía en camelCase | `b974030` |
| 16 | 🔵 | Las etiquetas usaban `canEditTask`; ahora `canManageLabels` | `ee8be65` |
| 17 | 🔵 | Comentar exigía `canEditTask`; ahora `canComment` | `ee8be65` |
| — | 🟡 | Nombre duplicado devolvía 500 (proyectos y espacios) | `477616f` `fb4a758` |

**Lo que queda no está en esta lista.** Es un hueco de producto: no se pueden
reordenar tareas dentro de una columna. El dominio de notificaciones, que también
faltaba, se construyó en `8177ac3`. Y las subtareas **no cuentan como hueco**:
existen en el backend y decidimos no exponerlas (ESTADO-ACTUAL §24.5).

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
| `GET /api/me/tasks` (mis tareas) | ✅ `0a444f0` — no como `?assigneeId=`, ver abajo |

- ✅ **Permisos efectivos: resuelto** en `477616f`. Nueva ruta
  `GET /projects/:projectId/permissions/me`, que devuelve el mapa completo ya
  expandido por jerarquía, con los denegados en `false`, más `isOwner`. La
  lógica ya existía en el microservicio; solo faltaba exponerla.

  (`POST /api/permissions/check` no servía: solo verifica **roles globales**.)

- ✅ **Mis tareas: resuelto** en `0a444f0`, pero como **`GET /me/tasks`** y no
  como `GET /tasks?assigneeId=…`. Con el id de encargado como parámetro,
  cualquiera consultaría las tareas de cualquiera y habría que inventar un
  permiso para cerrarlo; derivándolo del token no hay nada que cerrar. Cuelga de
  `/me` como las invitaciones y por el mismo motivo: no hay ningún proyecto en la
  ruta contra el que comprobar permisos, porque la respuesta cruza todos.

  Acota siempre a los proyectos donde la persona **sigue estando**: salir de un
  proyecto no borra las filas de `TaskAssignee`, así que sin ese filtro seguiría
  viendo tareas de un sitio del que ya salió.

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
| `PATCH /boards/:id/columns/:id` | `canEditColumn` | — | ✅ `667c1cb` |
| `PATCH /boards/:id/columns/reorder` | `canCreateColumn` | `canEditColumn` | ❌ abierto |
| `POST /tasks/:id/move` | ~~`canEditTask`~~ → `canMoveTask` | — | ✅ `7cab9a2` |

**`canEditColumn` ya lo usa un endpoint.** Estaba en el enum desde `477616f` sin
que nadie lo pidiera; el `PATCH` de columna que se añadió en `667c1cb` —renombrar
y recolorear— es su primer uso.

Queda abierto el `reorder`, que sigue pidiendo `canCreateColumn`: quien puede
crear columnas puede reordenarlas aunque no debiera poder editarlas. Mover una
columna de sitio se parece más a editarla que a crearla.

**Mover una tarea ya no exige poder editarla.** `canMoveTask` es nuevo en el
enum (`7cab9a2`) y lo pide la ruta de mover; `canEditTask` lo implica por
jerarquía, así que ningún rol existente perdió nada. Era el caso más molesto de
esta familia: para arrastrar una tarjeta a «Hecho» había que poder reescribir la
tarea entera.

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

> **Resuelto** en `8fa3263`. El gateway avisa a tasks-service (`task_purge`)
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
>
> **Ampliado en `fce78c5`: faltaba el cuarto caso, borrar una columna.** Era el
> más engañoso de la familia y por eso sobrevivió al primer arreglo: la tarea
> conserva `boardId` y `projectId`, así que el guard **sí** le resuelve el
> proyecto y sigue respondiendo por `GET /tasks/:id`. Simplemente deja de
> pintarse —el tablero agrupa por `columnId` y esa columna ya no existe— mientras
> sigue contando en «mis tareas». Reproducido antes de arreglarlo: columna con una
> tarea, `DELETE` de la columna, y la fila viva saliendo aún en
> `GET /boards/:id/tasks`. `PurgeTasksDto` gana `columnId` y el gateway llama a
> la limpieza tras el borrado. Verificado con una columna de 2 tareas: 0 filas
> después.

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

## ✅ 16. ~~Las etiquetas se gestionan con `canEditTask`, sin permiso propio~~

> **Resuelto** en `ee8be65`. `canManageLabels` existe en el enum y es lo que exigen el
> `POST`, el `PATCH` y el `DELETE` de `labels.controller.ts`; leerlas sigue en
> `canViewProject`. Lo implica `canEditTask` por jerarquía, así que ningún rol existente
> perdió nada. Verificado en el controlador, no en la documentación.

<details><summary>El planteamiento original</summary>

**Decisión nuestra, anotada para que no sorprenda.** Al añadir etiquetas de
proyecto hacía falta un permiso para crearlas, editarlas y borrarlas. El enum
`ProjectPermission` no tiene ninguno que encaje, y **no inventamos uno** por
nuestra cuenta: añadir un permiso cambia el modelo y es decisión vuestra.

Lo que hicimos: leerlas exige `canViewProject` y gestionarlas `canEditTask`.
La lógica es que quien puede editar tareas puede definir con qué se etiquetan.

**Dónde se nota:** un perfil que deba etiquetar sin poder tocar el contenido de
las tareas —o al revés— hoy no se puede representar. Si os parece que merece un
`canManageLabels`, es un permiso más en el enum y un cambio de una línea en
`labels.controller.ts`.

</details>

---

## ✅ 17. ~~Comentar exige `canEditTask`: no hay permiso de comentar~~

> **Resuelto** en `ee8be65`. `canComment` existe y es lo que exigen el `POST`, el `PATCH`
> y el `DELETE` de `comments.controller.ts`. Lo implica `canEditTask` por jerarquía. El
> rol observador del punto 13 ya puede responder en un hilo sin poder tocar el trabajo,
> que era justo el caso que quedaba cojo.

<details><summary>El planteamiento original</summary>

**Decisión nuestra, del mismo tipo que el punto 16.** Los comentarios de tarea
necesitaban un permiso para escribir. Leerlos exige `canViewProject`; escribir,
editar y borrar exigen `canEditTask`, y borrar además admite `canDeleteTask`
como vía de moderación.

**Dónde se nota:** el rol observador que se añadió en el punto 13 —pensado para
cliente, dirección o auditoría— puede **leer** un hilo pero no responder. En un
tablero real, esa gente es justo la que más comenta sin tocar el trabajo.

Si os parece que merece un `canComment`, es un permiso más en el enum y dos
líneas en `comments.controller.ts`.

</details>

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
| `dd321b5` | Rol `SuperAdmin`, jerarquía de roles globales y la regla de actuar hacia abajo |
| `1b6e65e` | Registro de actividad administrativa, consultable y solo-añadir |
| `a71956d` | Namespace `/api/admin` y panel de cuentas: estado, rol y corte de sesión |
| `7e94f06` | Los ids fijos de los seeders no eran UUIDs válidos |
| rama `feature/administracion-global` | Estado administrativo del proyecto: suspensión y archivado |

### ⚠️ Lo más invasivo de la última tanda: el estado del proyecto

`Project` gana cuatro columnas (`status`, `suspendedAt`, `suspendedBy`,
`suspendedReason`) y un enum `ProjectStatus`, en la migración
`20260804140000_project_status`. Lo que hay que saber si tocáis esto:

- **`ProjectPermissionGuard` comprueba el estado antes del bypass del dueño.** Ese orden
  es la mitad del diseño: al revés, el dueño —que es la persona a la que se le suspendió
  el proyecto— seguiría pudiendo hacer de todo.
- **`getEffectivePermissions` recorta el mapa** a `canViewProject` + `canViewReports`
  cuando el proyecto está suspendido, y devuelve `projectStatus` y `suspendedReason` para
  que la interfaz pueda explicarlo. Es aditivo: nada de lo que ya leía esa respuesta se
  rompe.
- **Tres rutas se cierran dentro de projects-service** (`exigirProyectoActivo`): aceptar
  invitación, rechazarla y salir del proyecto. No declaran permiso, así que no pasan por
  el guard. Es la única excepción a «la autorización va en el gateway», y está anotada en
  `docs/backend/permissions.md`.
- **`setStatus` invalida `project:<id>` y `projects:member:<userId>`** de todos los
  afectados. Sin eso la suspensión no surtiría efecto hasta 5 minutos después.
- **`findOneProject` y `findAllProjects` ahora omiten `suspendedBy`.** Es el id de una
  cuenta administradora y el rol global es privado; el panel lo lee por su propia ruta.

### Y un arreglo en el filtro de excepciones que afecta a todos

`standard-exception.filter.ts` **se comía el `code` explícito de un error** y lo
sustituía por el genérico del status, en sus dos ramas: la de `HttpException` lo
ignoraba, y en la de `RpcException` se miraba `statusCode` antes que `code` —y como
todos los `RpcException` del repo llevan `statusCode`, esa rama era inalcanzable—.

Ahora el código explícito gana, y si no hay se sigue derivando del status. **Nada
existente cambia de comportamiento**: comprobamos que ningún otro sitio del backend
manda un `code` propio. Si queréis emitir códigos de dominio, ya funcionan.

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

---

## 🟡 18. Los adjuntos de chat guardan en Postgres; el plan es GCS

Los adjuntos del chat —y los de tarea— se guardan **en Postgres**, en su propia
tabla para que ningún listado arrastre los bytes. Funciona y sobra con los
volúmenes actuales, pero no escala: los bytes de archivo no son datos
relacionales y conviene sacarlos a un almacenamiento de objetos.

**Lo que hicimos nosotros (frontend + projects-service):** el código ya está
estructurado alrededor de un proveedor. `projects-service` tiene un
`BlobStorage` con dos implementaciones —`postgres` (activa por defecto) y
`gcs` (escrita pero inactiva)—, y se elige con `STORAGE_DRIVER=postgres|gcs` en
el `.env` de ese servicio. El proveedor `gcs` usa `@google-cloud/storage` y
espera `GCS_PROJECT_ID` y `GCS_BUCKET`.

### Lo que faltaba para poder activarlo, y ya está (17-08)

Cambiar `STORAGE_DRIVER` decide **dónde se guarda lo nuevo, no dónde está lo
viejo**. Ponerlo en `gcs` sin más dejaría cada adjunto ya subido en una tabla
que nadie vuelve a consultar: la fila de metadatos sigue ahí, el chat sigue
enseñando el archivo en la lista, y al pulsarlo no hay nada. **Un 404 por cada
adjunto anterior al cambio, sin un solo error en el servidor.**

1. 🔴 **El proveedor de GCS ignoraba el `mimeType`.** La interfaz lo declara
   —`put(key, data, mimeType)`— y `ChatAttachmentsService` lo envía, pero
   `GcsBlobStorage` lo descartaba y guardaba **todo** como
   `application/octet-stream`. El de Postgres puede permitírselo porque el tipo
   vive en la fila de metadatos; en un bucket el objeto es lo único que hay, así
   que perderlo rompe el servido directo y el CORS. Arreglado.

   ⚠️ Este proveedor **está escrito y nunca se ha ejecutado contra un bucket
   real**. Conviene revisarlo entero al conectarlo, no solo esto.

2. ✅ **Hay script de migración**: `src/scripts/migrar-blobs.ts`, que se compila
   a `dist/scripts/migrar-blobs.js`. Copia cada blob al bucket con la clave del
   proveedor (`chat/<attachmentId>`) y **no borra nada** — el borrado va aparte
   con `--borrar-origen`, y solo cuando alguien haya comprobado que el bucket
   sirve. Un script que mueve y borra a la vez no deja forma de volver atrás si
   el bucket estaba mal configurado.

   Es idempotente (`save` sobrescribe), va por lotes de 20 —un adjunto pesa
   hasta 25 MB y traerlos todos a memoria es lo único que puede tumbarlo— y se
   puede interrumpir y relanzar.

**El orden para activarlo, que importa:**

```
1. GCS_PROJECT_ID y GCS_BUCKET en el .env de projects-service
2. migrar-blobs.js            ← con STORAGE_DRIVER todavía en `postgres`
3. comprobar que el bucket sirve los archivos
4. STORAGE_DRIVER=gcs         ← ahora sí
5. migrar-blobs.js --borrar-origen
```

Migrar **antes** de cambiar el driver es lo que permite hacerlo sin ventana de
indisponibilidad: mientras se copia, todo se sigue sirviendo desde Postgres.

⚠️ Cloud SQL no tiene IP pública, así que el script se ejecuta **desde dentro de
la VPC**, igual que `migrar.sh`:

```
# 1. cuánto hay (no toca el bucket ni pide credenciales de GCS)
gcloud compute ssh <vm-backend> --tunnel-through-iap --zone <zona> \
  --command "sudo docker exec praxis-backend node /app/apps/backend/services/projects/dist/scripts/migrar-blobs.js --contar"

# 2. migrar
gcloud compute ssh <vm-backend> --tunnel-through-iap --zone <zona> \
  --command "sudo docker exec praxis-backend node /app/apps/backend/services/projects/dist/scripts/migrar-blobs.js"
```

⚠️ **El nombre de la máquina cambia en cada despliegue** —el grupo de instancias
las recrea—, así que no se apunta:

```
gcloud compute instances list --filter="name~praxis-backend" --format="value(name,zone)"
```

⚠️ **En el contenedor no existe `DATABASE_URL`.** La compone
`backend.pm2.config.cjs` y solo para los procesos que arranca; un `docker exec`
**no la hereda**. El script la construye él mismo desde las `POSTGRES_*`, igual
que `migrar.sh`. Sin eso, muere con «Environment variable not found:
DATABASE_URL» y el mensaje apunta al `schema.prisma`, que no tiene nada que ver.

**Qué falta por el lado del backend** (si se quiere conectar):

- Crear el bucket y decidir la política de acceso (las URLs de los objetos
  deben seguir pasando por el gateway: la autorización es de la aplicación, no
  del bucket).
- Activar el driver en producción con `STORAGE_DRIVER=gcs` y las variables de
  entorno. La firma y los límites ya se validan igual en ambos proveedores.
- Una tarea de limpieza para los adjuntos huérfanos (borrador sin `messageId`
  que nadie reclama) — hoy se quedan para siempre, en el proveedor que sea.

Sin esto no hay nada roto: la capa de almacenamiento es transparente para el
gateway y para el frontend, que no saben —ni deben saber— dónde viven los bytes.

## 🟡 19. El preview de links del chat vive en el frontend; el ideal es un endpoint del gateway

Desde el chat se envían URLs y el frontend muestra una card con título,
descripción e imagen cuando el sitio las expone (Open Graph). Hoy lo hace un
**server action de cada zona** (`previewDeEnlaceAction`) que lee la URL ajena
desde el servidor de la zona con un guard SSRF propio (bloquea IPs privadas y
de loopback, valida cada redirección, timeout y límite de bytes).

**Qué falta por el lado del backend** (si se quiere centralizar):

- Un `GET /api/links/preview?url=...` en el gateway que haga el unfurl con su
  propio guard SSRF, con caché por URL y sin exponer a ningún cliente el fetch
  de terceros. La validación SSRF viviría en una sola capa y no en cada zona.
- Decidir si el preview debe guardarse (evitar refetch en cada visita) y si el
  tamaño/cache son por URL o por dominio.

Sin esto no hay nada roto: la card funciona y las dos zonas comparten la misma
utilidad de `commons`. El coste es que cada zona repite la función —dos líneas—,
y que la protección SSRF vive en el frontend, donde un fallo se vería antes.

## 🟡 20. Un hilo no puede tener respuestas anidadas: falta `threadRootId`

Dentro del panel de hilo no se puede responder a un mensaje concreto, y no es
una omisión de la interfaz: **con el modelo actual ese mensaje no tendría dónde
aparecer**.

La pertenencia a un hilo se deduce de `replyToId`. `chat.thread()` pide
`{ replyToId: <raíz>, visibleEnChat: false }`, y el flujo general pide
`{ visibleEnChat: true }`. Una respuesta a otra respuesta nacería con
`replyToId = <la otra respuesta>` y `visibleEnChat: false`, así que:

- **no sale en el hilo**, porque su `replyToId` ya no es el de la raíz; y
- **no sale en el chat general**, porque `visibleEnChat` es `false`.

Se envía, se guarda, y no se ve en ninguna parte. Por eso el botón «Responder»
está apagado dentro del panel del hilo (`permiteResponder` en `MessageBubble`),
igual que el de fijar — ver el punto siguiente.

**Qué falta por el lado del backend:**

- Un `threadRootId` en `ChatMessage`: quién es la raíz del hilo, guardado, en
  vez de deducirlo de `replyToId`. Con él, `thread()` filtra por
  `threadRootId = <raíz>` y `replyToId` vuelve a significar solo «a quién cito»,
  que son dos cosas distintas que hoy comparten campo.
- La migración puede rellenarlo con lo que ya hay: para cada mensaje con
  `visibleEnChat: false`, su `threadRootId` es su `replyToId` actual.

Mientras tanto no hay nada roto: se responde desde el compositor del hilo, que
manda la respuesta al hilo entero, que es el 90 % de los casos.

## 🟢 21. Fijar dentro de un hilo no lleva a ninguna parte

`POST /chat/messages/:id/pin` acepta cualquier mensaje, también uno que solo
existe dentro de un hilo (`visibleEnChat: false`). Pero la barra de fijados solo
recorre la conversación general, así que fijar una respuesta de hilo guardaba la
marca y no la enseñaba en ningún sitio: el botón se encendía y no pasaba nada
más.

El frontend ya no ofrece fijar dentro del hilo (`canFijar={false}` en
`ThreadPanel`). Queda anotado por si algún día la barra de fijados debe incluir
mensajes de hilo — entonces habría que decidir a qué lleva pulsarlos, porque hoy
saltar a un fijado busca el mensaje en el historial y uno de hilo no está ahí.

---

## 🟢 22. La bandeja de avisos no se puede filtrar por tipo

`FindNotificationsQueryDto` acepta `page`, `limit` y `unreadOnly`. No hay nada
para acotar por `type`, y la bandeja los mezcla todos: invitaciones, cambios de
equipo y asignaciones de tarea.

Con la lista paginada de 20 en 20, **el frontend no puede suplirlo**. Filtrar en
el cliente solo recortaría lo que ya vino en la página actual, así que «solo
tareas» enseñaría las que hubiera entre esas veinte y escondería el resto sin
decirlo — el mismo engaño que ya se descartó al montar el filtro de «sin leer»,
que sí se resolvió mandando `unreadOnly=true` (ESTADO-ACTUAL §39.6).

Lo que haría falta es un `type?: NotificationType[]` en ese DTO, aplicado en el
`where` junto a `unreadOnly`, y `total` contado con el mismo `where` —como ya
hace hoy—.

**No corre prisa.** Con veinte por página y una bandeja que se vacía sola al
abrir cada aviso, la mezcla se lee bien; empezará a molestar cuando una cuenta
acumule cientos y quiera buscar «aquella invitación de hace un mes».

---

## 🟢 23. `GET /projects` acepta `sortBy` y `sortOrder`, y los ignora

`FindProjectsQueryDto` los declara, el gateway los reenvía dentro de
`query` … y `findAllProjects` (projects-service) tiene el orden **escrito a
mano**:

```ts
orderBy: { createdAt: 'desc' },   // projects.service.ts, findAllProjects
```

`dto.query.sortBy` no se lee en ninguna parte de ese método. Es decir: la
petición se acepta con 200, no falla, y devuelve exactamente el mismo orden de
siempre.

**Por eso la rejilla de proyectos no ofrece ordenar** (ESTADO-ACTUAL §40.7): un
selector que cambia la URL, recarga la lista y no cambia nada es la peor clase
de control. Es el mismo patrón que el 200 sin guardar de la trampa #3 de
`CLAUDE.md`, en versión lectura.

Lo que haría falta: aplicar `dto.query.sortBy`/`sortOrder` en el `orderBy`, con
una **lista blanca de columnas** (`name`, `createdAt`, `updatedAt`) — un
`sortBy` libre va directo a Prisma y una columna inexistente revienta la
consulta.

O, si no se va a implementar, quitarlos del DTO: un parámetro documentado en
Swagger que no hace nada es peor que no tenerlo.

---

## ✅ 24. ~~`GET /projects` no trae ni una persona: las caras del equipo cuestan N+1~~

La rejilla de proyectos enseña las caras del equipo en cada tarjeta
(ESTADO-ACTUAL §40.8). Para eso hacen falta **dos tandas de peticiones por
página**, porque la lista no trae a nadie:

```
GET /projects?page=1&limit=12        → 12 proyectos, cada uno con _count.members
GET /projects/:id/members   ×12      → filas con userId, sin nombre ni foto
GET /users/:id              ×K       → K = personas únicas entre los 12 equipos
```

El frontend lo acota como puede —las doce en paralelo, los ids deduplicados
entre todos los proyectos antes de pedir perfiles, y cada fallo degrada esa
tarjeta al número de miembros— pero sigue siendo **1 + 12 + K** peticiones para
pintar una lista que hoy se resolvía con una.

Lo que lo cerraría, por orden de preferencia:

1. **Incluir unos pocos miembros en la propia lista.** En `findAllProjects`,
   junto al `_count` que ya está:

   ```ts
   include: {
     _count: { select: { members: true, workspaces: true } },
     members: { take: 4, select: { userId: true } },   // ← esto
   }
   ```

   Con cuatro basta: es el tope que enseña la tarjeta, y el resto ya sale del
   `_count`. Quita las doce peticiones de golpe y deja solo la tanda de perfiles.

2. **Un `GET /users?ids=a,b,c`** que resuelva varios perfiles de una vez.
   Serviría también a la bandeja de avisos, a la pantalla del proyecto y al
   chat, que hacen exactamente lo mismo (una petición por id) por la misma
   ausencia. Hoy la alternativa es `?limit=100`, que **miente en cuanto la
   plataforma pasa de cien cuentas** — ya nos mordió y está documentado.

Con las dos, la pantalla vuelve a ser dos peticiones.

---

**Cerrado con autorización, con las dos.** La rejilla de proyectos pasó de
**1 + 12 + K** peticiones a **2**:

- `findAllProjects` incluye `members: { take: 4, orderBy: { joinedAt: 'asc' },
  select: { userId: true } }` junto al `_count` que ya estaba.
- `GET /users?ids=a,b,c` en el gateway. El `cmd user_find_by_ids` **ya existía**
  —lo usaban el panel de administración y alexa-service— y lo único que faltaba
  era la puerta HTTP. Responde `{ items, total }`, la misma forma que el listado.

Sirve igual a la bandeja de avisos, al chat y al detalle de proyecto, que siguen
pidiendo un `GET /users/:id` por persona: cambiarlos es una línea en cada uno y
está pendiente.

---

## 🟢 25. Los acuses de lectura son por canal, así que dentro de un hilo no hay «visto»

`ChatChannelState` guarda **un** `lastReadAt` por (canal, persona). Con eso se
responde «¿hasta dónde ha leído fulano esta conversación?», que es justo lo que
necesita el contador de no leídos y la marca de la conversación general.

Lo que **no** se puede responder es «¿ha leído alguien *esta* respuesta?», y esa
es la pregunta de un hilo: sus mensajes van con `visibleEnChat: false`, no
entran en el historial general y no tienen por qué haberse visto solo porque la
marca del canal esté más adelante. Que la marca vaya por delante de un mensaje
de hilo no dice nada sobre si alguien abrió el hilo.

Enseñar el «visto» del canal ahí sería peor que no enseñar nada: diría «leído»
sobre una respuesta que puede no haber visto nadie, con toda la apariencia de un
dato exacto. Así que el frontend lo **oculta** (`mostrarVisto={false}` en
`ThreadPanel`, con el motivo escrito al lado).

**Decisión (17-08): se cierra como límite del producto, no se implementa.**
Contestarlo de verdad exige una tabla de acuses **por mensaje** —fila por (mensaje,
persona) o un rango por hilo—, su migración, y una escritura por cada mensaje
visto: el gesto más frecuente del sistema pasa de tocar una fila por canal a
tocar una por mensaje en pantalla. Es un coste de escritura permanente a cambio
de una marca en una superficie secundaria.

Si algún día se retoma, lo barato es acotarlo al hilo —un `lastReadAt` por
(hilo, persona), que es la misma forma que ya existe pero con `threadRootId` en
vez de `channelId`— y no un acuse por mensaje suelto. Depende del punto 20, que
es donde vive `threadRootId`.


---

## 🟡 21. Los slugs de proyecto no tienen palabras reservadas

`Project.slug` es único global y es lo que va en la URL. Nada impide que un
proyecto se llame «Cartera» y se quede con el slug `cartera` — ni que otro se
quede con `tablero` o `tarea`.

**Por qué importa en el frontend.** Dos zonas tienen rutas estáticas hermanas de
la dinámica que resuelve el slug:

| Zona | Ruta dinámica | Hermanas estáticas |
|---|---|---|
| `projects-front` | `/projects/[id]` | `/projects/tablero`, `/projects/tarea` |
| `reports-front` | `/reports/[[...id]]` | `/reports/cartera` |

Next da prioridad a la estática, así que un proyecto con uno de esos tres slugs
**queda oculto**: su enlace abre la otra pantalla. No da ningún error —la ruta
existe y responde 200— así que se ve como un proyecto que «no se abre».

**Qué haría falta.** Una lista de reservados en `generarSlugUnico`
(`projects-service/src/projects/slug.util.ts`), que ya recibe el comprobador de
unicidad: bastaría con tratar los reservados como colisión y dejar que el sufijo
aleatorio haga lo suyo — «Cartera» pasaría a `cartera-rjv6`. Y una migración
para los que ya existan, si los hay.

**Severidad 🟡 y no naranja** porque hoy no hay ningún proyecto afectado y el
espacio de colisión son tres palabras. Pero es exactamente la clase de fallo que
aparece el día de una demostración, con un proyecto llamado «Cartera» hecho para
la ocasión.

Mientras tanto el frontend **no hace nada**: comprobarlo en el cliente exigiría
que cada zona conociera las rutas de las demás, y el arreglo de verdad está en
quien genera el slug.
