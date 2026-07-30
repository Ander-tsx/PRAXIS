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
| `web-shell` | ✅ Funcional | Landing pública consciente de la sesión + rewrites hacia las zonas. Ya no sirve páginas de negocio: es la cáscara. Ver §17.0. |
| `auth-front` | ✅ Funcional | Login, signup, session, logout y refresh verificados end-to-end. Ver §13. |
| `commons` | 🟡 Parcial | 5 átomos + 5 moléculas + tokens. Falta capa de organismos, cliente HTTP, tipos de dominio, estado de sesión. |
| `projects-front` | 🔴 No existe | Solo mockup sin mergear en `feature/vibecoded-mockup-frontend-flow`. |
| `dashboard-front` | ✅ Funcional | Panel y datos del usuario, contra el backend real. Zona propia en el 4102. Ver §17. |
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

> ✅ La duplicación de tokens está **resuelta**. Se conserva el histórico abajo
> porque explica por qué el archivo compartido está donde está.

Fuente de verdad única: **`commons/styles/theme.css`**. Contiene el bloque
`@theme`, los estilos base (box-sizing, body, scrollbar, selección),
`prefers-reduced-motion`, el keyframe `sparkle-spin` (lo usa `Sparkle` desde
commons) y **los `@source` hacia commons**. Cada zona hace:

```css
@import "tailwindcss";
@import "../../../commons/styles/theme.css";

@source "../**/*.tsx";   /* solo su propio src */

@font-face { … url("/<basePath>/fonts/…") … }
```

Lo único que queda por zona son los `@font-face`, porque su URL lleva el
basePath, y las animaciones propias (las de la landing viven en el `globals.css`
del shell). De ~780 líneas repartidas en tres copias se pasa a 162 compartidas
+ 32 por zona.

`commons/tokens/colors.ts` sigue siendo el espejo en TS (`var(--color-*)`) +
`colorValues` hex, para los sitios que no admiten clases.

⚠️ Los `@source` hacia commons viven **dentro** de `theme.css` y sus rutas son
relativas a ese archivo. Verificado en runtime: una clase que solo aparece en
`commons/molecules/ProgressBar` está en el CSS generado de `dashboard-front`,
que no usa ese componente — prueba de que Tailwind resolvió el `@source` a
través del `@import`.

Paleta: dark-only. Fondo `#0D0F14`, primario `#6C63FF`, acento `#D4A843`, texto `#E8EAF0`.
Tipografía: `Redaction 50` (display, self-hosted woff2) + Inter y Lora vía
`next/font` **en las tres zonas**. Antes auth-front no cargaba `next/font` y
caía a `system-ui`, y encima le faltaban los `.woff2` (404), así que el salto
landing → login cambiaba de tipografía dos veces. Resuelto.

> **Histórico:** los tokens se copiaron a mano en cada `globals.css` hasta que
> hubo tres zonas. La deuda estaba anotada aquí y se saldó al crear
> `dashboard-front`, que era la tercera copia.

🔴 **Trampa confirmada en producción (`ba94057`):** Tailwind v4 solo genera las
clases que encuentra **escaneando archivos**. `web-shell/globals.css` no tenía
`@source` hacia `commons`, así que cualquier utilidad usada *únicamente* dentro
de un componente compartido se descartaba **en silencio**: el componente se
renderizaba sin sus estilos. Lo detectamos porque `pt-5` no se aplicaba en
`FeatureCard` (`px-5` sí, porque el shell la usa en otro sitio).

**Hoy basta con importar el archivo compartido**, que ya trae los `@source`
hacia commons; la zona solo declara el suyo:

```css
@import "../../../commons/styles/theme.css";
@source "../**/*.tsx";
```

Si un componente de `commons` se ve sin estilos, esto es lo primero que hay que
mirar. No da ningún error: simplemente la clase no existe en el CSS final.

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
`/<zona>/api/gateway/[...path]/route.ts` → lee cookie `praxis_session` → reenvía a `${GATEWAY_URL}/api/<path>` con `Authorization: Bearer` → devuelve el sobre desenvuelto.

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
| 4102 | dashboard-front |
| 4103+ | reservado para las zonas siguientes |

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

---

## 14. Capa de sesión y proxy autenticado (implementada)

> `66b767f`. Resuelve el bloqueante #4.

### El problema que resuelve

El access token vive en una cookie `httpOnly`, así que el JavaScript del
navegador no puede leerlo ni añadir `Authorization: Bearer`. Toda llamada al
gateway tiene que pasar por código de servidor de la propia zona.

### Cómo se llama al gateway

```
Componente cliente
   └─ createApiClient({ gatewayPath: '/<zona>/api/gateway' })
        └─ fetch → /<zona>/api/gateway/<ruta>      (cookie httpOnly viaja sola)
             └─ createGatewayProxy()               (route handler de la zona)
                  └─ fetch → GATEWAY_URL/api/<ruta>   con Authorization: Bearer
```

El proxy:

- añade el Bearer leyendo `praxis_session`;
- **nunca reenvía la cookie al gateway** — solo viaja el Bearer;
- ante un `401`, canjea `praxis_refresh` por un access token nuevo, reintenta
  **una sola vez** y reescribe la cookie de sesión. Transparente para quien llama;
- devuelve el sobre `{success, data, meta}` intacto, para que `unwrapEnvelope`
  conserve el código y el mensaje reales del backend.

### Qué añadir en una zona nueva

1. `src/app/api/gateway/[...path]/route.ts` — dos líneas:

   ```ts
   import { createGatewayProxy } from '@praxis/commons/auth';
   export const { GET, POST, PUT, PATCH, DELETE } = createGatewayProxy();
   ```

2. `.env.local` con `GATEWAY_URL` y el **mismo** `JWT_SECRET` que el gateway.
3. El rewrite de la zona en `web-shell/next.config.ts` y su puerto (4102+).

En el servidor (layouts, páginas, route handlers):

```ts
import { getSession } from '@praxis/commons/auth';
const session = await getSession();   // { userId, expiresAt, expiresInSeconds } | null
```

⚠️ `@praxis/commons/auth` es **código de servidor** (usa `next/headers` y
`next/server`). No se re-exporta desde `@praxis/commons`; impórtalo siempre por
su subruta o romperás el bundle de cliente.

⚠️ `getSession()` verifica firma y expiración localmente, pero **no es
autorización**: sirve para decidir qué renderizar. La autorización real la hace
el gateway en cada petición.

### Estado verificado

| Caso | Resultado |
|---|---|
| `GET /api/gateway/users/:id` con sesión | 200 con el `data` real |
| Sin cookie de sesión | 401 `UNAUTHORIZED` "No hay sesión activa." |
| `PATCH /api/gateway/users/:id` (nombre y apellido) | 200 |
| `POST /api/gateway/projects` | 201 |
| Recurso inexistente | 404 `NOT_FOUND` con el mensaje del backend |
| Access token caducado + refresh válido | **200**, cookie renovada sola |
| Access token caducado + refresh inválido | 401 limpio, sin reintentos en bucle |

---

## 15. Pendientes con el equipo de backend

> 📄 **La lista mantenida vive en
> [PENDIENTES-BACKEND.md](PENDIENTES-BACKEND.md)**, con severidad, pasos de
> reproducción y qué está verificado en runtime. Lo de abajo es el resumen
> original; ante cualquier duda manda el documento dedicado.

Ninguno tiene workaround limpio desde el frontend. Ordenados por impacto:

| # | Qué | Dónde | Impacto |
|---|---|---|---|
| 1 | `GET /projects` no filtra por usuario: devuelve todos los proyectos del sistema. El gateway envía `userId` pero `FindProjectsDto` solo declara `ownerId`. Y aun arreglado filtraría por dueño, no por membresía | `projects-service` | Bloquea el dashboard y la lista de proyectos |
| 2 | `GET /projects` y `GET /users` reciben filtros por `@Body()` en un GET; `fetch` no puede enviarlo | gateway | Sin paginación ni búsqueda desde el navegador |
| 3 | Crear proyecto con nombre duplicado → **500**. `Project.name` es `@unique` global y el servicio no captura el error P2002 de Prisma | `projects-service` | No se puede decir "ese nombre ya existe" |
| 4 | Falta `GET /users/me` | gateway | Hay que sacar el `sub` del JWT y pedir `/users/:id` aparte |
| 5 | Faltan `GET /projects/:id/roles` y `GET /boards/:id/columns` | gateway | Solo llegan embebidos en `GET /projects/:id` |
| 6 | No hay endpoint de permisos efectivos por proyecto | gateway | La UI no sabe qué botones ocultar sin provocar 403 |
| 7 | Reportes y logs no existen | — | `reports-front` y la sección de logs quedan fuera de alcance |

### 🔴 Añadido el 2026-07-29 — Control de acceso roto en `/api/users/:id`

**Cualquier usuario autenticado puede editar o eliminar la cuenta de cualquier
otro.** `PATCH` y `DELETE /api/users/:id` solo llevan `JwtGuard`: no comprueban
que el `:id` sea el del token ni exigen rol global.

Reproducido con dos cuentas recién creadas:

```
PATCH  /api/users/{id_de_otro}   con el token del atacante → 200, perfil modificado
DELETE /api/users/{id_de_otro}   con el token del atacante → 200, cuenta eliminada
```

Existe además una segunda vía por si se añade la comprobación solo en la ruta:
el gateway compone el payload como `{ id, ...body }` —el body se expande
**después**— así que un `id` en el cuerpo pisa el parámetro de ruta. Compárese
con `projects`/`tasks`, que inyectan después del spread y no tienen ese
problema.

Ambas cosas se apoyan en el hallazgo siguiente: sin validación, el `id` de más
en el body no se descarta.

### 🔴 Añadido el 2026-07-29 — El `ValidationPipe` del gateway no se aplica en 22 de 28 endpoints

Solo validan los que declaran una **clase** DTO en `@Body()`: `/auth/login`,
`/auth/register`, los tres de `/permissions` y `GET /users`. El resto usa
`@Body() body: Omit<XDto, '...'>`, y un tipo de TypeScript no existe en runtime:
el metatype llega como `Object` y el pipe se desentiende.

Verificado:

| Petición | Esperado | Real |
|---|---|---|
| `POST /projects` con campo inventado | 400 | **201** |
| `POST /projects` con `name` de 1 char (DTO exige 2) | 400 | **201** |
| `PATCH /users/:id` con `firstName` (casing malo) | 400 | **200 sin cambiar nada** |
| `POST /auth/register` con campo inventado | 400 | 400 ✅ |

Los microservicios sí reciben clases DTO con `whitelist` y
`forbidNonWhitelisted`, pero en la práctica tampoco frenan estos payloads.

**Consecuencia para el frontend:** el backend no es una red de seguridad.
Toda validación tiene que hacerse en el cliente, y las pantallas de edición
deben confirmar el resultado **contra el `data` de la respuesta**, nunca contra
el status: un 200 no significa que se haya guardado.

Esto invalida la trampa #3 que teníamos documentada («un campo de más → 400»):
solo se cumple en esos 6 endpoints.

---

El punto 3 comparte causa con un problema de diseño: **el nombre de proyecto es
único a nivel global**, no por usuario ni por organización, así que dos equipos
distintos no pueden tener un proyecto llamado "Sprint 1".

---

## 16. Navegación entre zonas — la trampa del `basePath`

Cada zona declara `basePath: '/<zona>'`, y **Next aplica ese prefijo
automáticamente** a `next/link`, `useRouter()` y `redirect()`:

```ts
// dentro de auth-front (basePath: '/auth')
router.push('/')        // → /auth/    ❌ no sale de la zona
<Link href="/signup" /> // → /auth/signup  ✅ correcto, misma zona
```

Eso provocaba un bucle real: tras iniciar sesión, `router.push('/')` llevaba a
`/auth/`, cuyo `page.tsx` hace `redirect('/login')` → `/auth/login`. El usuario
se quedaba en el login con la sesión ya creada.

**Regla:** dentro de la zona, `next/link` y el router. Para salir de la zona,
navegación dura.

```ts
// cliente — apps/frontend/auth-front/src/lib/navigation.ts
window.location.assign('/');

// servidor (proxy.ts) — @praxis/commons/auth
return redirectToZone(request, '/');
```

`redirectToZone` existe porque Next exige una URL **absoluta** al redirigir
desde `proxy.ts`, y `request.url` apunta al puerto interno de la zona
(`localhost:4101`), no al del shell. El origen público correcto viaja en
`x-forwarded-host`, que añade el rewrite del shell.

### Guard de rutas: `proxy.ts`, no `middleware.ts`

> En Next 16 `middleware.ts` está **deprecado y renombrado a `proxy.ts`**, con
> la función exportada como `proxy`. Codemod:
> `npx @next/codemod@canary middleware-to-proxy .`
> Verificado en `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`

`auth-front/src/proxy.ts` expulsa a `/` a quien ya tiene sesión y entra a
`/login` o `/signup`.

⚠️ **Verifica la firma del token, no te limites a comprobar que la cookie
existe.** Con un token caducado el usuario *necesita* llegar al login; si el
guard solo mira la presencia de la cookie, lo deja encerrado fuera de su propia
cuenta.

### Verificado en navegador real

| Caso | Resultado |
|---|---|
| Registro → destino | Aterriza en `localhost:4100/` (landing del shell) |
| Con sesión → `/auth/login` | 307 → `/` |
| Con sesión → `/auth/signup` | 307 → `/` |
| Token caducado → `/auth/login` | 200, accesible |
| Cookie corrupta → `/auth/login` | 200, accesible |
| `document.cookie` desde la consola | vacío — httpOnly funcionando |
| `fetch('/api/gateway/users/:id')` desde la página | 200 con datos reales |

---

## 17. `dashboard-front` — el primer microfrontend de negocio (implementado)

> Panel en `/dashboard` y datos del usuario en `/dashboard/perfil`. Zona propia,
> puerto 4102, `basePath: '/dashboard'`. Sin mocks: todo sale del backend real.

### 17.0 Por qué es una zona y no una carpeta del shell

Se construyó primero dentro del `web-shell` y **se movió**. El motivo del
cambio, por si alguien vuelve a tener la tentación:

- En Multi-Zones el shell es la **cáscara**: landing pública, `rewrites()` y
  poco más. Cada página de negocio que se le añade lo convierte en el monolito
  que la arquitectura quiere evitar.
- Concreto: el shell arrastra `three`, `@react-three/fiber`, `drei` y `gsap`
  para el hero 3D de la landing. Con el panel dentro, el área privada comparte
  build con dependencias que no usa, y desplegar el panel obliga a redesplegar
  la landing.
- La zona se protege sola (§17.2), así que se puede levantar y probar en su
  puerto sin el shell delante.

### 17.1 `createServerApiClient` — la pieza que faltaba

Un Server Component no podía hablar con el gateway. `createApiClient` es de
navegador (hace `fetch` con ruta relativa contra el proxy de la zona, y una
ruta relativa no significa nada en el servidor) y `createGatewayProxy` es un
route handler, no una función que se pueda llamar.

`createServerApiClient()` (en `@praxis/commons/auth`) lee `praxis_session` con
`next/headers` y llama al gateway **directo**, sin el rodeo por el proxy: en el
servidor ya tenemos el token, y ese salto de red no aportaba nada. Desenvuelve
con `unwrapEnvelope` y lanza el mismo `ApiError` que el cliente de navegador.

No renueva el token, y no le hace falta: `proxy.ts` corre antes del render y ya
reescribe la cookie de la petición con el token fresco.

```ts
import { createServerApiClient } from '@praxis/commons/auth';
const api = createServerApiClient();
const user = await api.get<UserProfile>(`/users/${session.userId}`);
```

### 17.2 Cada zona se protege sola

`dashboard-front/src/proxy.ts` hace dos cosas, y el orden importa:

1. renueva la sesión (`createSessionRefreshProxy`);
2. **después** comprueba la firma.

Comprobando la cookie original echaríamos al login a quien llega con el access
token caducado y el refresh bueno — justo el caso que el paso 1 acaba de
arreglar. El token que vale se lee de las cookies de la **respuesta**, no de la
petición.

Toda la zona es privada, así que no hay lista de rutas. Y el redirect al login
usa `redirectToZone`: aquí `request.url` apunta al puerto interno (4102).

El `web-shell` **no protege nada**: solo renueva la sesión para que la landing
sepa si hay alguien identificado, y su `matcher` excluye los prefijos de las
zonas (`/auth/*`, `/dashboard/*`) para no pagar el salto al gateway dos veces
por navegación.

La verificación de firma vive en `hasValidSessionToken` (`@praxis/commons/auth`):
las zonas hacían el mismo guard duplicado y así ninguna necesita declarar `jose`.

### 17.3 El armazón en `commons/organisms`

Sube a commons por construcción, no por apuesta: en multi-zones cada zona
privada es una app Next independiente y renderiza su propio armazón, así que
los ≥2 consumidores están garantizados.

> **Actualizado (§23):** era un solo `AppLayout` dentro de cada page. Hoy son
> dos piezas —`AppShell` en el `layout.tsx` de la zona y `AppHeader` en cada
> page— y `activePath` se calcula dentro del armazón. Lo de abajo se conserva
> porque la trampa del basePath sigue siendo la misma.

⚠️ **El resaltado del ítem activo no puede salir de `usePathname()` a secas.**
Cada zona tiene su propio `basePath`, así que dentro de la zona `usePathname()`
devuelve la ruta *sin* prefijo y no casa con los enlaces de la barra lateral, que
son rutas del **shell**. Por eso también son `<a>` y no `next/link`.

`Proyectos` y `Reportes` salen apagados con "Pronto": sus zonas no existen y no
tiene sentido prometer una pantalla que daría 404.

### 17.4 Rutas dentro de la zona: con prefijo y sin prefijo

Es la trampa del `basePath` (§16) aplicada, y conviene tenerla junta:

| Dónde | Se escribe | Por qué |
|---|---|---|
| `next/link` dentro de la zona | `/perfil` | Next añade `/dashboard` solo |
| `revalidatePath()` | `/`, `/perfil` | son rutas del App Router de la app, que no incluye el basePath |
| `activePath` de `AppLayout` | `/dashboard/perfil` | ruta **pública**: se compara con enlaces del shell |
| Salir de la zona (logout, landing) | `window.location` | navegación dura |
| Rewrite en el shell | `/dashboard` **y** `/dashboard/:path*` | sin la primera, `/dashboard` a secas no casa y cae en el 404 del shell |

### 17.5 Lo que el panel puede y no puede mostrar

| Sale de | Qué |
|---|---|
| `GET /users/:id` | nombre, apellido, email |
| `GET /permissions/user/:id` | rol global como Badge |
| `GET /projects` | proyectos, y los contadores `_count` de espacios y miembros |

⚠️ **`GET /projects` devuelve todos los proyectos del sistema**, así que la page
filtra por `ownerId === session.userId`. Sin ese filtro estaríamos enseñando
proyectos ajenos: una fuga de información. Cuando el backend filtre por
membresía (PENDIENTES-BACKEND §3), la línea se cae.

Coste honesto mientras tanto: **no aparecen los proyectos donde el usuario es
miembro pero no dueño.** No hay forma de saberlo desde el frontend.

No hay sección de "mis tareas": no existe endpoint. Sacarla obligaría a
recorrer proyectos → espacios → tableros → tareas (PENDIENTES-BACKEND §5).

### 17.6 Cuatro trampas nuevas, verificadas en runtime

**El `matcher` con lookahead negativo NO casa la raíz.** El patrón habitual
`'/((?!_next/static|...).*)'` deja `/` fuera. En la zona eso significaba que el
panel (`/dashboard`, la raíz de la zona) **se servía sin guard**, mientras que
`/dashboard/perfil` sí redirigía — fácil de pasar por alto. En el shell
significaba que la landing nunca renovaba la sesión, que es justo para lo que
existe ese proxy. Se arregla añadiendo `'/'` como entrada aparte:

```ts
matcher: ['/', '/((?!_next/static|_next/image|favicon.ico|api/).*)']
```

Se detecta en el desglose de tiempos de `next dev`: `GET /perfil` muestra
`proxy.ts: 3ms` y `GET /` no muestra nada.

**Un archivo `'use server'` solo puede exportar funciones async.** Exportar de
ahí una constante (el estado inicial de `useActionState`) rompe el módulo
entero en tiempo de ejecución. El error apunta al final del archivo, no al
export culpable, así que despista. Por eso los estados iniciales viven en
`src/lib/action-state.ts`.

**La validación nativa del navegador corta el `onSubmit` de React.** Un
`minLength` en el input bloqueaba el envío *antes* de nuestro handler: el
formulario se quedaba mudo, sin marcar el campo y sin mensaje. Los formularios
llevan `noValidate` y la validación es nuestra, que además es lo que exige la
trampa #3 (el gateway no valida).

**`<dialog>` nativo con `showModal()`** da atrapado de foco, cierre con Escape y
fondo inerte gratis; a mano habría que reimplementar los tres, y el foco se
escapaba del diálogo con el tabulador. El clic en el fondo se detecta con
`event.target === dialogRef.current`, porque el `::backdrop` dirige sus eventos
al propio elemento.

### 17.7 Qué necesita una zona nueva

Checklist, salida de montar esta:

1. `package.json` con puerto propio (4103+) y `@praxis/commons: workspace:*`.
2. `next.config.ts` con `basePath: '/<zona>'` y `transpilePackages: ['@praxis/commons']`.
3. `tsconfig.json` con los `paths` a commons (copiar el de otra zona).
4. `src/app/globals.css` con `@import "../../../commons/styles/theme.css";`
   (trae tokens, base y los `@source` hacia commons) más `@source "../**/*.tsx"`
   para su propio código.
5. Fuentes en `public/fonts/` y `@font-face` apuntando a `/<zona>/fonts/...`,
   más `next/font` (Inter + Lora) en su `layout.tsx`: los tokens `--font-sans` y
   `--font-serif` esperan `--font-inter` y `--font-lora`.
6. `src/app/api/gateway/[...path]/route.ts` de dos líneas.
7. `src/proxy.ts` con `createSessionRefreshProxy` + `hasValidSessionToken`, y
   `'/'` en el matcher.
8. `.env.local` con `GATEWAY_URL` y el **mismo** `JWT_SECRET` que el gateway.
9. El rewrite en `web-shell/next.config.ts` (las **dos** entradas) y
   `<ZONA>_FRONT_URL` en su `.env.local`.

`pnpm dev:frontend` la recoge sola: el filtro es por directorio
(`--filter='./apps/frontend/*'`), no una lista de paquetes.

### 17.8 Verificado en navegador real

| Caso | Resultado |
|---|---|
| `/dashboard` sin sesión | 307 → `/auth/login` |
| `/dashboard/perfil` sin sesión | 307 → `/auth/login` |
| `/dashboard` con cookie corrupta | 307 → `/auth/login` |
| Zona servida directa (`:4102/dashboard`) | mismo guard, sin el shell delante |
| Login → destino | `/dashboard` (`POST_AUTH_DESTINATION`) |
| Cuenta nueva (sin nombre, sin proyectos) | saluda con el email, ofrece completar perfil, estado vacío con los 3 pasos |
| Cuenta nueva: roles `[]` | sin insignia, sin romper |
| `admin@praxis.dev` | insignia ADMIN y sus 2 proyectos de los 4 del sistema |
| Proyecto de otra cuenta | **no** aparece en la lista del admin |
| Crear proyecto con nombre de 1 carácter | bloqueado en cliente, con mensaje |
| Crear proyecto válido | 201, diálogo cerrado y panel revalidado |
| Guardar nombre y apellido | 200 confirmado contra el `data`; la barra lateral se actualiza sola |
| Escape / clic en el fondo | cierran el diálogo; el foco vuelve al disparador |
| Móvil (375px) | cajón lateral, métricas apiladas |
| Cerrar sesión desde la zona | landing del shell en estado anónimo |

---

## 18. Dominio de tareas (implementado)

> Lo que faltaba: las columnas ya no dicen «Tareas: pronto». Tarjetas con
> prioridad, vencimiento, encargados, etiquetas, checklist, comentarios y
> archivos, más avisos en el panel.

### 18.1 Lo que se arregló antes de construir

**El `projectId` del cuerpo era una credencial que elegía el cliente.**
Reproducido con dos cuentas: bastaba con declarar el id de un proyecto propio
para leer, editar y borrar tareas de un proyecto ajeno. Y los dos `GET` de
tareas no pedían permiso ninguno. Detalle en PENDIENTES §9 y §14.

**Borrar un tablero dejaba sus tareas en la base para siempre.** `Board` vive en
projects-service y `Task` en tasks-service: el cascade de Postgres no cruza esa
frontera. Las siete tareas que había estaban huérfanas y devolvían 403. Habrían
salido en «mis tareas», que consulta por proyecto y no por tablero. PENDIENTES
§15.

Los dos van **antes** del resto a propósito: construir encima habría multiplicado
el primero por cada ruta nueva, y el segundo habría contaminado el panel.

### 18.2 Decisiones de modelo

| Decisión | Por qué |
|---|---|
| `TaskAssignee` sustituye a `assigneeId`, no convive con él | Dos fuentes para el mismo hecho divergen; ya pasó con los permisos como array |
| `assigneeIds` y `labelIds` **sustituyen el conjunto**, no acumulan | Es lo que hace un selector múltiple al cerrarse, y hace la operación idempotente |
| Etiquetas del **proyecto**, no del tablero | La misma etiqueta vale en todos sus tableros; por tablero habría que recrearlas |
| Color de etiqueta = token del sistema, no hex | Con hex libre acabas con veintitrés verdes y ninguno es el del tema |
| Bytes de adjunto en **tabla aparte** | Es lo único que impide de verdad que un listado se los arrastre |
| Comentarios **dentro** de la tarea | Pedirlos aparte obligaba a un segundo camino de datos que las Server Actions no revalidan |

### 18.3 Las trampas que reaparecieron

**La caché, otra vez, y dos veces.** Al meter los comentarios en la tarea, el
listado del tablero (`tasks:board:<id>`, un minuto) dejó de reflejarlos: se
guardaban y la pantalla seguía enseñando el hilo viejo. Lo mismo al renombrar
una etiqueta, que se pinta en las tarjetas. **Regla ampliada: si un dato viaja
dentro de la tarea, tocarlo obliga a invalidar también `tasks:board:`.**

**`TASK_CONTROLLERS` del guard es una lista que hay que mantener.** Un
controlador nuevo que cuelgue de `tasks/:taskId` y no se apunte ahí recibe
`403 "Contexto de proyecto no encontrado"`. Pasó con los comentarios. Está
avisado en el propio guard.

**`types` del tsconfig del gateway es una lista cerrada.** `@types/multer`
instalado no basta: sin añadir `"multer"` ahí, `Express.Multer.File` no existe
al compilar.

**Los `<textarea>` envían `\r\n`.** Es la especificación, y el `\r` suelto se
cuela al pintar el texto. Se normalizan en la acción.

### 18.4 Verificado en navegador real

| Caso | Resultado |
|---|---|
| Crear tarea desde una columna | 201 con el `status` igual al nombre de la columna |
| Arrastrar entre columnas | Movida, y los 7 `status` coherentes con su columna en la base |
| Editar prioridad y encargados | Guardado y reflejado en la tarjeta |
| Rol de solo `canViewProject` | Ve las tareas; sin botones, sin arrastre, diálogo con los seis campos desactivados |
| Checklist | 3 ítems, 2 marcados, barra al 67 % y el `2/3` en la tarjeta |
| Etiquetas | Creadas, nombre repetido 409, color inválido 400, tres chips en la tarjeta |
| Comentarios | Hilo ordenado, editar ajeno 403, el dueño moderando, refresco inmediato |
| Adjuntos | PNG y TXT admitidos, SVG 400, 11 MB 413, ida y vuelta idéntica, miniatura en el diálogo |
| Panel | Una vencida y una próxima, en bloques separados |

---

## 19. Columnas y tarjetas: los gestos del tablero

> Segunda pasada sobre el tablero, ya con el dominio de tareas funcionando. Lo
> que cambia son los **gestos**: cómo se toca una columna y cómo nace una tarea.

### 19.1 La columna tiene menú, y el color es suyo

La «×» que borraba directo se cambió por un menú de tres puntos con **cambiar
color**, **renombrar** y **eliminar**. Las dos primeras no existían en el
backend: se añadió `PATCH /boards/:boardId/columns/:id` (`667c1cb`), que además
es el **primer y único uso de `canEditColumn`** — estaba en el enum desde
`477616f` sin que ningún endpoint lo pidiera.

El color pasó a ser un campo de `BoardColumn`, token del sistema como en las
etiquetas. Antes salía de `COLUMN_TINTS`, un array **por posición**: reordenar
una columna le cambiaba el color, porque el color no era de la columna sino de su
sitio. La migración reparte con esa misma rotación el color de las que ya
existían, para no perder la distinción visual que tenían.

### 19.2 El `status` huérfano: por qué la cascada vive en el gateway

`Task.status` guarda el **nombre** de la columna, no su id (§6.1: el estado está
denormalizado a propósito, así el listado del tablero no cruza con
projects-service). Consecuencia directa de añadir el renombrado: el `status` de
todas las tareas de esa columna queda apuntando a un nombre que ya no existe.

Lo que se rompía, si se hubiera dejado así:

- `GET /me/tasks?status=` dejaba de encontrarlas, y es como el panel separa lo
  terminado de lo pendiente;
- mover la tarea a su propia columna lo «arreglaba» sola, así que el problema
  desaparecía justo al intentar reproducirlo.

La cascada la coordina el **gateway** con `ColumnStatusSyncService`, por el mismo
camino que `TaskPurgeService` y por el mismo motivo: la columna está en
projects-service y la tarea en tasks-service, y hacer que projects llamara a
tasks montaría un ciclo entre los dos microservicios. Es idempotente —solo toca
las filas que no coinciden ya—, best-effort —si tasks-service no responde la
columna ya se renombró, y decir que falló sería mentir— e invalida `task:<id>`
**y** `tasks:board:<id>`, que es la que se olvida.

Y la interfaz lo dice: al renombrar avisa de cuántas tareas cambian de estado.
No es un detalle de implementación que se pueda esconder.

### 19.3 Borrar una columna también dejaba tareas huérfanas

Cuarto caso de la familia de `8fa3263`, y el que sobrevivió al primer arreglo por
ser el más engañoso: al borrar un tablero la tarea quedaba imposible de abrir y
se notaba, pero al borrar una columna conserva `boardId` y `projectId`, así que
el guard le resuelve el proyecto y sigue respondiendo por su ruta. Solo deja de
pintarse —el tablero agrupa por `columnId`—, mientras cuenta en «mis tareas».

Se arregló (`fce78c5`) **porque el menú iba a prometerlo**: la confirmación dice
cuántas tareas se van, y esa frase tenía que ser verdad. La confirmación aparece
solo si hay tareas dentro; para una columna vacía preguntar es ceremonia sin
riesgo.

### 19.4 La tarea nace en la columna

«Añadir tarea» abría el `TaskDialog` completo para escribir un título. Las tareas
se apuntan en ráfaga —primero se vuelcan, luego se detallan—, así que ahora se
escriben en un campo dentro de la columna y nacen con prioridad media, que ya es
el default del backend. `TaskDialog` perdió el modo de creación, que con eso
quedaba muerto.

La tarjeta cambió de gesto: antes un botón invisible la cubría entera
(`absolute inset-0`), y eso competía con el arrastre, que es la interacción
principal de un tablero —un arrastre que se queda en dos píxeles cuenta como
clic y abría un modal—, además de no dar ninguna pista de que se pudiera abrir.
Ahora abre un icono de configuración y la superficie queda libre.

### 19.5 Tres trampas nuevas, verificadas en el navegador

**Dentro de un ancestro `draggable` no se puede seleccionar texto con el ratón.**
El campo de renombrar vive en una columna arrastrable: sin desactivar el arrastre
mientras el menú está abierto, no se podía ni marcar una letra para corregirla.

**Los variantes `peer-*` de Tailwind solo miran hermanos.** El cuadro del
checkbox de encargados se pinta con `peer-checked`, pero la marca de dentro es
**hijo** del cuadro, no hermano del input: se enciende con
`peer-checked:[&>svg]:opacity-100`.

**`display: contents` alinea un botón que va dentro de un `<form>`.** En los
comentarios, «Eliminar» necesita formulario —tiene su propia acción— y «Editar»
no, así que uno era un bloque y el otro un botón suelto y no compartían línea.
Con `contents` el formulario desaparece de la maquetación y su botón es hijo
directo del flex de fuera.

**Y una del entorno, no del código:** el navegador de automatización **no dispara
el envío implícito de un formulario** (inyecta `keydown` sin `keypress`), así que
«Enter para enviar» no se puede verificar ahí. Los dos campos donde Enter sostiene
el gesto —tarea nueva y renombrar columna— lo hacen explícito con
`requestSubmit()`, que además es lo que permitió comprobarlo.

### 19.6 Permisos de columna, cada uno en su sitio

Todo colgaba de `canCreateBoard`. Ahora:

| Acción | Permiso |
|---|---|
| Crear columna · reordenar | `canCreateColumn` |
| Renombrar · cambiar color | `canEditColumn` |
| Eliminar (con sus tareas) | `canDeleteColumn` |

Verificado con el rol «Colaborador» (`canEditColumn` sí, `canDeleteColumn` no):
ve color y renombrar, no ve eliminar, ve «Nueva columna» y las flechas de
reordenar, y no ve «Nuevo tablero». Con el permiso quitado del rol, el `PATCH`
responde 403.

---

## 20. Segunda pasada: permisos, cierre y avisos

### 20.1 `canMoveTask` — mover no es editar

Arrastrar una tarjeta a «Hecho» exigía `canEditTask`, el mismo permiso que deja
reescribir el título, cambiar la prioridad y reasignar a quien sea. Quien ejecuta
el trabajo tenía que poder redefinirlo para poder declararlo terminado.

`canMoveTask` entra en el enum y lo pide `POST /tasks/:id/move`. La jerarquía
`canEditTask → canMoveTask` hace el cambio **retrocompatible**: ningún rol
existente pierde capacidad.

Queda una puerta abierta a propósito: `PATCH /tasks/:id` también acepta
`columnId` y `status` y sigue pidiendo `canEditTask`. No es un agujero —editar
implica mover— pero conviene saber que el permiso describe la ruta, no el campo.

| Acción | Permiso |
|---|---|
| Crear tarea | `canCreateTask` |
| Arrastrar entre columnas | `canMoveTask` |
| Editar contenido, etiquetas, encargados, comentar | `canEditTask` |
| Eliminar, moderar comentarios y adjuntos ajenos | `canDeleteTask` |

### 20.2 La columna verde cierra la tarea

Una tarea en la columna «Finalizado» seguía contando como pendiente en el panel,
y no había forma de arreglarlo desde fuera: `Task.status` guarda el **nombre** de
la columna, que cada proyecto elige («Hecho», «Finalizado», «Cerrado», «Done»),
así que nada permitía saber cuál termina el trabajo.

El verde pasa a significarlo (`DONE_COLUMN_COLOR`) y `GET /me/tasks` acepta
`excludeDone=true`.

⚠️ **Es color y significado a la vez, y se eligió a sabiendas.** La alternativa
limpia es un campo `isFinal` con el color en decoración; el coste de esto es que
no se puede tener una columna verde que no cierre ni una de cierre de otro color.
A cambio no hay estado oculto y la regla entera cabe en una frase, que además se
dice **en el selector de color**: un color que cambia el comportamiento y no lo
anuncia donde se elige es una trampa, y la documentación no la desactiva.

El filtro vive en el **gateway**, tercer caso del mismo patrón (con
`TaskPurgeService` y `ColumnStatusSyncService`): la tarea guarda `columnId` pero
las columnas están en projects-service. Si projects-service falla, devuelve las
tareas **sin filtrar** — enseñar de más en un aviso es mejor que quedarse sin
panel.

### 20.3 El aviso lleva a la tarea, no a la puerta del proyecto

El enlace de un aviso apuntaba a `/projects/:id`, y la página abre siempre el
primer espacio: una tarea del tercer espacio te dejaba en el primero, a buscarla
a ojo.

Ahora el enlace lleva `?board=` y `?task=`. **El panel no puede resolver el
espacio** —solo conoce el `boardId` de la tarea, y el árbol del proyecto lo tiene
la otra zona—, así que manda el tablero y la página de proyecto decide:

| Parámetro | Quién lo pone | Para qué |
|---|---|---|
| `?ws=` | el selector de espacios | espacio elegido a mano; gana sobre los demás |
| `?board=` | un aviso del panel | la página busca qué espacio contiene ese tablero |
| `?task=` | un aviso del panel | `ColumnTasks` abre el diálogo en el primer render |

La tarea se abre en el estado inicial de `useState`, no en un `useEffect`: así no
se ve el tablero un instante antes de que el diálogo salte encima.

### 20.4 Los avisos del panel, sin la franja de color

Invitaciones, vencidas y por vencer eran tres rectángulos teñidos con un
`inset 3px 0 0` a la izquierda —una barra dura que competía con el contenido sin
añadir nada al color de fondo—. Los tres comparten ahora `NoticePanel`
(`dashboard-front/src/components/molecules/`): disco con el icono del asunto,
número grande a la derecha **solo si hay más de uno** (con una sola, el título ya
lo dice) y un tinte en diagonal desde la esquina en lugar de fondo plano. El
borde es el de las tarjetas de proyecto, para que el panel se lea como una pieza.

Y las tarjetas de «Mis proyectos» son enlaces: la pantalla que nombra tus
proyectos era justo la que no dejaba abrirlos.

### 20.5 El icono de la tarjeta es un ojo

Era un engranaje, y un engranaje promete ajustes. Para quien no tiene
`canEditTask` el diálogo es lo contrario: seis campos desactivados que solo se
leen. El ojo describe lo único que el botón garantiza —abrir y ver— y el texto
accesible distingue los dos casos.

---

## 21. Los permisos, terminados

> Con esta pasada se cierran **los diecisiete pendientes** de
> `PENDIENTES-BACKEND.md`. Lo que queda no es de esa lista: tareas que no se
> reordenan dentro de su columna y el dominio de notificaciones, que entonces no
> existía en ninguna capa y se construyó justo después (§22).
>
> Las subtareas **salieron de la lista de huecos**: existen en el backend y
> decidimos no exponerlas. Ver §24.5.

### 21.1 El eje que faltaba: ejecutar ≠ definir

Los permisos de tarea eran un solo eje —crear, editar, borrar— y todo lo que no
fuera crear caía en `canEditTask`. Eso metía en el mismo saco dos cosas
distintas: **hacer** el trabajo y **decidir en qué consiste**.

| Ejecutar (`canMoveTask`, `canComment`) | Definir (`canEditTask`) |
|---|---|
| Arrastrar la tarjeta a otra columna | Reescribir el título o la descripción |
| Marcar y desmarcar pasos del checklist | Añadir o borrar pasos |
| Comentar en el hilo | Cambiar prioridad, fecha o encargados |

El agrupado del formulario de roles lo refleja: «Acceso y ejecución» junta ver,
mover y comentar, que es el perfil de quien trabaja en el tablero sin
redefinirlo.

⚠️ Marcar un paso del checklist va con **mover**, no con editar. Es el detalle
que menos se ve y el que más molestaba: quien podía arrastrar su tarjeta a
«Hecho» se encontraba un checklist de solo lectura sobre su propia tarea.

### 21.2 Tres endpoints que pedían el permiso de otro

Todos por lo mismo: el suyo no existía.

| Endpoint | Pedía | Pide | Por qué importaba |
|---|---|---|---|
| `POST /tasks/:id/move` | `canEditTask` | `canMoveTask` | mover obligaba a poder reescribir |
| `POST .../checklists/:id/toggle` | `canEditTask` | `canMoveTask` | ídem, sobre los pasos |
| `POST /tasks/:id/comments` | `canEditTask` | `canComment` | el observador leía y no podía responder |
| `POST /projects/:id/labels` | `canEditTask` | `canManageLabels` | tocar una tarea rehacía el vocabulario del proyecto |
| `DELETE /projects/:id` | `canDeleteBoard` | `canDeleteProject` | borrar **un tablero** habilitaba borrar el proyecto entero |
| `PATCH .../columns/reorder` | `canCreateColumn` | `canEditColumn` | añadir una columna habilitaba reorganizar el tablero |

Todos los permisos nuevos entran **implicados por el que se usaba antes**, así
que ningún rol existente perdió capacidad. Es la única forma de añadir permisos a
un sistema en uso sin romper a nadie.

### 21.3 Dos arreglos que no son de permisos

**`GET /users/me`.** El frontend sacaba el `sub` del JWT y pedía `/users/:id`.
Eso obliga a cada zona a saber leer un token que, por diseño, vive en una cookie
httpOnly que el navegador no puede abrir. Va declarado **antes** de `:id` o Nest
se come «me» y lo estrella contra `ParseUUIDPipe`.

**`PATCH /users/:id` en camelCase.** Era el único endpoint que entraba en
snake_case y salía en camelCase, así que devolverle el objeto que acababas de
leer daba 200 **sin guardar nada**: el `whitelist` descartaba en silencio lo que
no reconocía. De ahí viene la costumbre de confirmar contra el `data` y no contra
el status, que se mantiene.

**`Project.name` es único por dueño.** Era global: dos equipos que no se conocen
no podían tener cada uno su "Sprint 1", y el segundo recibía un conflicto sobre
una fila que no puede ver.

### 21.4 Una tarea entregada no vence

La tarjeta de una tarea en columna de cierre enseña **«Completada»** en verde en
lugar de su vencimiento. La píldora sustituye, no se suma: con las dos, la
tarjeta decía «Completada» y «Venció hace 2 d» a la vez.

Se decide por el **color de la columna**, no por su nombre, así que funciona con
varias columnas de cierre y con cualquier nombre.

---

## 22. Avisos (implementado)

> Dominio nuevo de arriba abajo: no había modelo, ni tabla, ni endpoint. Siete
> tipos de aviso, bandeja en el panel y una insignia en la barra lateral.

### 22.1 Dónde vive cada cosa, y por qué

La tabla está en **projects-service**, dueño ya de membresías e invitaciones —
cinco de los siete eventos. Los dos de tarea los emite **tasks-service**, que ya
llama a projects en cada comprobación de permiso: no añade dependencia ni ciclo.

Y los emite tasks, no el gateway, por una razón concreta: **aquí es donde se sabe
el cambio**. Quién estaba asignado antes y quién queda después solo se puede
comparar dentro de la operación; el gateway tendría que pedir la tarea antes de
tocarla solo para poder diferenciar.

Es la cuarta pieza que cruza el límite entre microservicios, y la primera que no
pasa por el gateway:

| Pieza | Quién llama | A quién |
|---|---|---|
| `TaskPurgeService` | gateway | tasks |
| `ColumnStatusSyncService` | gateway | tasks |
| `excludeDone` de `/me/tasks` | gateway | projects |
| **avisos de tarea** | **tasks** | **projects** |

### 22.2 Cuatro decisiones del modelo

**Nunca se avisa a quien provocó el hecho**, y el filtro vive en el servicio, no
en cada emisor: son seis sitios y bastaba olvidarlo en uno para que la bandeja
empezara a contarte tu propio trabajo.

**Sin claves foráneas, con copias.** Un aviso es un hecho del pasado: guarda
`projectName` y `taskTitle` del momento y sobrevive al borrado de aquello de lo
que habla. Verificado: tras borrar el proyecto, sus tres avisos siguen legibles.

**El `userId` va en el `where` al marcar como leída**, no en una comprobación
previa: no existe el hueco entre leer y escribir, y la ajena responde 404 sin
confirmar que existe.

**Los avisos de tarea son best-effort.** Si projects no responde, la asignación
ya ocurrió: quedarse sin aviso es mucho menos grave que devolver un error por
algo que sí pasó.

### 22.3 Qué **no** es la bandeja

No es una lista de tareas pendientes. Todos los avisos cuentan algo consumado, y
por eso no llevan botones: se leen y, como mucho, llevan al sitio del que hablan.

**Las invitaciones sin responder siguen en el panel**, con sus botones de aceptar
y rechazar. En la bandeja aparece el aviso de que llegaron, y nada más:
duplicar los botones crearía dos sitios donde aceptar lo mismo, y el segundo en
enterarse fallaría.

Tampoco hay `TASK_EDITED`. Se descartó a propósito: emitirlo en cada `PATCH`
—marcar un paso, cambiar una etiqueta— llenaría la bandeja de ruido y el aviso
útil se perdería entre los demás.

### 22.4 El refresco, y su trampa

No hay tiempo real: los avisos nacen de acciones ajenas y no hay canal abierto.
`AutoRefresh` reconsulta cada 60 s con `router.refresh()`, que revalida el Server
Component **conservando el estado del cliente** — `location.reload()` perdería lo
que hubiera escrito y saltaría el scroll.

⚠️ **Se pausa con la pestaña oculta**, y eso tiene consecuencia al verificar: el
panel del navegador de automatización mantiene el documento como `hidden`, así
que el intervalo no llega a dispararse allí. Lo que sí se puede comprobar —y se
comprobó— es el camino entero al volver a visible: el aviso nuevo aparece solo y
la insignia se actualiza con él.

---

## 23. El armazón, en dos piezas

> Cambio de estructura, no de aspecto: la pantalla se ve igual. Lo que cambia es
> **cuándo se vuelve a dibujar**.

### 23.1 Por qué se partió

`AppLayout` vivía dentro de cada page. Navegar entre pantallas de la misma zona
lo desmontaba entero, así que el `loading.tsx` tenía que reproducirlo — y lo
reproducía con esqueletos: parpadeaban los enlaces de la barra lateral, el nombre
y el correo de quien ya estaba identificado, y hasta el botón de cerrar sesión.
Ninguna de esas cosas depende de la pantalla.

| Pieza | Dónde vive | Qué contiene |
|---|---|---|
| `AppShell` | `layout.tsx` de la zona | barra lateral, cajón móvil, usuario, cerrar sesión |
| `AppHeader` | cada page | título, acción de la pantalla, contenido |

Next conserva los layouts entre navegaciones del mismo segmento, así que el
armazón no se vuelve a renderizar ni vuelve a pedir el contador de
notificaciones: **una vez por visita a la zona**, no una por pantalla. El
`loading.tsx` pasa a cubrir solo la cabecera y el contenido.

Las pantallas cuelgan de un grupo de rutas `(private)`, que envuelve sin
aparecer en la URL.

### 23.2 Lo que costó el corte

**`activePath` se calcula dentro**, con `usePathname()` más un `zonePath` que
declara la zona. La trampa del basePath (§16) no desaparece —`usePathname()`
sigue devolviendo la ruta sin prefijo— pero ahora se resuelve en un sitio en vez
de en cada page.

**El botón del menú móvil quedó separado del cajón que abre:** uno está en la
cabecera y el otro en el armazón. Viaja por contexto, y es el único estado que
cruza esa frontera.

### 23.3 Dos detalles del tablero

**La columna tiene tope de altura** y se desplaza por dentro, sin barra visible.
El desplazamiento va en la lista de tarjetas y no en la zona de suelta, para que
«Añadir tarea» quede fijo abajo: es cuando la columna está llena cuando más
molesta tener que bajar hasta el final para añadir una.

**El tablero es un lienzo transparente con retícula de puntos**, la de cualquier
pizarra. No tiene color propio: se ve el fondo de la página, y lo delimitan los
puntos y el borde.

Los bordes se hunden con **dos sombras `inset`**, una corta y densa y otra larga
y suave. Antes era una máscara que desvanecía los puntos y no se notaba: los
puntos ya son tenues, así que atenuar algo tenue no se ve; oscurecer el fondo sí.

La sombra `inset` además cabe en el propio `<section>`, porque se pinta **encima
del fondo y debajo del contenido**: apaga los puntos del borde sin tocar las
tarjetas. Una máscara no podía —`mask-image` recorta también a los hijos— y por
eso necesitaba una capa aparte que ya no hace falta.

---

## 24. Administrar el proyecto, y la pantalla de ajustes

> Tercera pasada. Lo que faltaba no era una función nueva del dominio: era poder
> **administrar lo que ya existe** —renombrar un proyecto, borrarlo, editar tus
> datos— desde la interfaz en vez de con `curl`.

### 24.1 `canEditProject`: el séptimo endpoint que pedía el permiso de otro

`PATCH /projects/:id` exigía **`canEditBoard`**. Es la misma familia que se cerró
en §21.2, con la misma forma: el permiso propio no existía, así que se usó el más
parecido. Y aquí el parecido era poco — renombrar el proyecto no tiene nada que
ver con editar uno de sus tableros, y al revés, quien organiza los tableros no
tiene por qué poder rebautizar el proyecto entero.

| Endpoint | Pedía | Pide |
|---|---|---|
| `PATCH /projects/:id` | `canEditBoard` | `canEditProject` |

Entra **implicado por `canEditBoard`**, que es la única forma de añadir un permiso
a un sistema en uso sin romper a nadie. Séptima vez que se aplica el patrón.

⚠️ **`expandPermissions` recorre `PERMISSION_HIERARCHY` una sola vez**, así que la
expansión **no es transitiva**: `canDeleteProject → canDeleteBoard → canEditBoard
→ canEditProject` solo funciona porque el orden de inserción va de mayor a menor
alcance. Es una dependencia del orden de las claves de un objeto, que nadie
espera. Por eso `canEditProject` se escribe en las **tres** entradas que deben
concederlo aunque quede repetido: repetir es barato, y depender del orden de
inserción se rompe el día que alguien reordene el mapa por estética.

Verificado con las dos cuentas contra el stack levantado:

| Caso | Resultado |
|---|---|
| Miembro con rol `canDeleteTask` + `canEditColumn` | `canEditProject: false`, `PATCH` **403** |
| Dueño | 200 (bypass por `ownerId`) |
| Al mismo rol se le añade `canEditBoard` | `canEditProject: true`, `PATCH` **200** |
| Y `canDeleteProject` con ese rol | sigue en `false` — no se concede de más |

### 24.2 «Configuración» **absorbió** `/dashboard/perfil`

La pantalla de datos del usuario existía y no tenía entrada en la barra lateral:
se llegaba desde un enlace del panel que solo aparece cuando la cuenta **no**
tiene nombre. Una vez puesto el nombre, la pantalla quedaba inalcanzable.

Al darle entrada propia había dos caminos, y se eligió el primero:

| Opción | Por qué no / sí |
|---|---|
| **Configuración se lleva la pantalla** | ✅ Un sitio para editar el perfil, y la entrada nueva lleva a contenido real |
| Configuración enlaza a «Tus datos» | ❌ Una pantalla cuyo único contenido es un enlace a otra es un salto de más |
| Las dos rutas, con el mismo formulario | ❌ Dos sitios donde editar lo mismo, y el segundo se queda atrás |

`/dashboard/perfil` queda como **redirect** a `/dashboard/configuracion`. No es
por compatibilidad con nadie de dentro —los enlaces internos ya apuntan al sitio
nuevo— sino por los marcadores y los enlaces compartidos, que no se pueden
corregir desde aquí.

**Está montada para crecer**, que era el encargo: la page es una pila de
`SettingsSection` con una sola sección dentro. La sección es un componente y no
maquetación suelta precisamente porque hoy hay una: en cuanto llegue la segunda,
dos bloques hechos a mano dejan de parecerse, y unificarlos después obliga a
tocar los dos.

Se cayó el «← Volver al panel»: con la entrada resaltada en la barra lateral, un
enlace de vuelta a su lado sobra.

⚠️ **El correo sigue sin editarse, y es del backend:** vive en `Credential`, en
credentials-service, y no hay endpoint que lo cambie. El campo se enseña
desactivado con el motivo escrito debajo, que es lo más honesto que se puede
hacer sin inventar el endpoint.

Verificado en el navegador: entrada nueva con su icono, resaltado correcto (la
regla del prefijo más largo de `NavList` ya lo resolvía), `/dashboard/perfil`
aterriza en `/dashboard/configuracion`, y guardar el apellido confirma contra el
`data` y **actualiza el nombre de la barra lateral** — que vive en el layout, y
lo alcanza `revalidatePath('/configuracion')`.

### 24.3 Borrar un proyecto, y el contador que destapó un bug de caché

`canDeleteProject` existía desde `ee8be65` y `DELETE /projects/:id` funcionaba,
pero **no había forma de borrar un proyecto desde ninguna pantalla**: se podía
crear y no deshacer. El botón vive en la cabecera del detalle, en la misma fila
que «← Todos los proyectos» —las dos acciones sobre el proyecto entero, ninguna
del título— y solo aparece con `canDeleteProject`, leído de
`GET /projects/:id/permissions/me` y **no deducido de `isOwner`**: un rol con ese
permiso también puede.

La confirmación es la pieza que importa, y no es un «¿seguro?»:

| Decisión | Por qué |
|---|---|
| Dice cuánto se va, con **números reales** | Es la única frase que convierte «se borra todo» en algo que se puede sopesar |
| Hay que **escribir el nombre** | Un «¿seguro?» se pulsa sin leer. Igual que `DeleteWorkspaceButton`, pero **siempre**: un proyecto nunca está lo bastante vacío |
| Un cero **no se enseña** | Lo que no existe no se puede perder, y ocho líneas con ceros esconden las que importan |
| Lo que no se pudo contar dice **«no se pudieron contar»** | En una confirmación de borrado, un cero falso es peor que admitir que no se sabe |

**El inventario se pide al abrir el diálogo, no al renderizar la página.** Los
contadores del árbol —espacios, tableros, columnas, roles— salen de
`GET /projects/:id`, que la página ya tiene. Las tareas y las invitaciones
pendientes no, y contar tareas cuesta **una petición por tablero**: pagarlas en
cada visita al proyecto para una acción que casi nadie ejecuta es trabajo tirado.
Los ids de los tableros se vuelven a resolver dentro de la acción, desde el
`projectId`, y no se reciben del cliente.

#### 🔴 La clave `tasks:board:<id>` no incluye la paginación

Contar tareas con `?limit=1` —solo hace falta el `total`— parecía lo barato.
Reproducido contra el stack:

```
DEL tasks:board:<id>
GET /boards/<id>/tasks?limit=1    → items: 1, total: 7   ← se cachea así
GET /boards/<id>/tasks?limit=100  → items: 1, total: 7   ← el tablero sale con 1 tarea
```

`findAllTasks` cachea bajo `tasks:board:<boardId>` **sin la página ni el límite
en la clave**, 60 s. Cualquier petición con otra paginación envenena el listado
del tablero, y la página lo pide con `limit=100`.

**No se arregla en esta pasada, y el motivo es la trampa de siempre:** la clave se
invalida con `del` exacto en **catorce sitios** de tasks-service. Meterle la
paginación los dejaría a todos sin efecto, en silencio, que es exactamente cómo se
rompió seis veces la invalidación del tablero. El arreglo bueno es borrado por
patrón (`SCAN` + `del`), y eso es rediseñar la capa de caché, no una línea.

> Nota: la variante `tasks:board:<id>:col:<columnId>` que ya existía tiene el
> mismo problema y **nadie la borra nunca**: los catorce `del` son de la clave sin
> sufijo. Vive lo que dure su TTL.

Mientras tanto, el inventario **pide con el mismo `limit=100` que la página**, así
que comparte la entrada de caché en vez de envenenarla, y el `total` viene gratis
en esa misma respuesta.

#### Verificado en navegador y en la base

Proyecto de sacrificio con 2 espacios, 2 tableros, 4 columnas, 8 tareas, 2
etiquetas, 1 persona, 1 rol y 1 invitación pendiente:

| Caso | Resultado |
|---|---|
| Inventario del diálogo | Las ocho cifras cuadran fila por fila con `psql` |
| Singulares | «1 persona», «1 rol», «1 invitación sin responder» |
| «proyecto de sacrificio» en minúscula | Botón **desactivado** |
| Nombre exacto | Borrado, y aterriza en la lista de proyectos |
| Filas después, en los **dos** esquemas | Todo a 0, tareas incluidas — `TaskPurgeService` cruza el límite entre microservicios |
| Proyecto demo | Intacto |
| La misma pantalla con el rol «Colaborador» | **No** aparece «Eliminar proyecto» |

### 24.4 Nombre y descripción, editables donde se leen

Eran texto plano y solo se podían cambiar con `curl`. Ahora se comportan como en
un documento compartido: **parecen texto, al hacer clic son un campo, y se
guardan solos** tras 700 ms de silencio.

**Son campos siempre, no texto que se convierte al pulsar.** Cambiar el `<h2>`
por un `<input>` en el clic obliga a devolver el foco a mano y a acertar con el
momento —el primer carácter se pierde si el `focus()` llega tarde— y deja al
teclado sin forma de entrar. Aquí el campo está desde el principio y lo único que
cambia es cómo se pinta: sin borde en reposo, con borde al pasar por encima, con
fondo al enfocar. Sin `canEditProject` la cabecera es el `<h2>` y el párrafo de
siempre: quien solo mira no debe encontrarse campos, ni desactivados.

#### El error que estaba en el planteamiento: `revalidatePath` sí re-renderiza

La primera versión revalidaba solo `/` —la lista— desde la acción de guardado, y
**no** el detalle, apoyándose en lo que dice la documentación de Next:

> **Server Functions**: Updates the UI immediately (if viewing the affected path).

De ahí se deduce que revalidar `/` mientras se ve `/<id>` no cuesta nada. **Es
falso**, y se vio en el navegador con un `MutationObserver` sobre el `<h1>` de
`AppHeader`: cambiaba **antes de salir del campo**, es decir el detalle se estaba
re-renderizando en cada guardado, con su árbol y una petición de tareas por
tablero. La frase de la documentación describe cuándo se **ve** el efecto, no
cuándo se paga el render.

Cómo queda:

| Momento | Qué ocurre |
|---|---|
| Cada 700 ms de silencio | `PATCH` del campo que cambió. **Cero revalidación** |
| Al confirmar el guardado | Se escribe `document.title` a mano |
| Al salir del campo | **Una** llamada a `settleProjectAction`, que revalida `/<id>` y `/` |
| Al salir sin haber cambiado nada | Nada |

Medido: escribiendo el nombre completo, el `<h1>` registra **0 cambios** hasta
salir del campo y **1** al salir.

#### `flush()` no era la señal correcta

Primer intento: `flush()` devolvía «acabé de guardar» y con eso se decidía si
revalidar. Al salir del campo el debounce **ya había guardado**, así que `flush()`
no tenía nada que hacer, devolvía `false`, y la revalidación no llegaba nunca —el
`<h1>` se quedaba con el nombre viejo. «Acabo de guardar ahora» y «hay algo que
poner al día» no son la misma pregunta: la segunda vive en un `ref` que enciende
cada guardado y apaga la revalidación.

#### La pestaña se escribe a mano

El título vive en tres sitios: el campo, el `<h1>` de `AppHeader` y la pestaña
(`generateMetadata`). Los dos primeros los arregla la revalidación; el tercero no,
porque `generateMetadata` solo se vuelve a evaluar al navegar. Se asigna
`document.title` con **lo que confirmó el servidor**, no con lo que se escribió.

#### 🟠 `PATCH` con nombre repetido devolvía 500

`477616f` capturó el P2002 al **crear** un proyecto y se olvidó de **renombrar**,
así que un nombre duplicado en el `PATCH` salía como error no controlado: **500
«Internal server error»**, sin nada que enseñar. Con el nombre editable en línea
deja de ser un caso raro: se guarda mientras se escribe, y un nombre a medias
choca con cualquiera de los tuyos. Arreglado igual que al crear.

Y el 409 **no toca el texto**: el mensaje del backend sale al lado del campo, lo
escrito sigue donde estaba y el `<h1>` conserva el último nombre bueno.
Sustituirlo por el valor del servidor borraría lo que la persona está escribiendo
justo cuando más le importa.

#### Dos detalles de maquetación que costaron entenderlos

Los campos miden **lo que mide su texto** con una rejilla de una celda: un
`<span>` invisible con el mismo texto ocupa el hueco y dicta el tamaño. Sin eso el
`<input>` abarcaría la fila entera y se leería como un formulario en reposo.

- ⚠️ **`size={1}` en el `<input>`.** Al medir la columna cuenta también el ancho
  intrínseco del campo, que por defecto son **20 caracteres** — en `text-4xl`,
  media pantalla. Con el nombre largo no se notaba; con «X9573» el campo salía
  cinco veces más ancho que su texto.
- ⚠️ **El fantasma lleva el mismo `border` que el campo**, aunque sea
  transparente. Sin él mide 2 px menos y el `<textarea>` se desborda: `scrollHeight`
  92 contra `clientHeight` 90, con la última línea recortada.

#### Verificado en navegador

| Caso | Resultado |
|---|---|
| Escribir el nombre | Guarda una vez tras el silencio, «Guardado» en verde |
| `<h1>` mientras se escribe | **0 cambios**; 1 al salir del campo |
| Pestaña del navegador | Se actualiza con el nombre confirmado |
| Nombre de otro proyecto propio | **409** con el mensaje del backend, texto intacto, `aria-invalid` |
| Seguir escribiendo tras el 409 | Guarda al llegar a un nombre libre |
| Descripción de dos líneas | El campo crece, sin barra y sin recorte |
| Reposo | Indistinguible del texto que había antes |
| Rol «Colaborador» (sin `canEditProject`) | `<h2>` y párrafo, **cero campos** |

### 24.5 Las subtareas: capacidad heredada que decidimos **no** usar

`Task.parentTaskId`, la autorrelación y el comando `subtask_create` existen en el
backend porque venían del modelo original del otro equipo. Llevaban desde
entonces apuntadas como «hueco de producto: existen y no tienen interfaz».

**Salen de esa lista. No las vamos a exponer.**

El checklist ya cubre «partir una tarea en pasos», y con mucha menos ceremonia:
un campo de texto dentro de la tarea contra una tarea entera con su título, su
columna, su `status`, sus encargados y su propio diálogo. Una subtarea solo
aportaría algo si cada paso necesitara **dueño y fecha propios** — y para eso son
mejores dos tareas normales relacionadas por etiqueta, que además caben en el
tablero y cuentan en «mis tareas».

Lo que eso implica, escrito para que nadie lo «arregle» por error:

| Sitio | Qué pasa |
|---|---|
| `POST /boards/:id/tasks` | Acepta `parentTaskId`; **la interfaz no lo manda nunca** |
| `Task.subtasks` en la respuesta | Sigue viniendo, siempre `[]`. Declarado en el tipo porque el backend lo manda |
| Chip «N subtareas» de `TaskCard` | **Retirado** |
| PENDIENTES-BACKEND | Ya no figura como hueco |

El chip se va y no se queda «porque no molesta»: nada en la interfaz puede crear
una subtarea, así que era un contador condenado a decir siempre cero y a prometer
una función que no existe. Un elemento que solo aparecería si alguien tocara la
API a mano no es información, es una pista falsa.

No se toca nada del backend: quitar el soporte sería una migración con borrado de
una columna para no ganar nada.

Y un sitio que la decisión dejaba mintiendo: **la landing prometía subtareas** en
dos textos —un paso del recorrido del miembro y una tarjeta titulada «Subtareas y
checklists»—. Es la página pública: prometía una función que no existe en ninguna
pantalla. Reescritos en términos del checklist, que es lo que sí hay.

### 24.6 Estado del móvil y del árbol

Comprobado a 375 px: la fila nueva de la cabecera —«← Todos los proyectos» y
«Eliminar proyecto»— cabe sin desbordar, el título y su insignia envuelven, y la
barra lateral acepta la quinta entrada sin apretarse.

> Nota de entorno, no del código: `apps/frontend/dashboard-front/.next/` guarda un
> `types/validator.ts` de una build anterior a que las pantallas se movieran al
> grupo `(private)`, y como el `tsconfig` incluye `.next/types/**/*.ts`, un `tsc
> --noEmit` a mano informa de dos módulos que no existen. Está en `.gitignore` y
> desaparece borrando `.next`; no afecta a `next dev` ni al build.

---

## 25. Reportes: primero el historial que nunca se guardó

> Sección nueva de arriba abajo —microservicio y microfrontend propios— para
> análisis, tiempos y predicción. Empieza por el backend porque **el dato que
> hace falta no existe**, y solo se puede capturar hacia adelante.

### 25.1 El hallazgo que decidió el alcance

Antes de diseñar nada se inventarió qué datos hay. Resultado: **no existe ningún
registro histórico en todo el sistema.** Cero tablas de auditoría, eventos o
transiciones de estado, en los cuatro esquemas. Además:

- `Task` no tenía `completedAt` ni estimación de esfuerzo.
- `Checklist` solo tiene `completed: Boolean`, sin fecha de marcado.
- **`Task.updatedAt` no aproxima nada**: lo pisa cualquier `PATCH` —título,
  prioridad, una etiqueta— y también `restatusTasks`, la cascada que reescribe el
  `status` al renombrar una columna.
- No había ni un solo `groupBy` ni `aggregate` en el backend.

Traducido: **«análisis» y «reportes estadísticos» eran posibles; «predicción de
tiempos» y «rendimiento» no**, y no por falta de interfaz sino porque el dato
nunca se guardó. De ahí el orden: la captura sale **antes** que cualquier
pantalla, porque cada día sin ella es un día que no tendremos nunca.

### 25.2 `TaskEvent`, y por qué guarda `columnId` y no `status`

Tabla nueva en tasks-service, más `Task.completedAt`. Ocho tipos de evento:
`CREATED`, `MOVED`, `COMPLETED`, `REOPENED`, `ASSIGNED`, `UNASSIGNED`,
`PRIORITY_CHANGED`, `DELETED`.

⚠️ **El movimiento se guarda por id de columna, nunca por `status`.** El `status`
es el *nombre* de la columna, y renombrarla lo cambia en todas sus tareas sin que
ninguna se mueva. Un historial apoyado en el nombre registraría movimientos que
no ocurrieron. Por lo mismo, **`restatusTasks` no emite ningún evento**: renombrar
no es mover, y emitir ahí fabricaría un movimiento por tarea, todos con la misma
marca de tiempo.

Se vio en la verificación: tras renombrar «Hecho» → «Terminado», los cuatro
`MOVED` resuelven correctamente sus columnas actuales, y no apareció ninguno de
más.

**Sin clave foránea hacia `Task`**, igual que `notifications` (§22.2): un evento
es un hecho del pasado. Con `onDelete: Cascade`, limpiar una tarea del tablero
borraría su historial y el throughput del mes pasado cambiaría retroactivamente.
Solo se borran al borrar el **proyecto**, donde ya no hay ruta desde la que
pedirlos.

### 25.3 La transacción, al revés que en los avisos

El evento y la mutación que describe van en **un `prisma.$transaction`**. Si falla
el evento, **se pierde la mutación**.

Es la decisión contraria a la de los avisos, que son best-effort a propósito
(§22.2), y la diferencia está en cómo fallan:

| | Aviso perdido | Movimiento no registrado |
|---|---|---|
| ¿Se nota? | Sí, falta en la bandeja | **Nunca** |
| ¿Se puede reparar? | Sí, el hecho sigue ahí | No, el dato que faltaría es el que diría que falta |
| Coste de la garantía | Salto a otro microservicio | Misma base, mismo esquema |

Un tiempo de ciclo calculado sobre un historial con huecos silenciosos es peor
que no tener tiempo de ciclo.

### 25.4 Quién sabe que una columna es verde

`tasks-service` no conoce los colores: son un campo de `BoardColumn`, en
projects-service. Lo resuelve el **gateway**, con `column_find_by_ids` —el mismo
comando que ya usa `excludeDone`— y le pasa `isClosingColumn` a tasks-service.

Es el **cuarto** cruce de esa frontera que se resuelve en el gateway, y por el
mismo motivo que los tres anteriores: hacer que tasks llamara a projects
encadenaría dos saltos en una ruta que se ejecuta al arrastrar cada tarjeta.

Se aplica en **las dos** rutas que mueven: `POST /tasks/:id/move` y el `PATCH`,
que también acepta `columnId`. Si solo lo hiciera la primera, cerrar una tarea
editándola no contaría en ningún reporte.

Si el gateway no puede resolver el color, llega `undefined` y **no se toca
`completedAt`**: un cierre falso ensucia el throughput para siempre; no
registrarlo solo deja el dato incompleto, que es reparable.

### 25.5 Verificado contra el stack

Proyecto de usar y tirar, once eventos, comprobados en `psql`:

| Caso | Resultado |
|---|---|
| Crear | `CREATED` con la prioridad inicial, y `ASSIGNED` por cada encargado de origen |
| Mover entre columnas normales | Un `MOVED`, sin tocar `completedAt` |
| Mover a la verde | `MOVED` + `COMPLETED`, y `completedAt` puesto |
| Sacarla de la verde | `MOVED` + `REOPENED`, y `completedAt` de vuelta a `null` |
| Cerrarla otra vez | `completedAt` nuevo, no el de la primera vez |
| **Renombrar la columna** | **Cero eventos** |
| `PATCH` de prioridad, dos veces con el mismo valor | **Un** `PRIORITY_CHANGED`, no dos |
| Borrar la tarea | `DELETED`, y sus 11 eventos siguen ahí con la fila ya borrada |
| Borrar el proyecto | Los 11 desaparecen |

⚠️ Las tres tareas que ya estaban en «Hecho» en el proyecto de demostración
tienen `completedAt: null`, y así se quedan: nunca se guardó cuándo llegaron.
Es la forma más concreta de ver que el historial solo existe hacia adelante.

### 25.6 El quinto microservicio, y el primero sin base de datos

`reports-service` en TCP **3005**. Es el único de los cinco **sin Prisma y sin
`DATABASE_URL`**: no guarda nada. Lee de tasks-service y projects-service por
TCP, hace la matemática y responde. Darle un esquema vacío en Postgres solo
habría añadido una migración que no migra nada.

Lo único que persiste es la caché de resultados en Redis (60 s), que es
desechable por definición.

⚠️ `docs/backend/examples/README.md` asignaba el 3005 a un «Notifications
Service» que **nunca existió** —las notificaciones viven dentro de
projects-service— y el puerto estaba libre. Corregido de paso.

#### La frontera, y lo que cuesta

De las tres opciones, se eligió que **la agregación viva en el servicio dueño del
dato**: `tasks-service` gana un `StatsService` con los primeros `groupBy` del
backend, y `reports` orquesta y calcula.

| Opción | Por qué no / sí |
|---|---|
| **Agregar en el servicio dueño** | ✅ Cada servicio sigue mandando sobre su esquema |
| `reports` lee los esquemas ajenos | ❌ Menos código, pero un cambio de esquema en `tasks` rompería los reportes **en silencio** |
| Tablas de hechos propias | ❌ El triple de trabajo y un modo de fallo nuevo: la copia se desincroniza |

El coste real de la elegida, dicho sin adornos: **cada métrica nueva necesita un
comando nuevo en el servicio dueño**, y los cruces entre dominios —ponerle nombre
y color a un `columnId`— se hacen en memoria dentro de `reports`.

#### 🔴 `COUNT(*)` es `bigint`, y un BigInt no se serializa a JSON

Las tres consultas agregadas devolvían **500 sin ninguna pista**: «Internal
server error» y nada más. El error real —`Do not know how to serialize a
BigInt`— ocurría al cruzar el TCP, después de que la consulta hubiera ido
perfectamente.

Se arregla casteando a `::int` **en el propio SQL**, que es donde nace el
problema. Vale la pena recordarlo: cualquier consulta agregada nueva lo necesita.

> Y una lección de método: el mismo SQL corría sin problema en `psql`, así que
> durante un rato pareció que el fallo estaba en la consulta. No lo estaba: la
> consulta era correcta y lo que fallaba era serializar su resultado.

#### Otra que costó, y era mía

Un comentario SQL dentro de un `$queryRaw` llevaba **acentos graves** alrededor
de un nombre de función. Dentro de un template literal eso cierra la cadena: el
servicio dejó de compilar, `nest start --watch` **siguió sirviendo el `dist`
anterior**, y el síntoma fue un endpoint que fallaba mientras los demás
funcionaban. Sin acentos graves dentro de un `$queryRaw`.

### 25.7 Las rutas, y dónde se pone la línea

```
GET /projects/:projectId/reports/snapshot     canViewProject
GET /projects/:projectId/reports/flow         canViewProject
GET /projects/:projectId/reports/cycle-time   canViewProject
GET /projects/:projectId/reports/forecast     canViewProject
GET /projects/:projectId/reports/people       canViewReports   ← por persona
```

`ProjectPermissionGuard` **no se tocó**: al colgar de `/projects/:projectId/...`
resuelve el proyecto de `params` directamente. No hizo falta apuntar el
controlador en `TASK_CONTROLLERS` ni en ninguna otra lista, al contrario que los
de tarea.

`canViewReports` es el octavo permiso que entra **implicado por el que ya
existía** —`canManageMembers`, `canEditProject` y `canDeleteProject`—, así que
los «Administrador» ya creados lo tienen sin migración.

**Por qué existe:** no es seguridad, es privacidad. Los datos del trabajo no son
secretos, pero un tablero con las cifras de todo el mundo a la vista se lee como
una clasificación aunque nadie lo pretenda. Enseñarlas debería ser una decisión
de alguien, no el estado por defecto.

### 25.8 Nada de medias, y una predicción que se niega a predecir

**Ningún reporte de tiempos devuelve una media.** La distribución de un tiempo de
ciclo tiene cola larga —unas pocas tareas que se eternizan— y la media se va
detrás de esa cola: acaba describiendo un caso que no le pasa a nadie. Se usan
percentiles 50 y 85.

La predicción es **Monte Carlo sobre el ritmo observado**: se remuestrea con
reemplazo cuántas tareas se cerraron cada día —**incluidos los días de cero**, o
el ritmo saldría inflado y la predicción sistemáticamente optimista— y se cuenta
cuántos días hacen falta para vaciar lo abierto, 5 000 veces.

Se eligió esto en vez de burndown porque **no hay ningún campo de esfuerzo** en
la tarea, y añadirlo habría significado pedirle a alguien que mantenga un número
en cada tarjeta. Aquí el dato se recoge solo: es el propio flujo del tablero.

⚠️ **Por debajo de 10 tareas cerradas y 14 días, `prediccion` es `null`** y la
respuesta dice cuánto falta. Es la regla más importante de la sección: una
predicción sacada de cuatro tareas parece igual de seria que una sacada de
cuatrocientas, y es la forma más rápida de perder la confianza de quien la lee.

### 25.9 Verificado contra el stack

| Caso | Resultado |
|---|---|
| `snapshot` con el proyecto demo | 8 tareas, 1 vencida, 2 sin asignar, checklist 2/3, reparto por columna con nombre y color |
| `flow` | Serie diaria con las cuatro columnas |
| `cycle-time` | `suficiente: false`, percentiles `null` — **0 cerradas desde que hay historial** |
| `forecast` | **`prediccion: null`** y «faltan 10 tareas» |
| `people` como dueño | 200, dos personas con carga y vencidas |
| `people` como «Colaborador» | **403** |
| `snapshot` como «Colaborador» | **200** — la línea cae donde debe |
| `permissions/me` | `canViewReports`: dueño `true`, colaborador `false` |
