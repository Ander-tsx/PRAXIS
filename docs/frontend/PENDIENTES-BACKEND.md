# Pendientes del equipo de backend

> Lista de cosas que el frontend necesita del backend y no puede resolver por su
> cuenta. Escrita por el equipo de frontend; **no modificamos `apps/backend/`**.
>
> Cada punto indica si está **verificado en runtime** (reproducido contra el
> stack levantado) o **leído en el código**.
>
> Última revisión: 2026-07-29 · gateway en `localhost:3000`

---

## Cómo leer esta lista

| Severidad | Significado |
|---|---|
| 🔴 Crítico | Fallo de seguridad o de corrección. Debe arreglarse antes de producción |
| 🟠 Alto | Bloquea o deforma una pantalla que tenemos que construir |
| 🟡 Medio | Nos obliga a un rodeo, pero hay forma de avanzar |
| 🔵 Bajo | Inconsistencia o deuda. No bloquea nada |

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

El último es el que más duele: **sin él la interfaz no sabe qué botones ocultar**
y solo puede descubrir que no tiene permiso cuando ya falló la acción.

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
rol → invitar*. Sería más natural que el backend creara un rol de administrador
y metiera al owner al crear el proyecto.

---

## 🟡 8. Permisos con nombres que no corresponden a la acción

**Leído en el código.**

| Endpoint | Exige | Debería |
|---|---|---|
| `GET /projects/:id` (ver) | `canEditBoard` | un permiso de lectura |
| `DELETE /projects/:id` | `canDeleteBoard` | `canDeleteProject` (no existe) |
| `PATCH /boards/:id/columns/reorder` | `canCreateColumn` | `canEditColumn` |

`canEditColumn` aparece en el DTO de roles pero **no está en el enum
`ProjectPermission`** ni lo usa ningún endpoint.

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
