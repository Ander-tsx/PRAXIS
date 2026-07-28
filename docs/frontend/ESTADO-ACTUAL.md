# PRAXIS — Análisis del estado actual del frontend

> Fecha del análisis: 2026-07-28 · rama `main` (commit `ae01766`)
> Documento vivo. Actualízalo cuando cambien decisiones de arquitectura o cuando el backend rompa un contrato.
>
> **Las secciones §1 a §11 son la foto del análisis inicial y se conservan tal cual
> como registro.** Lo resuelto desde entonces está marcado en su sección y
> recogido en §12 y §13, que son la fuente de verdad del estado actual.

---

## 1. Resumen ejecutivo

PRAXIS es un monorepo **SOFEA**: microfrontends Next.js sobre un backend de microservicios NestJS.
El backend está razonablemente avanzado (4 microservicios + gateway con Swagger, guards de permisos y respuestas normalizadas). **El frontend está en fase de cimientos**: existe la landing pública, un design system incipiente y un microfrontend de auth, pero **ningún microfrontend de negocio está conectado al backend**.

Estado por pieza:

| Pieza | Estado | Comentario |
|---|---|---|
| `web-shell` | 🟡 Parcial | Landing pública completa (hero 3D, features, CTA). Cero área privada, cero sesión, cero navegación autenticada. |
| `auth-front` | ✅ Funcional | Login, signup, session, logout y refresh verificados end-to-end. Ver §13. |
| `commons` | 🟡 Parcial | 5 átomos + 5 moléculas + tokens. Falta capa de organismos, cliente HTTP, tipos de dominio, estado de sesión. |
| `projects-front` | 🔴 No existe | Solo mockup sin mergear en `feature/vibecoded-mockup-frontend-flow`. |
| `dashboard-front` | 🔴 No existe | Idem. |
| `admin-front` | 🔴 No existe | Idem. |
| `reports-front` | 🔴 No existe | Idem. **No hay backend para reportes.** |
| `apps/mobile` | 🔴 Vacío | Solo `.gitkeep`. Fuera de alcance por ahora. |

**Lo que bloqueaba todo** (§4.1 workspace, §4.2 puertos, §5.1 login, §12 errores del gateway) **ya está resuelto**. El siguiente bloqueante real es que no existe el proxy autenticado hacia el gateway desde una zona privada (§7).

---

## 2. Stack y versiones reales

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router) | `16.2.9` |
| UI | React | `19.2.4` |
| Estilos | Tailwind CSS v4 (`@theme` en CSS, sin `tailwind.config`) | `^4` |
| 3D / animación (solo landing) | three, @react-three/fiber, @react-three/drei, gsap | — |
| Auth en BFF | `jose` | `^5.9.6` |
| Monorepo | pnpm workspaces + Turborepo | pnpm 9 / turbo 2 |
| Lint/format | Biome (raíz) + ESLint (solo `web-shell`) | biome 1.8 |
| Node | 20 | `.nvmrc` |

⚠️ Next.js 16 es una versión con breaking changes. `apps/frontend/web-shell/AGENTS.md` obliga a consultar `node_modules/next/dist/docs/` antes de usar APIs. Se respeta esa regla.

**No se usa Module Federation** pese a lo que dice el README. La estrategia real es **Next.js Multi-Zones**: cada microfrontend es una app Next independiente con su propio `basePath`, y el `web-shell` la expone vía `rewrites()`.

---

## 3. Arquitectura frontend

### 3.1 Multi-Zones (estrategia real)

```
                    Navegador → http://localhost:3001 (web-shell)
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        │ rewrites()                    │                               │
   /auth/*  → :3002/auth/*        /projects/* → :3004/projects/*   /admin/* → :3003/admin/*
   auth-front                      projects-front                   admin-front
```

Cada zona:
- tiene `basePath: '/<zona>'` en su `next.config.ts`;
- se sirve en su propio puerto en dev;
- el shell la publica con `{ source: '/<zona>/:path*', destination: '<URL>/<zona>/:path*' }`;
- la URL destino sale de una env var (`AUTH_FRONT_URL`, etc.) con fallback a localhost.

Ventaja para nosotros: cada zona se desarrolla y despliega sola, comparte cookie de sesión (misma origin desde el navegador) y comparte `@praxis/commons` en código.

### 3.2 Atomic Design — dónde vive cada nivel

| Nivel | Ubicación | Estado |
|---|---|---|
| **Tokens** | `apps/frontend/commons/tokens/` | ✅ colors, typography, spacing, animation |
| **Átomos** | `apps/frontend/commons/atoms/` | ✅ Button, Input, Badge, Sparkle, StatItem |
| **Moléculas** | `apps/frontend/commons/molecules/` | ✅ AuthForm, FeatureCard, ProgressBar, RoleBadge, SectionHeader |
| **Organismos** | `<app>/src/components/organisms/` | 🟡 Solo en web-shell y solo de landing |
| **Templates** | `<app>/src/components/templates/` | 🟡 Solo `LandingTemplate` |
| **Pages** | `<app>/src/app/**/page.tsx` | 🟡 landing, login, signup |

Regla observada en el código actual (y que conviene mantener explícita):
> Átomos y moléculas **compartidos** viven en `commons`. Organismos y templates **específicos de un dominio** viven dentro de su microfrontend. Un organismo se sube a `commons/organisms/` solo cuando lo consumen ≥2 zonas (ej. `AppLayout`).

Las **pages** son las únicas que tienen lógica de negocio (fetch, estado, validación). Las moléculas reciben `ReactNode` como slots y no saben nada de datos — ver `AuthForm` + `login/page.tsx`, que es el patrón de referencia y está bien ejecutado.

### 3.3 Design system

Tokens duplicados en dos sitios que hay que mantener en sync a mano:
- `web-shell/src/app/globals.css` → bloque `@theme` (fuente de verdad)
- `auth-front/src/app/globals.css` → copia literal, con comentario admitiéndolo
- `commons/tokens/colors.ts` → espejo en TS (`var(--color-*)`) + `colorValues` hex

Paleta: dark-only. Fondo `#0D0F14`, primario `#6C63FF`, acento `#D4A843`, texto `#E8EAF0`.
Tipografía: `Redaction 50` (display, self-hosted woff2), Inter + Lora vía `next/font` en el shell, system-ui en auth-front.

⚠️ **Deuda:** cada zona nueva copia ~150 líneas de `@theme` y re-declara `@font-face` apuntando a `/<basePath>/fonts/…`. Además Tailwind v4 necesita `@source` explícito hacia `commons` en cada `globals.css` o las clases de los átomos se purgan. Es frágil y ya está copiado dos veces.

---

## 4. Organización del monorepo — problemas estructurales

### 4.1 ✅ RESUELTO — El frontend NO estaba en el workspace de pnpm

> Arreglado en `dd30d19`.

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/backend/gateway"
  - "apps/backend/services/*"
  - "apps/backend/commons/*"
  - "packages/**"
  - "stubs/**"
```

Falta `apps/frontend/*`. Consecuencias reales, todas verificadas:

1. `@praxis/commons: "workspace:*"` en `web-shell` y `auth-front` **no resuelve** — pnpm no conoce ese paquete. `pnpm install` en la raíz falla o lo ignora.
2. `pnpm dev:frontend` = `turbo run dev --filter=@praxis/web-shell` → **el filtro no matchea nada**, turbo no ve la app.
3. `web-shell` tiene su propio `pnpm-lock.yaml` y `pnpm-workspace.yaml` anidados: alguien lo instaló como proyecto suelto. Eso crea un segundo árbol de dependencias fuera de control del monorepo.
4. Los imports funcionan hoy **solo por los `paths` del `tsconfig.json`** (`@praxis/commons` → `../commons/index.ts`), no por resolución de paquete. Funciona en dev, es una bomba de tiempo en build/deploy.

**Es el primer arreglo a hacer.** Es de una línea + reinstalar.

### 4.2 ✅ RESUELTO — Colisión de puertos frontend ↔ backend

> Arreglado en `dd30d19`. Puertos definitivos en §13.

| Puerto | Backend | Frontend |
|---|---|---|
| 3000 | gateway HTTP | — |
| 3001 | **credentials-service (TCP)** | **web-shell** |
| 3002 | **permissions-service (TCP)** | **auth-front** |
| 3003 | **projects-service (TCP)** | **admin-front** (mockup) |
| 3004 | **tasks-service (TCP)** | **projects-front** (mockup) |
| 3005/3006 | — | dashboard-front / reports-front (mockup) |

`pnpm dev` (backend + frontend a la vez) **no puede funcionar**. Hay que reasignar un rango: propongo backend `3000` + `41xx` para TCP, o frontend a partir de `4000`.

### 4.3 ✅ RESUELTO — `apps/frontend/commons` no era un paquete real

> `transpilePackages` añadido en `dd30d19`, como anticipaba esta sección.

`package.json` apunta `main`/`types` a `./index.ts` (TypeScript crudo, sin build, sin `exports`). Como no hay symlink en `node_modules`, Next lo compila por ruta relativa vía tsconfig paths. Cuando se arregle §4.1 y sí exista el symlink, Next necesitará `transpilePackages: ['@praxis/commons']` en cada zona o romperá el build.

### 4.4 🟡 Config fragmentada

- Biome en la raíz (indent 4, comillas simples, width 100) pero `web-shell` usa ESLint + `next lint`, y el código real está formateado con indent 2. Biome y el código no están de acuerdo.
- `tsconfig.base.json` es estricto (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) pero **ninguna app frontend lo extiende**; cada una tiene su tsconfig copiado del template de `create-next-app`. Solo `commons/tsconfig.json` lo extiende.
- `.gitignore` ignora `pnpm-lock.yaml` en la raíz. En un monorepo el lock **debe** versionarse.
- `packages/shared-schemas/` y `packages/shared-protos/` están vacíos (`.gitkeep`) — el lugar natural para los tipos compartidos FE↔BE existe pero nadie lo usa.

---

## 5. Integración con el backend — lo que está roto hoy

### 5.1 ✅ RESUELTO — El login no funcionaba

> Arreglado en `31eeea1`.

El gateway envuelve toda respuesta en un sobre estándar (`StandardResponseInterceptor`):

```jsonc
// POST /api/auth/login → 200
{ "success": true, "data": { "userId": "…", "accessToken": "…", "refreshToken": "…" }, "meta": {} }
```

El BFF de `auth-front` lee:

```ts
// apps/frontend/auth-front/src/app/api/login/route.ts
const { access_token } = gatewayData;   // ❌ doble error
```

Dos fallos encadenados:
1. El campo está en `data.*`, no en la raíz.
2. Se llama `accessToken` (camelCase), no `access_token`.

Resultado: `access_token` siempre `undefined` → el BFF responde `502 "Respuesta inesperada del servidor"` → **login y signup fallan al 100%**. Mismo bug en `api/signup/route.ts`.

Causa raíz: el BFF se escribió contra `AuthResponseDto` (`access_token`), que quedó obsoleto cuando se normalizaron las respuestas (commit `136ae55`) y cuando el servicio pasó a devolver `{userId, accessToken, refreshToken}`. **`apps/backend/commons/contracts/src/auth/auth-response.dto.ts` es un contrato muerto que ya no refleja la realidad.**

### 5.2 ✅ RESUELTO — El `refreshToken` se tiraba a la basura

> Arreglado en `31eeea1`: cookie `praxis_refresh` + `POST /auth/api/refresh`.

El backend emite `refreshToken` (7 días, guardado en Redis) y expone `POST /api/auth/refresh`. El BFF ni lo lee ni lo guarda. Cuando expire el access token la sesión muere sin posibilidad de renovar. Hay que decidir: segunda cookie httpOnly `praxis_refresh` + renovación silenciosa.

### 5.3 ✅ RESUELTO — El logout no cerraba sesión de verdad

> Arreglado en `31eeea1`: el BFF ya notifica al gateway.

`api/logout/route.ts` borra la cookie pero **no llama a `POST /api/auth/logout`**. La sesión en Redis sobrevive, el refresh token sigue siendo válido. El propio archivo lo documenta como "fuera de scope".

### 5.4 🟠 `/api/auth/register` no acepta nombre ni apellido

`RegisterDto` = `{email, password}`. El servicio crea el perfil con `firstName: ''`, `lastName: ''`. Cualquier UI que quiera pedir el nombre en el registro necesita un cambio de backend, o hacer un `PATCH /api/users/:id` inmediatamente después.

### 5.5 🟠 `GET /api/projects` devuelve TODOS los proyectos del sistema

El gateway envía `{ userId }` al servicio, pero `FindProjectsDto` no tiene campo `userId` — tiene `ownerId`. El servicio hace `if (dto.ownerId) where.ownerId = …`, nunca se cumple, y el `where` queda vacío.
Además, aunque se arreglara, filtraría por **propietario**, no por membresía: un usuario invitado a un proyecto ajeno no lo vería. **Falta un endpoint "proyectos donde soy miembro".** Es un bloqueante de producto para el dashboard.

### 5.6 🟠 `GET` con body

`GET /api/projects` y `GET /api/users` reciben sus filtros/paginación por `@Body()`. `fetch()` no puede mandar body en un GET. En la práctica: **desde el navegador no hay forma de paginar ni buscar usuarios/proyectos.** Debe migrarse a query params (como ya hace `GET /boards/:boardId/tasks`, que sí está bien).

### 5.7 🟡 El guard de permisos y las rutas de tareas no coinciden

`TasksController` declara `@Patch('tasks/:id')`, pero `ProjectPermissionGuard` busca `params.taskId` para resolver el proyecto. No lo encuentra → cae al fallback `request.body.projectId`.

**Regla operativa para nosotros:** toda mutación de tarea (`PATCH`/`DELETE`/`move`/`assign`) y todo endpoint de checklist **debe incluir `projectId` en el body**, o el gateway responde `403 "Contexto de proyecto no encontrado"`.

### 5.8 🟡 Permisos con nombres que no corresponden

- `GET /api/projects/:id` (ver un proyecto) exige `canEditBoard`. Ver ≠ editar.
- `DELETE /api/projects/:id` exige `canDeleteBoard`; no existe `canDeleteProject`.
- `PATCH /boards/:boardId/columns/reorder` exige `canCreateColumn`; no existe `canEditColumn` en el enum aunque sí aparece en el DTO de roles.

### 5.9 🟡 Crear proyecto no crea roles ni miembros

`createProject` solo inserta la fila. No crea un rol por defecto ni añade al owner como `ProjectMember`. El owner tiene acceso porque el guard hace un bypass (`project.ownerId === userId`), pero:
- `GET /projects/:projectId/members` devuelve vacío para un proyecto nuevo;
- `POST /projects/:projectId/members` exige un `projectRoleId` que **todavía no existe** → hay que crear un rol antes de poder invitar a nadie.

**Flujo obligatorio en la UI:** crear proyecto → crear al menos un rol → recién entonces invitar miembros.

### 5.10 🟡 Endpoints que faltan (nos tocará pedirlos al equipo de backend)

- `GET /api/projects/:projectId/roles` — no existe. Los roles solo llegan embebidos en `GET /projects/:id`.
- `GET /api/boards/:boardId/columns` — no existe. Idem.
- `GET /api/auth/me` / `GET /api/users/me` — no existe. El frontend solo tiene el `sub` del JWT; para pintar el nombre hay que hacer `GET /users/:id`.
- `GET /api/permissions/me` o similar — para saber mis permisos en un proyecto sin hacer prueba-y-error con 403.
- **Todo el dominio de reportes.** `reports-front` no tiene backend.
- **Logs / auditoría.** `admin-front` (mockup) tiene una página de logs sin servicio detrás.

### 5.11 🟡 Inconsistencias de naming en el contrato

- `PATCH /api/users/:id` acepta `first_name` / `last_name` (snake_case) pero **devuelve** `firstName` / `lastName` (camelCase).
- Auth devuelve `accessToken` (camel); `AuthResponseDto` dice `access_token` (snake).

Habrá que normalizar en nuestro cliente HTTP, no en cada componente.

---

## 6. Lógica de negocio (modelo de dominio)

### 6.1 Jerarquía

```
Project (owner, name único global)
 └── Workspace (name único por proyecto)
      └── Board
           └── BoardColumn (order)
                └── Task ──┬── Subtask (self-relation parentTaskId)
                           └── Checklist[]
```

`Task` guarda `boardId`, `columnId`, `projectId` **y** `status` (string que debe coincidir con el nombre de la columna) — el estado está denormalizado y duplicado. Al mover una tarea hay que mandar `columnId` **y** `status` coherentes.

Prioridades: `LOW | MEDIUM | HIGH | URGENT`. Estado de usuario: `ACTIVE | INACTIVE | SUSPENDED`.

Cada microservicio tiene su propio **schema de Postgres** (`credentials`, `permissions`, `projects`, `tasks`) en la misma BD, sin FKs entre servicios. `assigneeId`, `ownerId`, `userId` son UUIDs sin integridad referencial: **el frontend debe tolerar IDs que no resuelven a un usuario.**

### 6.2 Doble capa de permisos

**Capa 1 — roles globales** (`permissions-service`): `admin` y `user`. Controla el acceso al panel de administración. Se verifica con `@RequireGlobalRole('Admin')`.

**Capa 2 — roles de proyecto** (`projects-service`): cada proyecto define sus propios roles (Scrum Master, QA, Dev…) con un diccionario JSON de permisos. Se verifica con `@RequireProjectPermission(...)`.

Permisos de proyecto disponibles (enum real, `ProjectPermission`):

```
canCreateTask · canEditTask · canDeleteTask
canCreateBoard · canEditBoard · canDeleteBoard
canCreateColumn · canDeleteColumn
canManageMembers · canManageRoles
```

**Las dos capas son independientes:** ser `admin` global no da permisos dentro de un proyecto. Lo único que hace bypass total es ser `ownerId` del proyecto.

Implicación de UI: no podemos decidir qué botones mostrar solo con el rol global. Necesitamos los permisos del usuario **por proyecto**, y hoy no hay endpoint que los devuelva (§5.10). Solución provisional: derivarlos de `GET /projects/:id` (trae `roles`) + `GET /projects/:id/members` (trae mi `projectRoleId`).

---

## 7. Autenticación — cómo funciona (y cómo debería)

Diseño actual, que es correcto y hay que conservar:

```
Navegador ──POST /auth/api/login──► auth-front BFF (server) ──POST /api/auth/login──► Gateway
                                          │
                                          └── Set-Cookie: praxis_session (httpOnly, sameSite=lax, maxAge = exp del JWT)
```

- El JWT **nunca llega al JavaScript del cliente**. No hay `localStorage`. Correcto.
- `GET /auth/api/session` verifica la cookie con `jose.jwtVerify` usando `JWT_SECRET` compartido (valida firma + exp, no es un simple decode).
- `maxAge` de la cookie se calcula desde el `exp` real del token.

Lo que falta:
- El shell no consume `/auth/api/session` — **no hay noción de "usuario logueado" en el shell**.
- No hay `middleware.ts` que proteja rutas privadas.
- No hay forma de que un microfrontend privado llame al gateway con el token: la cookie es httpOnly, así que **cada zona necesita su propio proxy server-side** que lea la cookie y añada `Authorization: Bearer`. Eso todavía no existe en ningún lado.
- `auth-front` requiere `JWT_SECRET` en su `.env.local`. Compartir el secret de firma con el frontend es aceptable en un proyecto académico, pero conviene anotarlo como decisión consciente.

---

## 8. Qué hay en la rama de mockups (`feature/vibecoded-mockup-frontend-flow`)

No mergeada. Contiene, con **datos 100% mockeados** (`MOCK_USERS`, cookie `praxis_demo_user`, proxy `/api/mock`):

- `admin-front` (`:3003`, `/admin`) — users, roles, privileges, projects, logs
- `projects-front` (`:3004`, `/projects`) — lista + detalle de proyecto `[id]`
- `dashboard-front` (`:3005`, `/dashboard`)
- `reports-front` (`:3006`, `/reports`)
- `commons/organisms/AppLayout` — layout privado con sidebar
- `commons/auth/` — `AuthGuard`, `getActiveUserServer/Client` con usuarios falsos
- `web-shell/next.config.ts` con los rewrites de las 5 zonas

**Valor: alto como referencia de UI y de estructura de zonas. Cero como código de producción** — su capa de auth y datos es simulada y hay que reescribirla entera contra el gateway real.

Propuesta: **no mergear la rama**. Portar zona por zona, tomando el layout y la UI, y sustituyendo la capa de datos.

---

## 9. Riesgos y deuda técnica priorizada

| # | Severidad | Problema | Ref |
|---|---|---|---|
| 1 | ✅ Resuelto | Frontend fuera del workspace pnpm | §4.1 |
| 2 | ✅ Resuelto | Login/signup rotos (sobre + naming) | §5.1 |
| 3 | ✅ Resuelto | Colisión de puertos backend/frontend | §4.2 |
| 4 | 🔴 Bloqueante | No hay forma de llamar al gateway autenticado desde una zona privada | §7 |
| 5 | 🟠 Alto | `GET /projects` devuelve todo / no filtra por membresía | §5.5 |
| 6 | 🟠 Alto | No hay tipos de dominio compartidos (el cliente HTTP base ya existe en `commons/api/`) | §10 |
| 7 | ✅ Resuelto | Refresh token ignorado → sesión muere sin renovar | §5.2 |
| 8 | 🟠 Alto | `GET` con body ⇒ no hay paginación ni búsqueda | §5.6 |
| 9 | 🟡 Medio | Design tokens duplicados por zona | §3.3 |
| 10 | ✅ Resuelto | Logout no invalida la sesión en Redis | §5.3 |
| 11 | 🟡 Medio | Faltan endpoints (roles, columnas, me, reportes, logs) | §5.10 |
| 12 | 🟡 Medio | Biome vs ESLint vs formato real del código | §4.4 |
| 13 | ✅ Resuelto | `pnpm-lock.yaml` ignorado por git | §4.4 |
| 14 | 🔵 Bajo | README dice Module Federation; se usa Multi-Zones | §2 |
| 15 | ✅ Resuelto | El gateway degradaba todo error de microservicio a 500 | §12 |
| 16 | 🔵 Bajo | `pnpm build` de contracts/observability no está en el README | §13 |

---

## 10. Lo que hay que construir antes del primer microfrontend

Esta es la "fase 0". Sin esto, cada zona nueva reimplementa lo mismo y mal.

**En `apps/frontend/commons/`:**

1. `api/` — cliente HTTP tipado que desenvuelve `{success, data, meta}`, normaliza `{success:false, error:{code,message,details}}` a una excepción propia, y mapea snake/camel.
2. `types/` — tipos de dominio derivados de los DTOs del backend (`Project`, `Workspace`, `Board`, `Column`, `Task`, `Checklist`, `User`, `ProjectRole`, `ProjectMember`, `Priority`, `ProjectPermission`). Candidato natural a vivir en `packages/shared-schemas/` para que backend y frontend compartan la única fuente de verdad.
3. `auth/` — `getSession()` server-side, `<SessionProvider>`, hook `useSession()`, `<RequirePermission>`.
4. `organisms/AppLayout` — sidebar + topbar del área privada (portar del mockup).
5. `theme.css` — un solo archivo de tokens importado por todas las zonas, para matar la duplicación.

**Patrón de proxy autenticado** (a estandarizar y replicar en cada zona):
`/<zona>/api/proxy/[...path]/route.ts` → lee cookie `praxis_session` → reenvía a `${GATEWAY_URL}/api/<path>` con `Authorization: Bearer` → devuelve el sobre desenvuelto.

**Roadmap sugerido de microfrontends** (de menos a más dependencias):

1. **auth-front** — arreglar §5.1–5.3. Es el desbloqueante de todo.
2. **web-shell privado** — sesión, middleware, AppLayout, navegación.
3. **projects-front** — el corazón del producto: lista → detalle → workspaces → boards → columnas → tablero Kanban con tareas y checklists. El más grande con diferencia.
4. **dashboard-front** — depende de que `GET /projects` filtre bien.
5. **admin-front** — usuarios y roles globales; depende de arreglar `GET /users`.
6. **reports-front** — bloqueado, no hay backend.

---

## 11. Preguntas abiertas para el equipo

1. ¿Podemos pedir cambios al backend o hay que trabajar solo con lo que existe? (afecta a §5.5, §5.6, §5.10)
2. ¿Reportes y logs entran en el alcance del proyecto o se descartan?
3. ¿Cuál es el rango de puertos que reservamos para el frontend?
4. ¿El registro debe pedir nombre y apellido? (requiere cambiar `RegisterDto`)
5. ¿Mobile (Flutter) entra en el alcance o se queda vacío?

---

## 12. Hallazgo posterior al análisis (2026-07-28, verificado en runtime)

### ✅ RESUELTO — El gateway convertía TODO error de microservicio en un 500

> Arreglado en `35013e3`, con autorización explícita para tocar el backend.
> **Es el único cambio que hemos hecho en `apps/backend/`.** Si el equipo de
> backend toca `standard-exception.filter.ts`, avisar del conflicto.

Verificado levantando el stack completo:

```
POST /api/auth/login  (password incorrecta) → 500 {"code":"INTERNAL_SERVER_ERROR","message":"Internal server error"}
POST /api/auth/register (email duplicado)   → 500 {"code":"INTERNAL_SERVER_ERROR","message":"Internal server error"}
```

Los microservicios lanzan bien sus errores (`RpcException({statusCode: 401, message: 'Credenciales inválidas'})`),
pero se pierden al cruzar el gateway.

**Causa:** cuando un microservicio lanza `RpcException` sobre TCP, el `ClientProxy`
del gateway rechaza con el **objeto plano deserializado** `{statusCode, message}`,
no con una instancia de `RpcException`. `StandardExceptionFilter` comprueba, en orden:

1. `instanceof HttpException` → no
2. `instanceof RpcException` → **no**, es un objeto plano
3. `isErrorWithStatus()` → busca la propiedad `status`, pero el payload trae `statusCode` → no
4. → cae al `catch` genérico: 500 "Internal server error"

`rpc-exception.filter.ts` existe pero es código muerto: no está registrado en
`main.ts` y además usa `@Catch(RpcException)`, que tampoco haría match.

**Alcance:** no es solo auth. Afecta a los cuatro servicios y a todos los códigos
de negocio: 401, 403, 404 (proyecto/tarea no encontrada), 409 (nombre duplicado).
Los únicos errores que llegan bien son los que genera el propio gateway
(ValidationPipe y los guards), porque esos sí son `HttpException`.

**Por qué no tiene workaround en el frontend:** el gateway destruye status y
mensaje. Al BFF le llega un 500 con "Internal server error" y cero información.
No hay forma de distinguir "contraseña incorrecta" de "la base de datos se cayó".

**Consecuencia mientras no se arregle:** toda la UI tiene que mostrar un
"algo salió mal" genérico. Nada de "email ya registrado", "credenciales
inválidas" o "no tienes permiso".

**Solución aplicada:** una rama nueva en `StandardExceptionFilter` que reconoce la
forma serializada `{statusCode, message}`, reutilizando los helpers de status y
código que ya existían. Puramente aditiva: no cambia ningún caso que ya
funcionaba. Cubierta por dos tests en `response-normalization.spec.ts`.

Resultado verificado:

```
POST /api/auth/login  (password incorrecta) → 401 UNAUTHORIZED "Credenciales inválidas"
POST /api/auth/register (email duplicado)   → 409 CONFLICT "El email ya está registrado"
GET  /api/projects (sin token)              → 401 UNAUTHORIZED "No token provided"
```

---

## 13. Entorno local — cómo dejarlo listo

Puertos definitivos:

| Rango | Qué |
|---|---|
| 3000 | gateway (HTTP) |
| 3001-3004 | credentials, permissions, projects, tasks (TCP) |
| 4100 | web-shell |
| 4101 | auth-front |
| 4102+ | reservado para las zonas siguientes |

Los `.env` no están versionados. Un clon nuevo necesita crearlos a partir de los
`.env.example`, con **el mismo `JWT_SECRET` en gateway, credentials-service y
`auth-front/.env.local`** — si no coinciden, `/auth/api/session` rechaza cookies
que el gateway considera válidas.

Arranque desde cero:

```bash
pnpm install
pnpm docker:up
pnpm --filter @praxis/contracts --filter @praxis/observability run build   # ← imprescindible
pnpm prisma:reset
pnpm prisma:seed
pnpm dev:backend      # terminal 1
pnpm dev:frontend     # terminal 2
```

⚠️ El paso de build de `contracts` y `observability` no está en el README, pero
sin él los cuatro microservicios fallan con `Cannot find module '@praxis/contracts'`.
Ambos paquetes publican `dist/` y no se compilan solos en `dev`.

### Estado tras la puesta en marcha (2026-07-28)

Verificado end-to-end a través del rewrite del shell (`localhost:4100/auth/*`):

| Flujo | Estado |
|---|---|
| signup → cookies httpOnly | ✅ |
| session (verificación de firma) | ✅ |
| logout (borra sesión en Redis) | ✅ |
| login | ✅ |
| refresh | ✅ |
| errores 401 / 409 / 400 con mensaje útil | ✅ |

El access token dura **15 minutos** y el refresh **7 días**. Cualquier zona
privada necesita renovación silenciosa o la sesión se cae a los 15 minutos.
