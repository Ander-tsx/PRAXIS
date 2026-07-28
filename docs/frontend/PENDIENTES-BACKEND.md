# Pendientes del equipo de backend

> Lista de cosas que el frontend necesita del backend y no puede resolver por su
> cuenta. Escrita por el equipo de frontend; **no modificamos `apps/backend/`**.
>
> Cada punto indica si está **verificado en runtime** (reproducido contra el
> stack levantado) o **leído en el código**.
>
> Última revisión: 2026-07-28 · gateway en `localhost:3000`

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

| # | Severidad | Qué | Verificado |
|---|---|---|---|
| 1 | 🔴 | Cualquiera puede editar o borrar la cuenta de otro | runtime |
| 2 | 🔴 | El `ValidationPipe` no se aplica en 22 de 28 endpoints | runtime |
| 11 | 🔴 | Un rol mal formado se crea con 201 y no concede nada | runtime |
| 3 | 🟠 | `GET /projects` devuelve todos los del sistema | código |
| 4 | 🟠 | Filtros por body en peticiones GET | código |
| 5 | 🟠 | Faltan endpoints de lectura (incl. permisos efectivos) | código |
| 12 | 🟠 | No existe ningún flujo de invitación | código |
| 13 | 🟠 | Sin permiso de lectura: no hay rol observador | runtime |
| 6 | 🟡 | Nombre de proyecto duplicado → 500 | runtime |
| 7 | 🟡 | Un proyecto nace sin roles ni miembros | código |
| 8 | 🟡 | Permisos con nombres que no corresponden | código |
| 9 | 🟡 | Rutas de tarea `:id` vs guard `taskId` | código |
| 10 | 🔵 | Inconsistencias de contrato | runtime |

**Si solo se arreglan tres:** el 1 (seguridad), el 11 (roles que mienten) y el 5
exponiendo los permisos efectivos, que desbloquea toda la interfaz de permisos.

---

## 🔴 1. Cualquier usuario puede editar o eliminar la cuenta de otro

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

## 🔴 2. El `ValidationPipe` no se aplica en 22 de los 28 endpoints

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

## 🟠 3. `GET /api/projects` devuelve todos los proyectos del sistema

**Leído en el código.** El gateway envía `{ userId }`, pero `FindProjectsDto`
solo declara `ownerId`. El servicio hace `if (dto.ownerId) where.ownerId = …`,
nunca se cumple, y el `where` queda vacío.

Y aunque se corrigiera el nombre, filtraría por **propietario**, no por
membresía: alguien invitado a un proyecto ajeno no lo vería.

**Lo que necesitamos:** proyectos donde el usuario es **owner o miembro**.

**Impacto:** bloquea el dashboard y la lista de proyectos. Sin esto solo
podemos mostrar todo a todos, que es justo lo contrario del modelo de permisos.

---

## 🟠 4. `GET /projects` y `GET /users` reciben filtros por body

**Leído en el código.** Ambos usan `@Body()` en un `GET`. `fetch` no puede
enviar cuerpo en un GET, así que desde el navegador **no hay forma de paginar ni
de buscar**: siempre recibimos la página 1 con el límite por defecto.

**Arreglo:** migrar a query params, como ya hace bien
`GET /boards/:boardId/tasks`.

---

## 🟠 5. Faltan endpoints de lectura

| Falta | Hoy hay que… |
|---|---|
| `GET /api/users/me` | Sacar el `sub` del JWT y pedir `/users/:id` aparte |
| `GET /api/projects/:id/roles` | Leerlos embebidos en `GET /projects/:id` |
| `GET /api/boards/:id/columns` | Idem |
| Permisos efectivos del usuario en un proyecto | Deducirlos cruzando `roles` y `members`, o provocar 403 y reaccionar |
| `GET /api/tasks?assigneeId=…` (mis tareas) | No hay forma. `GET /boards/:boardId/tasks` exige un board, así que habría que recorrer proyectos → espacios → tableros → tareas y filtrar en el cliente |

Los dos últimos son los que más duelen:

- Sin los **permisos efectivos**, la interfaz no sabe qué botones ocultar y solo
  descubre que no tiene permiso cuando la acción ya falló.

  > Comprobado: `POST /api/permissions/check` **no** cubre esto. Solo verifica
  > si un usuario tiene un **rol global** (`Admin` / `User`); no evalúa permisos
  > de proyecto. La lógica que sí queremos existe en el microservicio
  > (`project_check_permission`, con jerarquía implícita y caché) pero **no está
  > expuesta en el gateway**. Exponerla sería un cambio pequeño y nos
  > desbloquearía toda la interfaz de permisos.
- Sin **mis tareas**, el dashboard no puede mostrar en qué está trabajando cada
  persona sin hacer una cascada de peticiones por cada tablero de cada proyecto.
  Es la pieza que falta para que el panel de inicio sea realmente útil.

---

## 🟡 6. Crear un proyecto con nombre duplicado devuelve 500

**Verificado en runtime.** `Project.name` es `@unique` y el servicio no captura
el error `P2002` de Prisma, así que sale como error no controlado.

Debajo hay un problema de diseño: **el nombre es único a nivel global**, no por
usuario ni por organización. Dos equipos distintos no pueden tener un proyecto
llamado "Sprint 1".

**Impacto:** no podemos decir "ese nombre ya existe"; solo "algo salió mal".

---

## 🟡 7. Un proyecto nuevo nace sin roles ni miembros

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

| Endpoint | Exige | Debería |
|---|---|---|
| `GET /projects/:id` (ver) | `canEditBoard` | un permiso de lectura |
| `DELETE /projects/:id` | `canDeleteBoard` | `canDeleteProject` (no existe) |
| `PATCH /boards/:id/columns/reorder` | `canCreateColumn` | `canEditColumn` |

`canEditColumn` aparece en el DTO de roles pero **no está en el enum
`ProjectPermission`** ni lo usa ningún endpoint — aunque la jerarquía implícita
sí lo menciona.

> Que `GET /projects/:id` exija `canEditBoard` no es solo un nombre feo: hace
> imposible un rol de solo lectura. Desarrollado en el punto 13.

---

## 🟡 9. Las rutas de tarea usan `:id` pero el guard busca `taskId`

**Leído en el código.** `TasksController` declara `@Patch('tasks/:id')`, mientras
`ProjectPermissionGuard` busca `params.taskId` para resolver el proyecto. No lo
encuentra y cae al fallback `body.projectId`.

**Consecuencia para nosotros:** toda mutación de tarea y de checklist **debe**
incluir `projectId` en el body o responde `403 "Contexto de proyecto no
encontrado"`. Funciona, pero es frágil: el día que alguien renombre el parámetro,
cambia el contrato sin avisar.

---

## 🔵 10. Inconsistencias de contrato

- `PATCH /users/:id` **acepta** `first_name` / `last_name` (snake_case) y
  **devuelve** `firstName` / `lastName` (camelCase).
- `AuthResponseDto` en `@praxis/contracts` declara `access_token`, pero
  credentials-service emite `accessToken`. El DTO está muerto y desorienta.
- `POST /auth/register` no acepta nombre ni apellido: crea el perfil vacío.
  Acordamos completarlo después desde la página de datos del usuario, así que
  **no hace falta cambiarlo** — queda anotado para que no sorprenda.

---

## 🔴 11. Un rol de proyecto mal formado se crea con 201 y no concede nada

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

## 🟠 12. No existe ningún flujo de invitación

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

## 🟠 13. No existe permiso de lectura: el rol "observador" no se puede modelar

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

## ✅ Ya arreglado por el equipo de frontend, con autorización

**`35013e3` — `apps/backend/gateway/src/common/filters/standard-exception.filter.ts`**

Todo error de negocio de un microservicio llegaba al cliente como **500**: 401 de
credenciales, 409 de email duplicado, 404 de recurso inexistente. Cuando un
microservicio lanza `RpcException` sobre TCP, el `ClientProxy` rechaza con el
objeto plano ya deserializado, no con la instancia, y el filtro no lo reconocía.

El cambio es **aditivo** (una rama nueva antes del catch genérico) y está
cubierto por dos tests en `response-normalization.spec.ts`. **Es el único
cambio nuestro en `apps/backend/`.** Si tocáis ese archivo, avisad para evitar
un conflicto.

---

## Mientras tanto, cómo trabaja el frontend

Reglas que seguimos para que nada se rompa cuando estos puntos se arreglen:

1. **Validamos siempre en el cliente.** No dependemos de que el gateway lo haga.
2. **Enviamos solo los campos que el DTO declara**, ni uno de más. Hoy sobrarían
   sin consecuencia, pero el día que el punto 2 se arregle darían 400.
3. **Confirmamos el resultado contra el `data` de la respuesta, no contra el
   status.** Un 200 no garantiza que se haya guardado (punto 2).
4. Toda mutación de tarea o checklist lleva `projectId` en el body (punto 9).
5. `permissions` de un rol se envía **siempre como diccionario de booleanos**,
   nunca como array, y con claves del enum (punto 11).
6. La interfaz dice **"añadir miembro"**, no "invitar": no hay invitación que
   nadie reciba (punto 12).
