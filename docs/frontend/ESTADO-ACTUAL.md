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
| `projects-front` | ✅ Funcional | Lista, detalle, espacios, tableros, tablero Kanban, tareas, checklists, miembros, roles y etiquetas. La zona más grande. Zona propia en el 4103. Ver §18–§24 y §28. |
| `dashboard-front` | ✅ Funcional | Panel y datos del usuario, contra el backend real. Zona propia en el 4102. Ver §17. |
| `admin-front` | ✅ Funcional | Cuentas, proyectos y registro de actividad. Zona propia en el 4105. Ver §31. |
| `reports-front` | 🚫 **Archivada** | Análisis y asistente. Se retiró en F1 de [PLAN-FUSION-ZONAS](../PLAN-FUSION-ZONAS.md): de sus quince gráficas solo una o dos daban valor y llevaba meses sin entrada en el menú. `/reports` responde 404 y el 4104 queda libre. **`reports-service` y las once rutas de análisis del gateway siguen en pie** — PRAX las usa. §25, §26, §29 y §30 se conservan porque describen lo que hubo. |
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

⚠️ Next.js 16 es una versión con breaking changes. Hay que consultar `node_modules/next/dist/docs/` antes de usar una API que no esté ya verificada en este repo (regla recogida en CLAUDE.md). Se respeta esa regla.

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

Paleta: oscuro y claro desde §27. Fondo oscuro `#0D0F14`, primario `#6C63FF`,
acento `#D4A843`, texto `#E8EAF0` — siguen siendo el default (`@theme`, sin
`data-theme` en el `<html>`).
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
5. ~~**admin-front** — usuarios y roles globales; depende de arreglar `GET /users`.~~ ✅ Hecho, y con más de lo previsto: jerarquía de roles, registro de actividad y suspensión de proyectos. Ver §31.
6. ~~**reports-front** — bloqueado, no hay backend.~~ ✅ Hecho. Ver §25 y §29.

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

> Panel en `/dashboard` y datos del usuario en `/dashboard/profile`. Zona propia,
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
| `next/link` dentro de la zona | `/profile` | Next añade `/dashboard` solo |
| `revalidatePath()` | `/`, `/profile` | son rutas del App Router de la app, que no incluye el basePath |
| `activePath` de `AppLayout` | `/dashboard/profile` | ruta **pública**: se compara con enlaces del shell |
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
`/dashboard/profile` sí redirigía — fácil de pasar por alto. En el shell
significaba que la landing nunca renovaba la sesión, que es justo para lo que
existe ese proxy. Se arregla añadiendo `'/'` como entrada aparte:

```ts
matcher: ['/', '/((?!_next/static|_next/image|favicon.ico|api/).*)']
```

Se detecta en el desglose de tiempos de `next dev`: `GET /profile` muestra
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
10. `scripts/dev-cli/config/services.mjs` → `FRONTEND_APPS`, de donde salen los
    `.env.local` y los puertos que el CLI espera antes de dar la zona por arriba.

🔴 **11. Y el despliegue, que es lo que se olvida.** `pnpm dev:frontend` recoge
la zona sola —su filtro es por directorio (`--filter="./apps/frontend/*"`)— y
eso hace creer que basta con `git push`. **No basta.** La imagen de producción
enumera las zonas **a mano** en dos sitios de
`infra/docker/images/frontend.Dockerfile`:

- el `COPY apps/frontend/<zona>/package.json` de la capa de instalación;
- el `--filter "@praxis/<zona>"` del `RUN pnpm … run build`.

Más el proceso y su `<ZONA>_FRONT_URL` en `frontend.pm2.config.cjs`.

⚠️ **Y lo que hace esto peligroso es cómo falla.** Sin el `--filter`, la imagen
**se construye sin error**: simplemente no lleva esa zona dentro. El
contenedor arranca, las otras seis funcionan, y el fallo solo aparece cuando
alguien entra a `/<zona>` en producción. `cloudbuild.yaml` no ayuda: construye
una sola imagen del frontend y no enumera zonas, así que no hay dónde
enterarse.

No hace falta tocar el cortafuegos: las zonas solo son alcanzables por
loopback (`--network host`) y únicamente el 4100 acepta tráfico de fuera.

### 17.8 Verificado en navegador real

| Caso | Resultado |
|---|---|
| `/dashboard` sin sesión | 307 → `/auth/login` |
| `/dashboard/profile` sin sesión | 307 → `/auth/login` |
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

`/dashboard/perfil` queda como **redirect** a `/dashboard/settings`. No es
por compatibilidad con nadie de dentro —los enlaces internos ya apuntan al sitio
nuevo— sino por los marcadores y los enlaces compartidos, que no se pueden
corregir desde aquí.

> **Superado por §37.** «Tus datos» volvió a salir de Configuración a una
> pantalla propia, y esa pantalla vive hoy en `/dashboard/profile`. `/perfil`
> sigue siendo una redirección, pero ahora apunta ahí, no a `/settings`.

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
aterriza en `/dashboard/settings`, y guardar el apellido confirma contra el
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

### 25.10 La semilla, y por qué crea un proyecto aparte

El historial nace vacío, así que sin esto la sección enseña estados vacíos
durante semanas. La semilla (`tasks/prisma/seed-events.ts`) fabrica **8 semanas
de flujo** con 60 tareas.

**No retro-rellena el proyecto real, y no es pereza:** nadie guardó cuándo se
movió cada tarea de «Rediseño del panel», y fabricar ese dato encima del real
sería mentir sobre trabajo que sí ocurrió. Crea un proyecto **aparte**, llamado
«Sprint histórico (datos de demostración)», y el de siempre se queda intacto.

**Marcado en el dato:** todos los eventos llevan
`actorId = 00000000-0000-0000-0000-000000000000`, que no puede ser el id de
nadie. `snapshot` devuelve `eventosSinteticos`, para que la pantalla pueda
avisar. Verificado: 246 en el proyecto sembrado, **0 en el real**.

#### Dos ajustes que hicieron falta al mirar el resultado

**El primer intento cerraba solo 15 de 60**, porque el destino de cada tarea se
elegía uniforme. Salía un ritmo de 0,25 tareas/día y una predicción de **180
días**: aritméticamente correcto y pésimo como demostración, porque lo que se
quiere enseñar es cómo se lee un equipo que funciona. Ahora dos tercios llegan al
final: 38 cerradas, ritmo 0,62/día, predicción 36–45 días.

**Los tiempos salen de una distribución con cola**, no uniformes, y los fines de
semana pesan menos. Con un ritmo constante los percentiles 50 y 85 salían casi
pegados y el gráfico parecía de mentira — que es lo que era.

#### Tres trampas del propio script

- ⚠️ **`interval '${VARIABLE} weeks'` no funciona en `$queryRaw`.** El template
  etiquetado de Prisma convierte cualquier `${}` en un parámetro, así que eso
  genera `interval '$4 weeks'` y Postgres rechaza la consulta por número de
  parámetros. Las fechas se calculan en JavaScript y se pasan como parámetro.
- `projects.workspaces` y `projects.boards` **no tienen `updatedAt`**, aunque
  `projects.projects` sí. Copiar el INSERT de uno a otro falla.
- El esquema `projects` se toca con SQL crudo desde el cliente de tasks: es la
  misma conexión y la misma base, y el cliente tipado solo restringe lo tipado.

### 25.11 Resultado con historial de verdad

| Informe | Con el proyecto sembrado |
|---|---|
| Instantánea | 60 tareas · 38 cerradas · En curso 10, En revisión 12, Hecho 38 |
| Entrega | p50 **5,8 d** · p85 **11,5 d** |
| Ciclo | p50 **3,2 d** · p85 **8,7 d** |
| Predicción | 22 pendientes a 0,62/día → p50 **36 d**, p85 **45 d** |
| Flujo | 44 días de serie, cuatro bandas |
| Por persona | 5 personas con carga, cerradas, vencidas y mediana |

Los números cuadran entre sí, que es la comprobación que importa: el ciclo es
**menor** que la entrega —por definición, empieza más tarde—, el p85 es mayor que
el p50 en ambos, y 22 pendientes a 0,62/día son ~35 días, que es lo que dice la
simulación.

### 25.12 `reports-front`, la cuarta zona

> 🚫 **Zona archivada el 2026-09-03** (F1 de
> [PLAN-FUSION-ZONAS](../PLAN-FUSION-ZONAS.md)). Lo que sigue describe cómo
> estuvo construida, no lo que hay hoy: el directorio `apps/frontend/reports-front`
> ya no existe, `/reports` responde 404 y el 4104 está libre.
>
> **No se archivó la capacidad, solo la pantalla**: `reports-service` (3005) y
> las once rutas de análisis del gateway siguen sirviendo a PRAX y a
> `historialAnalisisDias`. Y queda una idea por rescatar — «cuándo acabaría un
> proyecto» fue lo único que se consideró realmente útil, y merece un sitio
> dentro de la pantalla del proyecto.

Puerto **4104**, `basePath: '/reports'`, checklist de §17.7 completo. La entrada
«Reportes» de la barra lateral deja de estar apagada después de haberlo estado
desde el principio.

**Recharts 3.10 vive solo aquí**, y esa es la ventaja de multi-zone que el
proyecto llevaba defendiendo sin cobrarla: `dashboard-front` y `projects-front`
siguen con cero dependencias más allá de `commons`, `next` y `react`. Solo la
zona que dibuja gráficos paga la librería, igual que solo el shell paga `three`.
Se verificó el peer de React —Recharts 3.x declara `^19.0.0`— antes de construir
nada encima.

⚠️ **Tailwind no llega dentro del SVG de Recharts.** Los colores van como
**valores** a `fill` y `stroke`, tomados de `commons/tokens`. Funcionan porque
son `var(--color-*)` y el SVG está dentro del documento, así que hereda las
variables; una clase de utilidad ahí no pinta nada.

Cada gráfico es una isla `'use client'` que **recibe la serie ya calculada por
props**: el `fetch` vive en la page, que es la regla del repo y además impide que
la librería se cuele en el árbol de servidor.

#### Una sola página, y el proyecto en un desplegable

> Reescrito: la primera versión tenía cuatro pestañas y una pantalla aparte para
> elegir proyecto. Se juntó todo.

Las cuatro secciones cuentan **partes de una misma historia** —cuánto trabajo
hay, cómo se mueve, cuánto tarda y qué cabe esperar—, y separadas en pestañas
comparar dos obligaba a recordar la primera mientras cargaba la segunda, que es
justo lo que un informe debería ahorrar. Van apiladas en ese orden, que es el de
la pregunta que responden.

El coste se acepta y se dice: **se piden los cinco informes en cada carga**,
también los que recorren el historial. Van en paralelo y el servicio los cachea
60 s, así que la espera es la del más lento, no la suma.

Elegir proyecto es ahora un **desplegable con el mismo gesto que el selector de
espacios** del tablero: cambiar de proyecto no cambia de pantalla, y comparar dos
dejó de ser un viaje de ida y vuelta. La ruta raíz `/reports` entra directa al
primer proyecto; solo queda pantalla propia para quien no está en ninguno.

La sección de equipo **no se pinta** sin `canViewReports`, y sus datos ni se
piden: el 403 sería esperado, y pedirlo para descartarlo es lo que evita
`permissions/me`.

#### «Cómo se lee esto», en cada gráfico

Cada sección lleva un desplegable cerrado que explica **qué mira y qué decisión
permite tomar**: qué significa que una banda engorde, por qué el p85 sirve para
prometer una fecha y la media no, por qué la tabla de personas no es una
clasificación.

Es un `<details>` nativo, no estado de React: el navegador ya da apertura con
teclado, anuncio correcto al lector de pantalla y búsqueda dentro de la página
aunque esté cerrado.

Cerrado por defecto, y esa es la decisión: la explicación no puede competir con
el gráfico ni empujarlo fuera de la pantalla, pero tampoco puede vivir en una
documentación aparte que nadie abrirá. Quien ya lo entiende no lo abre nunca;
quien no, lo tiene a un clic sin salir de la pantalla.

#### Dos decisiones de la interfaz

**`description` es obligatoria en `ChartCard`.** Un gráfico sin una frase que
diga qué mide se interpreta mal con muchísima seguridad: quien lo mira inventa la
explicación que le encaja. Hacerla opcional habría bastado para que la mitad se
quedara sin ella.

**El aviso de historial fabricado no se puede cerrar** y va arriba del todo.
Durante una demostración nadie distingue un dato medido de uno generado, y quien
lo vea se llevaría una conclusión falsa sobre gente real.

#### Los reportes son de un proyecto, y no por pereza

No hay agregado global. No es una limitación de la pantalla sino del modelo de
permisos: no existe ningún permiso comprobable sobre «todos tus proyectos a la
vez» —el mismo motivo por el que `/me/tasks` y `/me/notifications` cuelgan de
`/me`— y un agregado que cruzara proyectos mezclaría equipos que no se conocen.

#### Verificado en el navegador

| Caso | Resultado |
|---|---|
| Instantánea del proyecto sembrado | 60 tareas · 22 abiertas · 21 vencidas, barras con el color real de cada columna |
| Flujo | Cuatro bandas apiladas en el orden del tablero, 44 días |
| Tiempos | Nube de puntos con p50 5,8 d y p85 11,5 d dibujados como líneas |
| Predicción | «36 días la mitad de las veces, 45 en 85 de cada 100» |
| **Tiempos en el proyecto real** | **«Faltan 10 tareas cerradas más»** — no dibuja nada |
| Aviso de historial fabricado | Sale en el sembrado, **no** en el real |
| Pestaña «Equipo» como dueño | Visible, y `/reports/people` responde 200 |
| Pestaña «Equipo» como «Colaborador» | **No se pinta**, y la ruta responde **403** |
| A través del shell (`:4100/reports`) | 200 |

⚠️ **Los gráficos animan al entrar**, así que una captura tomada de inmediato los
enseña vacíos. Costó un rato de sospecha infundada: el DOM ya tenía las barras
con su ancho y su color correctos, solo que a mitad de la transición.

#### Una del entorno, para la próxima

`<Legend>` de Recharts 3 **ya no acepta `payload`**, así que no hay forma de
corregirle el orden. Ordenaba distinto de como apila —empezaba por la segunda
columna—, y una leyenda que no sigue el orden del gráfico hace leer mal las
bandas. Se pinta en HTML: el orden es el del tablero por construcción y hereda
los estilos del sistema.

---

## 26. El asistente: propone, y ejecuta el código que ya existe

> Sexto microservicio y un chat dentro de la pantalla de reportes. Aquí queda
> el diseño, lo que se construyó y lo que se aprendió construyéndolo; el
> contrato de las dos rutas, en
> [CONTRATO-API «Asistente»](CONTRATO-API.md#asistente-).

### 26.1 La decisión que sostiene todo lo demás

**La IA propone; ejecuta el código que ya existe.** Cuando Gemini devuelve una
llamada a función, el backend **no la ejecuta**: la devuelve como propuesta, el
frontend pinta una tarjeta y solo al pulsar «Aceptar» se llama al mismo endpoint
que usa el formulario del tablero.

Lo que se gana con eso, y es casi todo:

- **No se abre ninguna vía de escritura nueva.** Sin `canCreateTask`, aceptar
  falla igual que le fallaría a esa persona pulsando el botón a mano.
- La validación, los 400 y los 403 son los que ya estaban probados.
- Un fallo del modelo es, como mucho, una propuesta mala que alguien rechaza.

Y una segunda línea, antes de esa: **las herramientas se filtran por permisos**
antes de declarárselas al modelo. No es redundante con lo anterior — proponerle a
alguien algo que no puede hacer es enseñarle un botón que revienta al pulsarlo,
que es justo lo que existe para evitar `permissions/me`.

### 26.2 Quién hace qué

```
web-shell → /assistant   ← era reports-front (4104), archivada en F1;
                            y luego assistant-front (4107), fusionada en F2
   └─ Server Action ──► gateway :3000
                          /projects/:projectId/assistant/{quota,chat}
                          (JwtGuard + ProjectPermissionGuard, canViewProject)
                             │
                             ├─ resuelve permisos efectivos   → projects (3002)
                             ├─ pone nombre a cada userId     → credentials (3001)
                             └─► assistant-service (3006)
                                    ├─ cuota (tabla propia)
                                    ├─ briefing               → reports (3005)
                                    └─ Gemini
```

El reparto no es casual. **El gateway es el único que sabe de roles**, así que
resuelve el mapa efectivo y cruza los miembros con sus nombres, y le manda a
`assistant-service` el trabajo ya masticado; ese servicio no abre clientes hacia
media plataforma y se queda con lo suyo —la cuota y hablar con Gemini—. **El
briefing lo arma `reports-service`**, que es quien ya sabe cruzar tasks y
projects y quien tiene la caché.

⚠️ **La clave de Gemini vive en un solo `.env`**, el de assistant-service. El
gateway sigue siendo un router y nunca habla con un tercero.

Dicho en voz alta lo incómodo: quien pueda hablar por TCP con el 3006 puede pedir
un turno declarando los permisos que quiera. Es la misma superficie que ya tienen
los otros cinco servicios —está en la red interna— y por eso el modelo no ejecuta
nada: aceptar vuelve a pasar por el gateway, que sí comprueba.

### 26.3 La cuota necesita estado, y por eso hay microservicio

Un contador mensual que gobierna un coste real no puede vivir solo en Redis: un
`FLUSHALL` regalaría 500 mensajes a todo el mundo. Dos tablas, esquema
`assistant`: la suscripción (`FREE`/`PRO`) y una fila de consumo **por mes**, que
además deja el histórico.

Se consume **después de una respuesta correcta**. Si Gemini falla no se cobra:
cobrar por un error que no es del usuario es la clase de detalle que hace que la
gente deje de fiarse del contador. Contrapartida asumida: alguien podría provocar
errores para no gastar cuota, y le costaría más trabajo que el que ahorra.

**No hay pasarela de pago.** Pasar a `PRO` es un `UPDATE` a mano.

### 26.4 Lo que el modelo decide, y lo que no

**No calcula ni estima nunca.** Se le pasan los percentiles ya calculados y se le
pide que los explique y los cite; si le dejaras estimar, diría «unos tres días»
con total seguridad y sin ninguna base. Sí decide lo que un LLM hace bien: de qué
trata una tarea nueva —«es del formulario de login» → etiqueta *frontend*—, a
quién recomendar cruzando experiencia y carga, y cómo redactarlo.

Recomienda **por experiencia y carga, nunca por velocidad**: «ha cerrado 3 de
frontend y ahora tiene 5 abiertas» es un hecho sobre qué ha hecho alguien; «es
más rápido» es un juicio hecho por un sistema que no sabe de dificultad. Es la
misma línea que ya trazó la tabla de personas (§25.7).

⚠️ **El bloque `personas` del briefing solo viaja con `canViewReports`**, y se
filtra al armar el contexto, no en el prompt: pedirle al modelo que no cuente
algo que tiene delante no es un control de acceso.

### 26.5 Dos cosas que solo se ven al probarlo con el modelo de verdad

**Una propuesta llegaba muda.** Con function calling lo normal es que el modelo
devuelva la llamada y ni una palabra, así que la tarjeta aparecía sin decir por
qué esa etiqueta ni por qué esa persona — justo lo que la recomendación tenía que
aportar. Pedirlo por prompt no bastó. `porQue` es hoy **parámetro obligatorio de
las dos herramientas**: la tarjeta enseña QUÉ se va a crear y ese campo dice POR
QUÉ. Cuando Gemini no manda texto, la respuesta se compone con esas razones.

**Sin herramientas, el asistente se callaba.** A un rol de solo lectura no se le
declara ninguna, y al pedirle «crea una tarea» no llamaba a nada ni escribía
nada: salía el texto por defecto, «No he sabido responder a eso», que suena a
fallo del asistente cuando es una cuestión de permisos. La instrucción de sistema
lleva ahora la lista de herramientas de esa conversación, en palabras, y la regla
de decirlo en una frase y seguir con lo que sí pueda responder.

### 26.6 El chat, en la propia pantalla de reportes

Está ahí y no en una pantalla aparte porque **lee exactamente lo que se está
viendo**. Isla cliente, el turno es una Server Action, y:

- **Sin streaming.** Gemini lo soporta, pero atravesar SSE por una Server Action
  complica el bucle entero y estas respuestas son cortas.
- **Contador visible** —«6 / 50 este mes»— con el número que manda el backend en
  cada respuesta, nunca una cuenta local.
- **Al agotar la cuota**, el compositor desaparece y queda el aviso con la fecha
  de reinicio. Un límite sin fecha es un muro.
- **El hilo vive en el estado del componente** y se reenvía recortado a 12
  turnos: no hay tabla de conversaciones. Recargar la página borra la
  conversación, y no se guarda en `localStorage` a propósito.
- **Las tarjetas no desaparecen al pulsar.** Quedan como «aceptada», con el
  enlace a la tarea, o como «descartada». En un hilo, algo que se borra al
  pulsarlo deja la conversación hablando de algo que ya no está.

Dos cosas se resuelven en la Server Action y no en el chat, porque la propuesta ha
pasado por el navegador: **el tablero**, que la propuesta no trae y se busca por
el `columnId` en el proyecto de verdad, y **`status`**, que se toma del nombre de
la columna encontrada y no de lo que diga el modelo.

⚠️ **Ninguna acción del asistente llama a `revalidatePath`.** Lo que cambia al
aceptar está en otra zona, que no comparte caché con esta; revalidar aquí solo
volvería a renderizar los cinco informes para no cambiar un píxel de lo que se
está viendo (§24, la trampa del autoguardado).

Efecto lateral del chat sobre la página: **los miembros y el directorio ya no
dependen de `canViewReports`**. La tabla de personas sigue siendo suya, pero
poner nombre a un `userId` en una propuesta no exige ver el desglose, y las dos
rutas piden solo `canViewProject`.

### 26.7 Verificado contra el stack

| Caso | Resultado |
|---|---|
| `GET .../assistant/quota` | `{ plan: FREE, usados: 3, limite: 50, periodo: 2026-07, reinicia: 2026-08-01 }` |
| «¿Cómo va y para cuándo?» | Cita 44 d (p50) y 56 d (p85) — **los mismos que `/reports/forecast`** |
| Historial fabricado | El modelo lo avisa **sin que se lo pidan en la pregunta** |
| «Arregla el formulario de login» | Propone tarea, deduce etiqueta *frontend*, recomienda con el hecho detrás |
| **Proponer no crea** | Tras la propuesta, `SELECT` en `tasks.tasks` → **0 filas** |
| Aceptar sí crea | 1 fila, `status = 'Por hacer'` = nombre de la columna, prioridad, encargado y etiqueta correctos |
| El informe lo recoge | La instantánea pasa de 60 a 61 tareas |
| Cuota agotada (`used = 50`) | 429 con la cuota en `details`; la pantalla pinta «50 / 50» y «Vuelven el 1 de agosto» |
| Plan `PRO` | `limite` pasa a 500 sin tocar nada más |
| **Rol sin `canCreateTask`** | `proposals: []` y el asistente **explica que esa persona no puede**; antes del arreglo de §26.5 respondía «No he sabido responder a eso» |

Cuenta de prueba creada para el caso de permisos, con rol «Colaborador de
prueba» (`canViewProject` + `canViewReports`, sin `canCreateTask`):
`colab-asistente@praxis.dev` / `Colab@12345!`.

### 26.8 Segunda pasada: las preguntas que no tenían dato detrás

Probándolo de verdad salieron tres respuestas malas, y ninguna era del modelo:

| Se preguntaba | Respondía | Por qué |
|---|---|---|
| «¿Qué porcentaje de avance?» | «No hay un porcentaje literal en el reporte» | La regla 1 decía «nunca calcules», a secas |
| «¿Cómo estuvo la semana?» | «No existen datos sobre la semana» | Cierto: el flujo acumulado no contesta a eso |
| «¿Hay tareas bloqueadas?» | «No hay datos sobre eso» | Cierto también: no existía la consulta |

**La regla 1 estaba mal escrita, no de más.** La prohibición que importa no es la
aritmética —restar dos cifras que tiene delante lo hace bien— sino **inventar el
dato de partida**: estimar cuánto tardará algo, deducir una fecha, suponer un
ritmo que nadie ha medido. Eso sigue prohibido; sumar, restar y sacar un
porcentaje de lo que está en el contexto, ya no.

Aun así, **las divisiones que se acaban repitiendo en una reunión vienen
calculadas del servidor**. Un porcentaje mal contado sobre el trabajo de un
equipo se repite antes de que a nadie se le ocurra comprobarlo, y el mismo
argumento que impide dejarle estimar duraciones vale para no jugársela a que hoy
divida bien.

Y una que faltaba desde el principio: **la fecha de hoy**. El modelo no la tiene
por su cuenta, así que no entendía «esta semana» ni podía convertir «para el
viernes» en un `dueDate`.

#### `avance`, dos medidas porque miden cosas distintas

`porCierre` cuenta lo que está en columna verde —lo que se ve mirando el tablero,
y funciona desde el primer día—; `porCompletado` cuenta lo que tiene
`completedAt`, que **solo existe desde que hay historial**. En un proyecto
anterior a la captura la segunda sale más baja, y no porque se haya avanzado
menos. Con cero tareas las dos son `null`, no `0`: un tablero vacío no está al
0 % de nada.

#### `weekly`, y por qué lleva la semana anterior pegada

Un total suelto —«5 cerradas»— no dice si la semana estuvo bien. La comparación
es el informe entero.

⚠️ **La semana en curso está a medias**, así que compararla contra siete días
completos sale catastrófico un lunes por la mañana. Viajan
`semana.diasTranscurridos` y el ritmo diario de las dos, y el prompt obliga a
decirlo cuando la semana no ha terminado.

#### `blocked`: no hay estado «bloqueada», hay historial

El modelo de datos no tiene esa marca y no se inventó una. Son las abiertas que
llevan `days` (7 por defecto) sin cambiar de columna, sacado del último
`CREATED`/`MOVED`.

⚠️ **No vale `updatedAt`**: lo pisa cualquier `PATCH` —el título, una etiqueta— y
también la cascada que reescribe el `status` al renombrar una columna. Una tarea
parada un mes parecería recién tocada. Es el mismo motivo por el que el historial
guarda `columnId` y no `status` (§25.2).

Las anteriores a la captura salen con `sinHistorial: true`, porque ahí lo que se
cuenta es su **edad**, no su parón. Acusar de parada a una tarea que solo es vieja
es la clase de error que le quita la confianza al informe entero.

#### Con esto, la skill de voz tiene de dónde tirar

Las ocho respuestas del guion de la skill —que vivirá en su propio
microservicio— ya tienen endpoint detrás:

| Pregunta de la skill | De dónde sale |
|---|---|
| Avance del proyecto | `avance` del briefing / `reports/snapshot` |
| Productividad semanal | **`reports/weekly`** |
| Estimación de entrega | `reports/forecast` |
| Tareas bloqueadas | **`reports/blocked`** |
| Carga de trabajo | `reports/people` |
| Desempeño individual | `reports/people` + experiencia por etiqueta |

Verificado sobre el proyecto de demostración: «56 % (35 de 62)»; «la semana va
por la mitad, 4 días: 1 cerrada y 2 creadas, ritmo 0,25/día frente a 0,43 la
anterior»; «20 tareas con más de 7 días sin movimiento», con las cinco más
paradas y su columna.

### 26.9 Una del entorno, para la próxima

`tasks-service` no arrancaba: `Cannot find module '../generated/prisma-client'`.
No es del código — el cliente de Prisma se genera dentro de `src/generated/` y no
está versionado, así que un árbol recién clonado o limpiado lo necesita:

```bash
pnpm --filter @praxis/tasks-service exec prisma generate
```

Encaja con la trampa de siempre: **si un servicio parece caído, compruébalo antes
de buscar el fallo en el código.** Los otros cinco arrancaron sin problema y el
síntoma fue «el tablero da 500 y los reportes van bien».

---

## 27. Tema claro, facturación en Configuración y retoques del asistente

> Cuarta pasada sobre Configuración. Tres piezas independientes que cayeron
> juntas por compartir pantalla: el tema claro (con su selector), la sección
> de facturación del asistente, y un repaso del chat de Reportes que ya tenía
> dueño desde §26.

### 27.1 `GET /me/assistant/quota` — la cuota sin proyecto

`GET /projects/:projectId/assistant/quota` (§26) sigue existiendo y sigue
colgando de un proyecto solo porque `ProjectPermissionGuard` necesita algo
contra qué resolver `canViewProject`. Pero Configuración no tiene ningún
proyecto abierto, y la cuota es del usuario, no del proyecto — así que se
añadió un segundo controlador, `MyAssistantController`
(`apps/backend/gateway/src/assistant/my-assistant.controller.ts`), con
`@Controller('me/assistant')` y solo `JwtGuard` (sin `ProjectPermissionGuard`,
sin `projectId` en la ruta). Reenvía al mismo `{ cmd: 'assistant_quota' }` de
siempre; assistant-service no distingue de dónde vino la petición. Mismo
patrón que `/me/tasks` y `/me/notifications`.

Verificado con curl contra el stack: `GET /api/me/assistant/quota` con
Bearer token da `{ plan, usados, limite, periodo, reinicia }`; sin token, 401.

### 27.2 El tema claro — redefinir variables, no duplicar componentes

El grueso fue exactamente lo que se esperaba: **redefinir las variables**, no
tocar componentes. `commons/styles/theme.css` gana un segundo bloque,
`:root[data-theme='light'] { … }`, con las mismas variables del `@theme`
oscuro y otro valor — no vive dentro de `@theme` porque ese bloque es la
sintaxis de Tailwind v4 para *declarar* tokens y generar utilidades, no para
condicionarlos. Al ser un selector con más especificidad que el `:root` que
`@theme` emite, gana sin que Tailwind tenga que regenerar nada.

`--color-overlay` **no cambia entre temas**: en todo el código se usa como
sombra (`boxShadow`) o como scrim de modal/drawer (`Dialog`, `AppShell`), nunca
como superficie de página, así que se queda oscuro en los dos temas —
oscurecer un poco por encima de algo claro sigue leyendo como sombra.
`success/warning/error/info` sí se oscurecen un punto en claro: el mismo tono
pastel que se lee bien sobre `#0D0F14` pierde casi todo el contraste sobre
blanco.

#### La cookie, y por qué el layout y no `localStorage`

`commons/theme/` (nuevo, mismo patrón de módulo de servidor que
`commons/auth/`: no se re-exporta desde el índice raíz, se importa por
`@praxis/commons/theme`) declara la cookie `praxis_theme` y `getTheme()`, que
la lee con `next/headers`. Cada zona la llama en su `layout.tsx` — que pasó a
ser `async` — y estampa `data-theme` en el `<html>`:

```tsx
const theme = await getTheme();
<html lang="es" data-theme={theme} ...>
```

Es la única forma de que no haya parpadeo: las cinco zonas son apps Next
independientes servidas por el mismo origen (el del shell), así que la
elección tiene que resolverse **en el servidor, antes del primer byte**, en
cada una. `localStorage` habría dejado un fogonazo del tema por defecto en
cada salto de zona, que aquí es un salto de página completo (§16).

#### 🟡 El landing del shell se queda oscuro siempre, a propósito

Primer intento: que `web-shell/layout.tsx` leyera la cookie igual que las
otras cuatro. Roto en cuanto se probó: el landing público hereda
`data-theme="light"` y sus organismos —`LandingHero`, `LandingCTA`,
`LandingFeatures`, `LandingHowItWorks`, `PublicNavbar`, `AsciiBackground`,
`EchoDot3D`, siete archivos con colores incrustados que se dejaron fuera de
esta pasada— siguen pintando texto gris claro pensado para fondo `#0D0F14`.
Sobre blanco, la mitad del hero desaparece.

El shell **no sirve páginas de negocio** (CLAUDE.md): lo único que hay detrás
de esa cookie es el landing público, que no necesita el selector porque no
tiene una pantalla de Configuración propia. Se revirtió a `data-theme="dark"`
fijo en `web-shell/layout.tsx`. El selector de las cuatro zonas privadas sigue
afectando a las cuatro — el shell es la única que no participa, y es la única
sin razón para hacerlo.

#### Colores incrustados que sí importaban

`Badge`, `FeatureCard` y `AuthForm` tenían `rgba(255,255,255,…)` y hex fijos
que asumían fondo oscuro — el resto de los diez archivos con color literal son
del landing (excluidos, ver arriba). Los tres se migraron a `colors`/`alpha()`
de `commons/tokens`:

- `Badge`: la variante `default` usaba blanco al 6-8%, invisible sobre blanco.
  Sale de `colors.textSecondary`, que ya es gris en los dos temas.
- `FeatureCard`: `background`/`border` en hex fijo (`#171722`/`#131319`) pasan a
  `colors.surfaceElevated`/`colors.surface` — el mismo par que ya usa para
  «elevado sobre superficie» en el resto del sistema. Las sombras en
  `rgba(0,0,0,…)` pasan a `alpha(colors.overlay, …)`, y las concatenaciones
  `${card.accent}45` (el bug que `colors.ts` ya advertía: solo funciona con hex
  de 6 dígitos) pasan a `alpha(card.accent, 45)`.
- `AuthForm`: un único `boxShadow: rgba(0,0,0,0.4)` pasa a `alpha(colors.overlay, 40)`.

Se tocó porque `FeatureCard` es la que arma las tarjetas de Facturación (§27.3
la reutiliza en espíritu, no en componente — ver ahí por qué se descartó
reusarla literalmente) y porque es una molécula de `commons`, no del landing:
aunque hoy solo la invoque `LandingFeatures`, cruza la cookie compartida igual
que cualquier otra zona si algún día se usa fuera del shell.

### 27.3 Facturación en Configuración — sin botón que mienta

`GET /me/assistant/quota` ya daba `{ plan, usados, limite, periodo, reinicia }`
del usuario; faltaba enseñarlo. `BillingSummary`
(`dashboard-front/src/components/organisms/BillingSummary`) pinta dos
tarjetas: la del plan actual, con los números reales y una barra de progreso
`usados/limite`, y la del otro plan, en palabras.

**El otro plan no lleva cifra.** `ASSISTANT_LIMITS` (`FREE: 50, PRO: 500`) vive
en `@praxis/contracts`, del lado del backend, y copiarlo a mano en el
frontend es exactamente el error que `reports-front/src/lib/assistant.ts` ya
había evitado: un segundo sitio donde apuntar «500» es un segundo sitio donde
discrepar el día que cambie. Si hoy eres FREE, la tarjeta de PRO dice «más
conversaciones al mes» sin número; el día que PRO sea tu plan, sus cifras
reales llegan por la misma cuota.

**No hay botón de compra.** El brief es explícito: pasar a PRO es hoy un
`UPDATE` a mano en `assistant.assistant_subscriptions`, no hay pasarela de
pago. El botón del plan que no es el tuyo queda deshabilitado, con «Aún no
disponible» — nunca un enlace a un checkout que no existe.

Se descartó reusar `FeatureCard` para las dos tarjetas: está pensada para una
escena visual animada por hover (`visual(active) => ReactNode`) que aquí no
pinta nada, y forzar un `visual` vacío solo para heredar el borde y el fondo
habría sido más código que escribir las dos tarjetas a mano.

Si `GET /me/assistant/quota` falla (assistant-service caído),
`BillingSummary` recibe `quota: null` y enseña un aviso en vez de tumbar toda
Configuración — mismo criterio que `loadCurrentUser` con los roles (§17.1).

### 27.4 La pantalla, con el acabado que pedía crecer a tres secciones

> **Superado por §38.** `SettingsSection` y la pila de franjas separadas por
> reglas horizontales ya no existen: las tres secciones son hoy tarjetas
> (`PanelCard`) repartidas en una rejilla. El componente se borró al quedarse
> sin usos.

`SettingsSection` (§24.2) ya estaba pensada para esto: «Tus datos» pasa a
convivir con «Apariencia» (el selector, §27.2) y «Facturación» (§27.3). Lo que
faltaba con una sola sección y no se notaba: una línea que separe dónde acaba
una y empieza la siguiente. Va en el `<div>` que envuelve la pila, no dentro
de `SettingsSection` — con `[&>section:not(:first-child)]:border-t`, para que
el componente no tenga que saber si es el primero.

`ThemeToggle` (`dashboard-front/src/components/molecules/ThemeToggle`) es el
selector: dos botones, estado optimista local y `setThemeAction` —server
action en `configuracion/actions.ts`— que escribe la cookie y llama a
`revalidatePath('/', 'layout')`. El segundo argumento importa: el `data-theme`
lo pinta el `RootLayout`, que envuelve toda la zona, no la page — sin
`'layout'`, `revalidatePath` solo invalida ese segmento y el `<html>` se queda
con el tema viejo hasta la próxima navegación completa.

`ThemeToggle` no importa `ThemeName` de `@praxis/commons/theme`: ese módulo es
de servidor (`next/headers`) y la copia local del tipo (`'dark' | 'light'`) es
más barata que arriesgarse a que un import se cuele en el bundle del
navegador, aunque fuera solo por el tipo.

#### Verificado en navegador, cinco zonas × dos temas

| Caso | Resultado |
|---|---|
| Cambiar a Claro en Configuración | Las tres secciones repintan al instante, sin recargar |
| Navegar a Reportes tras el cambio | Ya llega en claro, **cero parpadeo** — el servidor lo resolvió antes del primer byte |
| Proyectos, tablero con etiquetas y avatares | Legible en claro; el borrador de sombra de `BoardStrip` (`alpha(colors.overlay,…)`) se sigue viendo como viñeta, no como mancha |
| `auth/login` en claro | Tarjeta blanca, sombra de `AuthForm` correcta |
| Landing pública (`web-shell`) tras elegir Claro | Se queda oscura — es la exclusión de §27.2, no un fallo |
| Volver a Oscuro | Idéntico al diseño previo a esta pasada, en las cinco zonas |

### 27.5 El chat de Reportes, con lo que le pedían

Sobre `AssistantChat` (§26.6), cuatro retoques de interfaz, sin tocar el flujo:

- **Badge «AI Powered»** junto al título, con `Sparkle` a 9px — mismo átomo que
  ya existía, sin escribir un icono nuevo.
- **Disclaimer** bajo el compositor, texto pequeño y siempre visible mientras
  se puede escribir: «El asistente puede equivocarse. Revisa cada propuesta
  antes de aceptarla.» Encaja con lo que la pantalla ya hacía —el aviso de
  historial fabricado (§26.8) y que nada se ejecuta sin aceptar (§26.1)— y lo
  dice en el sitio donde se escribe, no solo donde se lee.
- **Carga**: «Leyendo el informe…» tenía razón en el texto pero era plano.
  Ahora lleva `Sparkle` girando con el mismo `sparkle-spin` de
  `SectionHeader`, a 0.9 s en vez de los 4 s decorativos — aquí tiene que leerse
  como actividad, no como adorno.
- **Botón «Preguntar» a la altura del campo**: con dos filas, el botón por
  defecto (`size="md"`, 40px) quedaba anclado abajo por `items-end`, con un
  hueco encima. Pasa a `items-stretch` en el contenedor y `style={{ height:
  '100%' }}` en el botón — **no** una clase `h-full`: compite con el `h-10` de
  `sizeClasses.md` en la misma especificidad, y quién gana depende del orden
  en que Tailwind generó el CSS, no del orden en el `className`. Un `style` en
  línea no tiene esa ambigüedad.

Probado contra Gemini de verdad: pregunta real, cuota sube de 10 a 11,
respuesta con avance/semana/predicción citando los mismos números que el
informe — mismo comportamiento que documentó §26.7, con la interfaz nueva
encima.

### 27.6 Segunda pasada: un bug real y cuatro retoques

Probando el tema claro en el tablero de verdad salió un bug que no era del
tema — llevaba ahí desde antes, y el tema claro solo lo hizo evidente.

#### 🔴 `@theme` (a secas) recortaba tokens sin clase literal

El punto «Azul» del selector de color de columna (`ColumnMenu`) se veía
transparente — el botón existía, el tooltip funcionaba, pero el círculo no
tenía color. Mismo síntoma en cualquier gráfica que citara `colors.info`.

Causa: Tailwind v4 con `@theme` (a secas) solo emite la **variable CSS** de un
token cuando detecta una clase de utilidad literal que la use (`text-info`,
`bg-error-muted`…). `colors.info` se consume siempre vía `style={{ background:
colors.info }}` — que es precisamente para lo que existe
`commons/tokens/colors.ts` — así que ningún archivo tiene jamás la cadena
`text-info` o `bg-info`, y Tailwind nunca generaba `--color-info` en el CSS
final. Confirmado comparando con grep: `bg-error-muted` aparece 3 veces como
clase (sobrevive), `bg-info`/`bg-info-muted` cero veces (no sobrevivían) —
tampoco `--color-success-muted` ni `--color-warning-muted`, por el mismo
motivo.

Se reprodujo igual tras matar los procesos de `next dev` y borrar `.next` de
las cinco zonas: no era caché de Turbopack, era el CSS que Tailwind genera de
verdad desde el código fuente.

**Arreglo:** `@theme static` en vez de `@theme`. Fuerza a Tailwind a emitir
todas las variables del bloque siempre, las use un `className` o no — que es
lo que necesita cualquier token pensado para consumirse solo desde
`commons/tokens/colors.ts`.

#### La sombra del lienzo, negra también en tema claro

`BoardStrip` (projects-front) pinta el tablero con una sombra `inset` que
usaba `colors.overlay`. `overlay` se queda oscuro a propósito en los dos
temas — es el scrim de modales y drawers (§27.2) — pero aquí no es un scrim,
es la superficie del lienzo, y un hundido oscuro sobre un lienzo que en claro
ya es blanco se leía como suciedad en los bordes, no como profundidad.

Token nuevo, `--color-canvas-shadow`, que sí invierte por tema (oscuro en
oscuro, blanco en claro) y que solo usa `BoardStrip`; las demás sombras de
`overlay` (menús, `Dialog`, `AppShell`) se quedan igual porque ahí sí es un
scrim.

#### Cuatro retoques de interfaz

- **Tus datos**: Nombre y Apellido pasan de apilados a una fila de dos
  columnas — apilados dejaban la card angosta pegada a la izquierda por más
  `max-w` que se le diera a dos campos tan cortos.
- **`ThemeToggle`**: de dos botones con la palabra completa a un switch de
  dos círculos de 32px con iconos de sol y luna y una marca deslizante detrás.
- **Badge «AI Powered»**: de wash translúcido y píldora a mayúsculas fijas,
  relleno sólido del color de acento y esquinas casi rectas. Tras verlo
  montado se dio marcha atrás en el relleno y en el texto: ver §27.7.
- **Loader del chat**: «Leyendo el informe…» con una estrella girando era un
  adorno; pasa a «Pensando…» con tres `Sparkle` de distinto tamaño y su propio
  `animation-delay` (`sparkle-drift`, en `theme.css`) que titilan por turnos
  sin sincronizarse.

Verificado contra Gemini con la clave nueva: 429 de la cuenta —cuota propia
del key, no la cuota mensual de la app, que se quedó igual— y, tras esperar,
respuesta correcta con la cuota de la app subiendo de 11 a 12.

### 27.7 El badge del asistente, en su forma final

El relleno sólido de §27.6 duró lo que tardó en verse junto al título. El
badge está al lado de un `<h3>` de 20px, y un bloque macizo del color de
acento competía con él por la atención: lo primero que leía el ojo al entrar
en la tarjeta era la etiqueta, no el encabezado. Queda:

```tsx
background: alpha(colors.accent, 15),
border: `1px solid ${alpha(colors.accent, 40)}`,
color: colors.accent,
```

Wash del acento al 15% con borde al 40% y el texto en el propio acento —el
mismo patrón que ya usan el aviso de historial fabricado (`colors.warning` al
8/30, §26.8) y la burbuja de los mensajes propios (`colors.primary` al 14) en
este mismo archivo, así que no inventa una forma nueva. Se mantienen de
§27.6 las mayúsculas, el `fontWeight: 700` y el `borderRadius: 4`: lo que
sobraba era la masa de color, no la geometría.

El texto pasa de «AI Powered» a **«AI»**. Con el relleno sólido, «AI Powered»
llenaba la píldora y se leía como un sello; en wash translúcido la etiqueta ya
no reclama espacio, y la palabra larga solo empujaba el `<h3>` hacia el salto
de línea en anchos intermedios. La promesa que hacía «Powered» la dice mejor
el párrafo que va justo debajo, que además es cierto y concreto: «Lee este
mismo informe y responde con sus números».

Los tokens implicados son `--color-accent` y su uso vía `alpha()`, no clases
de utilidad — o sea, exactamente el caso que §27.6 documenta: si `theme.css`
volviera a `@theme` sin `static`, este badge se quedaría sin color y sin borde
en silencio.

## 28. La tarjeta del tablero: menos color, y el tuyo destacado

> Dos cambios sobre `TaskCard` que van en la misma dirección —quitarle color al
> tablero para que el poco que quede signifique algo— y una decisión de
> permisos que se estudió y se descartó.

### 28.1 Tu inicial, roja y la primera

Los encargados se pintan como círculos con iniciales, todos con el mismo
`alpha(colors.primary, 30)`. Buscar lo tuyo en un tablero lleno era leer hasta
cuatro iniciales por tarjeta y compararlas con las tuyas, tarjeta por tarjeta.

La tuya pasa a `colors.error` sólido con `colors.textInverse` encima. El par se
invierte solo entre temas y por eso no hace falta condicionarlo: en oscuro
`--color-error` es `#f87171` (rojo claro) con texto `#0d0f14`, y en claro es
`#dc2626` (rojo fuerte) con texto `#ffffff`. En los dos casos el contraste sale
del propio token.

Es el **único color de la tarjeta que no describe la tarea sino a quien la
mira**, y por eso puede permitirse ser el más fuerte de los que quedan tras
§28.2.

#### 🟡 Comparte rojo con «Urgente» y «Venció»

`colors.error` ya es el color de la prioridad urgente y del chip de vencida.
Se aceptó la colisión: son chips de texto en la fila de metadatos y esto es un
círculo con iniciales en la fila de abajo, así que no compiten en el mismo
sitio ni con la misma forma. Si algún día chirría, el cambio es una línea.

#### Dos detalles que no son cosméticos

- **El reordenado va antes del `slice(0, 4)`.** La tarjeta solo pinta cuatro
  círculos y un `+N`. Ordenar después de cortar te dejaría fuera con cinco
  encargados y tú de quinto — justo el caso en que más falta hace verte.
  `mineFirst()` devuelve el array original si no estás en él, para no crear uno
  nuevo en cada render de cada tarjeta ajena, que en un tablero lleno son casi
  todas.
- **`relative z-10` en el círculo propio.** Con `-space-x-1.5` los círculos se
  solapan y el que va después en el DOM tapa al anterior. Ir primero no bastaba
  para verse entero: hay que subirlo de capa.

`currentUserId` ya llegaba hasta `ColumnTasks`; solo bajó un nivel. No decide
nada sobre lo que se puede tocar — eso sigue siendo cosa de los permisos.

### 28.2 Fuera el punto de prioridad

A la izquierda del título había un punto de 6px coloreado por prioridad. El
diagnóstico del que salió el cambio —«un arcoíris de confusión»— se queda
corto en el motivo: el punto no marcaba las urgentes, porque **toda** tarea
tiene prioridad. Pintaba las cuatro familias a la vez, así que una columna
llena era una columna de puntos de colores sin jerarquía entre ellos.

No se pierde el dato: la prioridad sigue en su `Chip` de la fila de metadatos,
escrita con palabras y con el mismo color. La diferencia es que ahí se lee
cuando la buscas, en vez de reclamar atención siempre.

### 28.3 Reportes tras un permiso: estudiado y descartado

Se planteó si `/reports` y su entrada del sidebar deberían colgar de un permiso
del proyecto, con acceso automático para el dueño y asignable a un
administrador o a un scrum master.

**El permiso ya existe y ya es asignable.** Es `canViewReports`, sale en el
administrador de roles como «Ver los reportes por persona», y lo implican
`canManageMembers`, `canEditProject` y `canDeleteProject` — o sea que el rol
«Administrador» con el que nace todo proyecto lo tiene, y el dueño está dentro
desde el primer momento.

Lo que no hace es esconder la página ni la entrada del sidebar, y ahí hay un
obstáculo estructural:

> **El sidebar es global; los permisos son por proyecto.** `APP_NAV_ITEMS`
> (`commons/organisms/AppLayout/navigation.tsx`) es una lista canónica que
> cruza las cuatro zonas privadas. Un usuario puede ser administrador en un
> proyecto y colaborador raso en otro, así que «¿enseño Reportes?» no tiene
> respuesta correcta sin preguntar por cuál. Resolverlo obligaría a pedir los
> permisos de todos tus proyectos en cada render de cada zona.

Por eso la línea está trazada **dentro** de la página, con el criterio que ya
documenta el enum: los agregados que no nombran a nadie —flujo, tiempos de
ciclo, reparto por prioridad, predicción— piden solo `canViewProject`; el
desglose **por persona** pide `canViewReports`, porque un tablero con las
cifras de todo el mundo a la vista se vuelve una clasificación aunque nadie lo
pretenda.

Se ofrecieron dos alternativas y se rechazaron las dos:

| Alternativa | Por qué no |
|---|---|
| `canViewReports` cierra el informe entero | El sidebar seguiría siempre visible igualmente (es global), así que se ganaría poco y se perdería el acceso de un colaborador a datos que no son de nadie |
| Permiso nuevo `canViewProjectReports` para el acceso, `canViewReports` para la privacidad | Más preciso, pero son dos permisos para una sola pantalla en el administrador de roles: más modelo del que el producto necesita |

**Decisión: se queda como está.** Cero código nuevo — lo que se pedía ya se
puede repartir hoy desde el administrador de roles.

> ⚠️ **Esto duró una conversación.** Ver §29: con el caso de uso concreto
> delante —un perfil cuyo trabajo es concretar y mover tareas— la decisión se
> revirtió y `canViewReports` pasó a cerrar la página entera. Lo que sigue
> siendo cierto de §28.3 es el obstáculo estructural del sidebar; lo que
> cambió es la línea de dentro de la página.

## 29. Reportes, cerrados de verdad

> Vuelta sobre §28.3 con el caso de uso que faltaba: «si mi usuario es
> trabajador y su única razón en la plataforma es concretar y ver tareas, no
> necesito que vea los análisis de datos ni pregunte a la IA».

Eso no lo resolvía el permiso tal y como estaba. `canViewReports` solo tapaba
la tabla de personas; los cuatro agregados y el chat del asistente los veía
cualquier miembro. Y filtrar únicamente el desplegable habría sido cosmética:
la página seguía alcanzable escribiendo `/reports/<id>` a mano.

### 29.1 El permiso pasa a ser la puerta

Las **siete** rutas de `projects/:projectId/reports` y las **dos** de
`projects/:projectId/assistant` piden ahora `CAN_VIEW_REPORTS`. Antes seis y
dos de ellas pedían `CAN_VIEW_PROJECT`.

El asistente entra en el mismo saco porque **lee este mismo informe**: dejarlo
abierto habría sido una puerta trasera al contenido que la pantalla ya no
enseña. Con el chat cerrado, `incluirPersonas` —la bandera con la que el
gateway le decía a reports-service si meter el bloque de personas en el
briefing— es siempre cierta para quien llega. Se deja donde está, como defensa
en profundidad: el día que alguien abra otra ruta al asistente, la línea sigue
puesta.

`GET /me/assistant/quota` **no cambia**: es la cuota del usuario, no de ningún
proyecto, y es lo que lee Facturación en Configuración (§27.3). Un trabajador
sin reportes en ningún proyecto sigue viendo su plan y su consumo.

#### 🔴 Es un cierre, no una ampliación

Un miembro con `canViewProject` que ayer recibía `snapshot` hoy recibe **403**.
No hay migración que lo evite y no debería haberla: es exactamente el cambio
que se pidió. Los roles «Administrador» no notan nada —`canViewReports` entra
implicado por `canManageMembers`, `canEditProject` y `canDeleteProject`— y el
dueño tiene bypass en el guard.

#### Y la distinción interna desaparece

Con la página cerrada, quien entra tiene `canViewReports` por definición, así
que el condicional que escondía la tabla de personas era código muerto. Se
quita: un permiso con un solo significado —«puedes ver los reportes de este
proyecto»— en vez de uno que significaba dos cosas a la vez según dónde se
mirase.

Se pierde algo real y conviene decirlo: ya no se puede representar «ve el
estado del proyecto pero no las cifras de cada cual». Si ese perfil vuelve a
hacer falta, la forma de recuperarlo es un permiso nuevo para el acceso, no
desdoblar otra vez este — que es la alternativa que §28.3 ya había descrito.

### 29.2 `GET /projects?permission=<clave>`

El selector tiene que ofrecer solo los proyectos cuyo informe se puede abrir.
Con lo que había, la única forma era pedir `/projects/:id/permissions/me` **una
vez por proyecto** desde el cliente: N peticiones por carga para descartar casi
todas.

`FindProjectsQueryDto` gana un `permission` validado contra `ProjectPermission`
—cualquier otra clave da 400— y `findAllProjects` lo aplica **al `where`**:

```ts
const memberScope = dto.permission
  ? { id: { in: await this.projectIdsWithPermission(dto.userId, dto.permission) } }
  : { members: { some: { userId: dto.userId } } };

where.OR = [{ ownerId: dto.userId }, memberScope];
```

Al `where` y no al resultado, para que `total` y la paginación sigan contando
lo que de verdad se puede ver: filtrar después de paginar devolvería páginas de
tamaño irregular y un total que miente.

`projectIdsWithPermission` es **una sola consulta** para todos los proyectos
del usuario —sus filas de `projectMember` con el rol embebido— y expande la
jerarquía en memoria. El dueño pasa siempre, igual que en el guard.

#### La jerarquía sale a `permission-map.ts`

Vivía dentro de `ProjectRolesService`, su único consumidor hasta ahora.
Duplicarla en `ProjectsService` era el error clásico de este repo —el segundo
sitio donde discrepar el día que alguien añade un permiso— así que se extrajo a
`project-roles/permission-map.ts`: `PERMISSION_HIERARCHY`, `VIEW_PERMISSION`,
`fullPermissionMap`, `normalizeBooleans`, `normalizePermissions` y
`expandPermissions`, que deja de ser método privado. No es un provider de Nest
a propósito: son funciones puras sobre un objeto.

#### 🟡 No pasa por la caché de permisos

`project:<id>:user:<id>:permissions` tiene TTL de 300 s y es **por proyecto**:
leer N claves de Redis para ahorrarse una consulta a Postgres no compensa. El
efecto lateral es que el listado ve un cambio de rol al instante mientras
`permissions/me` puede tardar hasta cinco minutos. Va en la dirección segura —
el selector deja de ofrecer un proyecto antes de que la página deje de
abrirlo — pero es una inconsistencia real y está aquí escrita.

### 29.3 `NoReportsAccess`, y por qué no es un 404

Dos sitios la enseñan: `/reports` cuando no hay ningún proyecto que puedas
mirar, y `/reports/<id>` cuando escribes a mano uno que no puedes.

No es un 404 —la página existe— ni un rebote silencioso al panel, que se lee
como un enlace roto. **La entrada «Reportes» del sidebar sigue visible para
todo el mundo**, porque el obstáculo de §28.3 no se ha movido: la barra es
global y el permiso es por proyecto. Si la entrada no se puede esconder, la
pantalla del otro lado tiene que explicarse sola, y decir **a quién pedirlo**,
que es lo único accionable.

La raíz de la zona distingue dos casos que se confundían en uno:

| Situación | Qué se enseña |
|---|---|
| No estás en ningún proyecto | «Todavía no estás en ningún proyecto» (el estado que ya existía) |
| Estás en proyectos, en ninguno con reportes | «Ningún proyecto tuyo tiene los reportes abiertos para ti» |

La segunda consulta (`?limit=1`, de la que solo se mira el `total`) se hace
**solo** en ese caso, que es el raro. Sin ella, a quien lo que necesita es que
le añadan a un proyecto se le mandaría a pedir un permiso.

La página del informe comprueba `canViewReports` aunque el gateway ya lo exija:
sin la comprobación, el `Promise.all` caería en cascada a `null` y la pantalla
enseñaría cinco tarjetas rotas en vez de decir qué pasa. **El guard es la
seguridad; esto es la explicación.**

La etiqueta del administrador de roles pasa de «Ver los reportes por persona» a
«Ver los reportes y usar el asistente» — que es lo que concede ahora, y es el
texto exacto al que `NoReportsAccess` manda a quien lo necesita.

## 30. El asistente pasa de comentar a actuar

> De dos herramientas a seis, y de un contexto que solo tenía agregados a uno
> que conoce cada tarea por su nombre. El disparador fue una petición que
> falló: «auto asigna responsables a las actividades que no tienen».

### 30.1 Por qué fallaba, que no era un fallo

El modelo respondió que no podía y que necesitaba el id de la tarea. Tenía
razón, y el motivo estaba a la vista en el briefing:

- `instantanea.sinAsignar` era **un número**, no una lista;
- `bloqueadas.tareas` traía títulos pero **el mapper descartaba el `taskId`**,
  que la consulta sí devolvía;
- la descripción de `proponer_asignacion` decía literalmente que el id *«tiene
  que darlo la persona: no está en el contexto»*.

Se le pidió actuar sobre datos que nunca había visto. Lo correcto era negarse.

### 30.2 `task_inventory`, y por qué no vale `task_find_all`

Proyección mínima de **todas** las tareas del proyecto: `id`, `titulo`,
`columna`, `columnId`, `prioridad`, `vence`, `cerrada`, `encargados`,
`etiquetas`.

No se reutiliza `task_find_all` —que ya existía— porque aquel devuelve la tarea
entera con sus relaciones: descripción, comentarios, adjuntos. **Este contexto
viaja dentro de la instrucción de sistema en cada turno**, así que lo que se
deja fuera se deja de pagar en todos los mensajes de la conversación.

Va sin recortar por relevancia, por decisión explícita: se prefiere que el
asistente pueda hablar de cualquier tarea a que acierte más barato.
`LIMITE_INVENTARIO` (500) es un cortafuegos contra la ventana del modelo, no un
criterio de producto.

#### 🟡 Es el único bloque del briefing que crece con el proyecto

Medido: **31,7 KB de briefing con 69 tareas**, unos 8–10k tokens por turno. Con
un proyecto de demostración va sobrado. A partir de unos cientos de tareas
abiertas se va a notar en latencia y en cuota, y el sitio por donde cortar ya
está preparado —el `orderBy` de `inventory` pone las abiertas y las recientes
primero, así que el `take` recorta por lo cerrado y lo viejo.

⚠️ `nulls: 'first'` en ese `orderBy` **no es cosmético**. En Postgres un `ASC`
pone los `NULL` al final, y aquí `completedAt` nulo significa «sigue abierta»:
sin eso el recorte se comería exactamente lo que hay que conservar.

### 30.3 De dos herramientas a seis

| Herramienta | Permiso | Endpoint al aceptar |
|---|---|---|
| `proponer_tarea` | `canCreateTask` | `POST /boards/:id/tasks` |
| `proponer_asignacion` | `canEditTask` | `POST /tasks/:id/assign` |
| `proponer_edicion` | `canEditTask` | `PATCH /tasks/:id` |
| `proponer_movimiento` | **`canMoveTask`** | `POST /tasks/:id/move` |
| `proponer_checklist` | `canEditTask` | `POST /tasks/:id/checklists` |
| `proponer_comentario` | `canComment` | `POST /tasks/:id/comments` |

La regla de §26 no se ha tocado: **la IA propone; ejecuta el código que ya
existe.** Ninguna abre una vía de escritura nueva.

**`proponer_movimiento` cuelga de `canMoveTask` y no de `canEditTask`**, igual
que su endpoint. Es la única herramienta que alcanza a un colaborador: quien
ejecuta el trabajo puede decir que lo terminó sin poder redefinir en qué
consistía, y eso vale también cuando lo pide hablando. Se usa
`POST /tasks/:id/move` y no `PATCH /tasks/:id` aunque los dos muevan, porque el
`PATCH` pide `canEditTask` y dejaría fuera justo a ese perfil.

Cada herramienta **se niega cuando no cambiaría nada**: una edición sin campos,
un movimiento a la columna donde ya está, un checklist vacío. Una tarjeta que
promete algo y al aceptarla no hace nada es peor que no haberla propuesto.

#### El checklist son N peticiones, y se dice

`POST /tasks/:id/checklists` crea **un paso por llamada**. Van en secuencia y no
en paralelo porque el `order` es la posición: lanzadas a la vez, el orden en
pantalla lo decide quién llegue antes al servidor. No hay transacción que abarque
varias peticiones HTTP, así que si falla a mitad las anteriores ya están creadas
y la tarjeta dice «se añadieron 3 de 5 pasos antes de fallar». Fingir que no pasó
nada habría sido mentir sobre el estado del tablero.

#### 🔴 Aquí no hay, ni va a haber, borrado

No es un olvido. Es la garantía de que el asistente no puede destruir nada, y es
**estructural, no una instrucción**: el prompt no menciona el borrado a
propósito, porque una regla que dice «nunca borres» se rodea con la pregunta
adecuada, mientras que una capacidad que no existe no se puede invocar.

Tres capas, ninguna dependiente de que el modelo obedezca:

1. la herramienta no se le declara, así que no puede expresar la intención;
2. `validarPropuesta` descarta cualquier `call` fuera de la lista permitida;
3. las server actions solo saben llamar a los endpoints que tienen escritos.

Está anotado al pie de `tools.ts` para quien vaya a añadir una herramienta
dentro de seis meses.

### 30.4 El `porQue` que nunca se pintó

`porQue` es un parámetro **obligatorio** de todas las herramientas. `prompt.ts`
tenía dos comentarios largos explicando que se hizo obligatorio para que el
modelo no pudiera omitirlo, `validarPropuesta` lo arrastraba, la interfaz de
TypeScript lo declaraba… y **el frontend no lo renderizaba en ningún sitio**.
Cero usos, confirmado con grep.

Lo que se veía era el texto libre del modelo en la burbuja, que la regla 7 bis
del prompt pedía aparte: dos mecanismos para el mismo trabajo, y cableado solo
el que no se puede garantizar. El JSDoc de `ProposalCard` llegó a afirmar que el
porqué vivía en la burbuja, contradiciendo a `tools.ts` en el mismo repositorio.

Con **una** propuesta por respuesta colaba, porque el párrafo de arriba
justificaba la única tarjeta de abajo. Desde que el inventario permite repartir
varias tareas en una sola respuesta —una llamada por tarea— deja de casar: un
bloque de razones arriba y N tarjetas debajo no se pueden emparejar leyendo.

Ahora el `porQue` va **dentro de su tarjeta**, entre los hechos y los botones,
separado por un filete: arriba lo que va a pasar, luego la opinión del asistente
sobre por qué, y entonces decidir. Mezclarlos leería con la misma autoridad.

Y la regla 7 bis cambia de trabajo en vez de desaparecer: el `porQue` justifica
cada propuesta una a una, y el texto **solo encuadra el conjunto** —qué se ha
hecho y cuántas propuestas hay—, que es lo único que puede aportar el texto y no
la tarjeta. Sin ese ajuste el modelo escribía la misma frase dos veces, una
encima de otra; se vio en pantalla. `textoPorDefecto` dejó de componer razones
por el mismo motivo.

### 30.5 Dos textos que mentían

- **«nada existe todavía»** en un cambio de encargado. Vale para una tarea
  nueva; sobre una tarea que está en el tablero desde antes es falso. Ahora
  «sin aplicar», y lo pone cada tarjeta porque no significan lo mismo.
- **«No se ha creado nada»** al descartar. Servía para la tarea nueva, no para
  un cambio: no había nada que crear. Ahora «no se ha aplicado nada».

### 30.6 Lo que queda

**Capa 3, sin hacer.** Con seis tipos de propuesta y el modelo proponiendo
varias por respuesta, faltan un «Aceptar todas» y una tarjeta que resuma en vez
de N sueltas. Probado con las cuatro herramientas nuevas pedidas en un solo
mensaje: respondió con un montón de propuestas, todas correctas, y esa es
exactamente la pantalla que pide el trabajo de interfaz que falta.


---

## 31. Administración de la plataforma — la sexta zona, y la capa que faltaba

> El único punto de §10 que quedaba sin construir: «**admin-front** — usuarios y
> roles globales». Se hizo en cuatro fases, y por el camino apareció una capa
> que no estaba en el plan: el estado del proyecto.

Es la primera vez que **tocamos el backend a propósito** (CLAUDE.md dice que no
lo hacemos sin acordarlo). El motivo es que no había nada que consumir: el rol
global existía con dos valores y sin jerarquía, no había registro de actividad, y
un proyecto no tenía forma de estar suspendido. La zona sola no era construible.

### 31.1 Las cuatro fases

| Fase | Qué añadió |
|---|---|
| 0 | `SuperAdmin > Admin > User`, con jerarquía y la regla de actuar hacia abajo |
| 1 | Registro de actividad administrativa, consultable y **solo-añadir** |
| 2 | Namespace `/api/admin`, panel de Cuentas y la zona `admin-front` (4105) |
| 3 | Suspensión y archivado de proyectos |

Detalle del contrato en [CONTRATO-API.md § Administración](CONTRATO-API.md) y del
modelo en [docs/backend/permissions.md](../backend/permissions.md).

### 31.2 La zona

`admin-front` en el puerto **4105**, servida en `/admin`, con tres pestañas:
Cuentas, Proyectos y Actividad — los dos inventarios primero y el registro al
final, porque se consulta después.

Sigue el patrón de las demás zonas: los filtros viven en la **URL** (`?q=`,
`?estado=`, `?page=`) y no en estado de cliente, así que «los proyectos
suspendidos» es un enlace que se puede pegar en un mensaje, el botón atrás hace
lo que se espera, y las páginas siguen siendo Server Components.

⚠️ Los enlaces de pestaña van **sin** el prefijo (`next/link` añade `/admin`
solo), pero el `hrefFor` del paginador va **con** él: `Pagination` monta `<a>` de
verdad, no `Link`. Es §16 otra vez, en dos direcciones dentro del mismo archivo.

### 31.3 El panel no enlaza a los proyectos, y es a propósito

El rol global no concede permisos dentro de un proyecto, y eso no se relajó.
`/projects/<slug>` le daría **403** a quien administra si no es miembro, y
parecería roto. La ficha se pinta con `GET /admin/projects/:id`, que es otra
puerta: solo lectura, sin conceder ningún permiso de proyecto.

### 31.4 El estado del proyecto, que era la pieza de verdad

Suspender no podía ser «esconderlo de la lista». Un proyecto `SUSPENDED` se ve
**entero** —tableros, tareas, comentarios— y no acepta ninguna escritura, **ni
del dueño**. Un `DELETED` responde 404 a todo el mundo y solo existe en el panel.
Los dos se deshacen; el `DELETE /projects/:id` del dueño no, y el panel no lo
ofrece.

Tres decisiones que se pagan si se olvidan:

1. **El recorte llega en `permissions/me`.** El mapa viene ya reducido a
   `canViewProject` + `canViewReports`, así que ninguna pantalla necesita mirar
   el estado para dejar de enseñar botones. Se hizo ahí y no en cada pantalla
   porque ese endpoint es la única pregunta que hace la interfaz: la pantalla que
   se olvidara de mirar el estado enseñaría botones que fallan.
2. **`projectStatus` y `suspendedReason` viajan con el mapa.** No para apagar
   nada, para **explicarlo**: un mapa vacío sin motivo parece que te han quitado
   el rol. Vienen en la misma respuesta y no de `GET /projects/:id` para que no
   puedan discrepar por la caché de 5 minutos.
3. **El 403 lleva `code: 'PROJECT_SUSPENDED'`.** Un `FORBIDDEN` se arregla
   pidiendo permiso a quien administra el proyecto; esto no se arregla. Sin
   distinguirlos, el dueño de un proyecto suspendido se pone a pedirse permisos a
   sí mismo.

El aviso de la pantalla del proyecto (`SuspendedProjectNotice`) **no oculta el
contenido**. Lo que hay dentro sigue siendo el trabajo del equipo, consultarlo no
rompe nada, y taparlo convertiría una suspensión reversible en una pérdida de
acceso.

### 31.5 Dos fallos que solo aparecieron al ejecutarlo

Los tipos compilaban y las pruebas pasaban en los dos casos.

- **El `code` explícito no llegaba nunca.** `StandardExceptionFilter` derivaba el
  código del status HTTP en sus dos ramas: la de `HttpException` ignoraba el
  `code` del cuerpo, y en la de `RpcException` se miraba `statusCode` **antes**
  que `code` — y como todos los `RpcException` del repo llevan `statusCode`, la
  rama del código era inalcanzable. O sea que la pieza entera que distingue «está
  suspendido» de «no tienes permiso» estaba muerta, y salía `FORBIDDEN`. Ninguna
  de las 32 pruebas del gateway lo cubría; ahora hay tres que sí.
- **`PROJECT_RESTORED` no se emitía.** El registro elegía la acción por el estado
  **nuevo**, y recuperar un archivado termina en `ACTIVE` igual que reactivar un
  suspendido, así que se anotaba como reactivación. Se resuelve devolviendo el
  estado anterior desde el microservicio. Un fallo invisible: la operación
  funciona, la fila aparece, y dice otra cosa — en un registro que no se puede
  editar.

Y una fuga que se cerró antes de que se notara: `suspendedBy` salía en
`GET /projects` y `GET /projects/:id`, o sea el id de una cuenta administradora,
cuando el rol global es **privado**. Se omite en las rutas de usuario; el panel lo
sigue viendo por la suya.

### 31.6 Lo que no está verificado

Las cuatro pantallas nuevas de `admin-front` **no se han abierto en un
navegador**. Compilan, y el contrato que consumen está verificado petición a
petición contra el backend en marcha, pero el render no.

---

## 32. El chat: un modelo, dos conversaciones

Chat de equipo por proyecto y conversaciones privadas, sobre **una sola
estructura**. Responder, reaccionar, mencionar, silenciar y contar lo no leído
tienen que funcionar igual en los dos; con estructuras paralelas serían cinco
cosas duplicadas que divergen a la primera corrección aplicada solo en una.

```
ChatChannel       { kind: PROJECT | DIRECT, projectId? , directUserA/B? }
ChatChannelState  { channelId, userId, lastReadAt?, mutedAt? }
ChatMessage       { channelId, authorId, body, replyToId? }
ChatReaction      { messageId, userId, emoji }   ← PK el trío
```

### 32.1 Quién participa se responde distinto según el tipo

- **PROJECT** — los miembros del proyecto, y eso vive en `project_members`. **No
  se copia.** Duplicarlo obligaría a sincronizar cada alta y cada baja, y un
  fallo de sincronización es alguien que sigue leyendo un chat del que le
  echaron.
- **DIRECT** — estructuralmente las dos personas del canal, con sus ids
  **ordenados**. Sin ordenarlos, que Ana escriba a Juan y Juan a Ana crearía dos
  conversaciones y cada uno vería la mitad de lo hablado.

🔴 `ChatChannelState` **no dice quién participa**: se crea sola al abrir un chat
o silenciarlo. Tratarla como control de acceso daría entrada a cualquiera que
haya pasado por ahí una vez.

### 32.2 El tiempo real es el que ya había

No se abre ninguna conexión nueva. `AvisosEnVivo` mantiene **un** flujo SSE por
persona para toda la aplicación; el chat se pinta en el servidor y el
`router.refresh()` de cada evento lo repinta. Eso es lo que hace que el aviso
llegue **fuera del chat** — estés en el tablero, en los informes o en otro
proyecto.

⚠️ Los mensajes viajan con `type: 'CHAT_MESSAGE'` y **no crean fila en
`notifications`**: cincuenta mensajes serían cincuenta avisos por persona.
⚠️ El aviso **no lleva el texto**: lo enseñaría en la pantalla de quien tenga el
portátil abierto en una reunión.
⚠️ **Silenciar se filtra en el servidor**, no en el navegador: un aviso que llega
y se descarta al pintarlo ya ha sonado. Y no deja de contar lo no leído — son dos
cosas distintas.

### 32.3 Menciones y referencias, con el nombre dentro

`@[Juan Pérez](user:2222…)` · `/[Sprint 1](board:88ab…)`

Si sacan a Juan o borran el tablero, **el nombre ya está escrito en el mensaje**:
degradar es no hacer nada. Es también lo que hace que un mensaje viejo se lea
como se escribió aunque hayan renombrado las cosas.

El control es **el catálogo** (`/mentionables`), que solo devuelve lo que quien
pregunta ya puede ver. Revalidar al enviar no protegería de nada: el nombre lo
escribe quien manda. ⚠️ Eso cambia el día que una mención genere un aviso.

### 32.4 Lo que aporta cada zona

`ChatPanel` vive en `commons` porque lo usan dos zonas. `ProjectChat` y
`DirectConversation` son envoltorios de veinte líneas: encabezado y las acciones
de servidor de su zona. Cuando eran dos componentes, cada arreglo iba dos veces.

### 32.5 El asistente

Lee los últimos 20 mensajes **como contexto, no como herramienta**: una lectura
que casi siempre hace falta no debe gastar un turno ni depender de que el modelo
decida llamarla. Escribe con `proponer_mensaje`, que sigue el mismo camino que
las demás — propuesta, autorización, y el endpoint de siempre con su permiso.

⚠️ Es la propuesta de **más alcance**: un comentario queda en una tarea, un
mensaje suena en el teléfono de todo el equipo. Nunca alcanza a un chat privado:
darle esa capacidad sería dejarle escribir a nombre de alguien en una
conversación que el proyecto no contiene.

---

## 33. Análisis deja de ser un informe y pasa a ser un lienzo

> La pantalla enseñaba cinco informes fijos, todos, siempre, en un orden que
> nadie eligió. Ahora arranca vacía y cada cual monta la suya.

### 33.1 El problema era la primera impresión, no los gráficos

Los cinco informes estaban bien y siguen estando. Lo que estaba mal es que se
pintaban los cinco pasara lo que pasara, y en un proyecto sin historial —que es
todo proyecto durante sus primeras semanas— tres de ellos se disculpaban:
«faltan 10 tareas cerradas», «faltan días de historial», «todavía no hay
suficiente historial». **La pantalla pedía perdón antes de servir para nada.**

El segundo problema era el orden. Estaba elegido y argumentado (§25.12: cuánto
trabajo hay, cómo se mueve, cuánto tarda, qué cabe esperar) y sigue siendo un
buen orden por defecto — pero era el único posible, y quien necesitaba tener
delante el reparto por persona lo tenía siempre el último.

### 33.2 La decisión que definió el alcance: el lienzo es de la persona

Se resolvió **antes de escribir el modelo**, porque cambiaba el modelo entero.

| | Por persona | Por proyecto |
|---|---|---|
| Fila | `(userId, projectId)` | `projectId` |
| Leer | `canViewReports` | `canViewReports` |
| Reorganizar | el mismo: es tuyo | haría falta `canEditProject` |
| Concurrencia | tus dos pestañas | dos personas pisándose en silencio |
| Interfaz | ninguna extra | un estado «solo lectura» que explicarse |

Se eligió **por persona**. Es la misma línea que ya siguen las conversaciones
del asistente —de una persona en un proyecto— y hace que reorganizar no necesite
ningún permiso nuevo: si llegaste a la pantalla tienes `canViewReports`, y tu
lienzo no lo ve nadie.

Lo que se pierde, dicho: **el equipo no comparte vista**, y montar la del
compañero es volver a arrastrar. Si algún día hace falta, la forma de añadirlo es
una tabla de **plantilla del proyecto** aparte con una regla de precedencia, no
convertir esta en compartida.

### 33.3 `report_layouts` vive en projects-service, no en reports

`reports-service` **no tiene base de datos, y eso es una decisión** (§25.6): lee
de tasks y projects, calcula y responde. Darle Prisma para una tabla de
preferencias le añadiría una migración, un `DATABASE_URL` y un esquema propio a
un servicio cuya identidad entera es no tener ninguno.

`projects-service` ya guarda estado por persona dentro de un proyecto
—`ChatChannelState`, las membresías—, así que la tabla es suya. El coste está
escrito en el módulo del gateway: **`/projects/:id/reports/layout` va a
`PROJECTS_SERVICE` y sus siete hermanas a `REPORTS_SERVICE`**. El cliente ya
estaba registrado ahí porque lo necesita `ProjectPermissionGuard`, así que no
añade ninguna dependencia.

⚠️ **Sí tiene clave foránea con `Project`, al revés que `Notification`.** Un
aviso es un hecho del pasado y tiene que sobrevivir al proyecto del que habla;
un lienzo **no significa nada sin el suyo** —sus widgets apuntan a columnas y
etiquetas que se van con él—, así que cascadea y nadie tiene que acordarse de
limpiarlo desde el código que borra.

### 33.4 El coste de carga se ha invertido

Antes se pedían los cinco informes en cada carga, dos recorriendo el historial,
hubiera o no algo que enseñar con ellos. Ahora la page lee el lienzo, junta lo
que come (`informesNecesarios`) y **pide solo eso**.

- Lienzo vacío → **una** petición de informe.
- Solo la instantánea puesta → una, y no recorre el historial.

Cuesta **dos viajes en serie** donde antes había uno. Se acepta: el primero es
una lectura por clave primaria de una tabla de preferencias.

⚠️ **La instantánea se pide siempre, aunque el lienzo no la use.** Es la única
que sabe si el historial está fabricado, y ese aviso no puede depender de qué
gráficos tenga puesto cada cual (§25.12).

### 33.5 `react-grid-layout` 2.x, y por qué se pudo

Vive **solo en `reports-front`**, que es el argumento de multi-zone que el repo
ya cobró con Recharts. Se verificó antes de construir nada encima, igual que se
hizo con el peer de React de Recharts:

- `react-grid-layout` 2.2.4 trae **sus propios tipos** (`@types/react-grid-layout`
  está deprecado y sobra: se instaló y se quitó);
- su `react-draggable` resuelve a **4.7.1**, que usa `nodeRef` — las versiones
  anteriores llamaban a `ReactDOM.findDOMNode`, que **React 19 eliminó**. Con la
  1.x esto no habría arrancado.

**El CSS se escribió a mano en vez de importar el suyo.** El de la librería pinta
el hueco de destino en rojo puro y los tiradores con `rgba(0,0,0,.4)`: sobre el
tema oscuro el tirador es invisible y el hueco se lee como un error. Sobrescribir
eso era más CSS que escribirlo. Y de paso se evita un `@import` a `node_modules`
dentro de un CSS global, que aquí depende de que la cadena de PostCSS lo
resuelva y fallaría **en silencio** (la forma en que Tailwind ya nos ha mordido
dos veces).

### 33.6 Tres decisiones de gesto

- **No hay «modo edición».** Un modo obliga a entrar y salir, y quien entra a
  mirar no lo descubre nunca. Lo que evita los arrastres accidentales es el
  **tirador**: solo se arrastra por la cabecera, así que seleccionar texto o
  abrir el «cómo se lee» dentro de un gráfico no lo mueve.
- **Se guarda solo y en silencio**, 700 ms después del último gesto. Un botón
  «Guardar disposición» es una forma de perder el trabajo de quien no lo pulsa.
  Solo se dice algo si falla.
- **Quitar no pregunta.** Se deshace volviéndolo a añadir del catálogo.

⚠️ **Solo se persiste en el ancho grande.** `ResponsiveGridLayout` deriva las
disposiciones estrechas compactando la ancha, que es lo que se quiere al pintar
y un desastre al guardar: si `onLayoutChange` persistiera lo que llega en un
móvil, **una sola visita desde el teléfono convertiría la composición de alguien
en una columna apilada** sin que nadie haya arrastrado nada. Y se compara contra
el ancho **medido del contenedor**, no contra `window.innerWidth`: el lienzo
tiene la barra lateral al lado y esos dos números no coinciden.

### 33.7 El gráfico generado: elegir, no inventar

Había dos lecturas posibles y solo una es aceptable:

| | |
|---|---|
| ❌ Que el modelo genere la consulta o el código | Un `SELECT` inventado, o cifras estimadas. Va contra la regla 1 del prompt, que prohíbe **inventar el dato de partida** |
| ✅ Que elija y parametrice de un conjunto cerrado | Forma + métrica + filtro + rango, sobre agregados que `reports-service` ya calcula |

El conjunto vive en `contracts/src/reports/report-widget.ts`: diez métricas, cada
una **con el agregado del que sale escrito al lado**. Esa columna no es
documentación — es la comprobación de que ninguna necesita una consulta nueva, y
por tanto de que ninguna puede devolver una cifra que nadie haya calculado.

**Y cada métrica declara qué opciones acepta.** Un eje de «filtro» genérico
habría sido más cómodo y habría mentido: `people` ya trae abiertas, cerradas y
vencidas por separado —ahí el filtro **es** la métrica—, mientras que
`snapshot.byColumn` cuenta lo que hay ahora y no sabe separarlo. Ofrecer «solo
abiertas» sobre esa habría devuelto el mismo número con otra etiqueta, que es la
peor clase de error: se lee bien y es falso. `validarGrafico` rechaza además una
serie temporal pedida como dona o un rango sobre una foto del momento — un
conjunto cerrado que admite combinaciones sin sentido no es un conjunto cerrado.

`validarGrafico` se aplica en **dos puertas y a propósito**: el DTO del gateway
al guardar el lienzo, y `validarPropuesta` al validar lo que devolvió Gemini. Una
la cruza la pantalla y la otra el modelo, y ninguna puede fiarse de que la otra
ya miró. El `enum` que se le declara a Gemini es una sugerencia con buena tasa de
acierto, no una garantía.

#### `proponer_grafico` es la novena herramienta, y la primera que no toca el proyecto

Las otras ocho proponen tocar el tablero; esta propone tocar **el lienzo de quien
habla**. Por eso cuelga de `canViewReports` —el permiso que ya hizo falta para
llegar al asistente— y es **la única que alcanza a un rol de solo lectura**, que
hasta ahora no podía proponer absolutamente nada. Tiene sentido que sea justo
esta: mirar los datos de otra forma no es tocar el trabajo de nadie.

**Sigue llegando como propuesta con su tarjeta.** Un gráfico es inofensivo y la
tentación era añadirlo directo para ahorrar un clic. No se hace: nunca aparece un
gráfico en la pantalla de alguien sin que lo haya aceptado. Un asistente que
empieza a cambiar cosas sin preguntar porque «esta es pequeña» es el que deja de
dar confianza para las grandes.

⚠️ **Y sigue sin haber borrado.** `proponer_grafico` solo **añade**; no existe la
de quitar y no se va a añadir, por lo mismo que las demás (nota al pie de
`tools.ts`). Quitar un gráfico es un clic en su aspa.

#### La única acción que sí revalida

`aceptarGraficoAction` llama a `revalidatePath`, al contrario que las ocho de
§26.6. No es una excepción caprichosa: lo que cambian aquellas vive en otra zona
que no comparte caché con esta, y lo que cambia esta **es esta misma página**.
Sin revalidar, el gráfico aceptado no aparecería hasta recargar, que se lee como
que aceptar no hizo nada.

### 33.8 Una paleta de series, medida y no elegida a ojo

Las columnas y las prioridades **traen su color** y se respeta: un gráfico de
columnas pintado de otro color dejaría de leerse igual que el tablero. Las
etiquetas y las personas no traen ninguno, y ahí hacía falta una paleta.

Seis tonos en `theme.css` (`--color-serie-1..6`), y son **los mismos en los dos
temas** porque pasan las cinco comprobaciones medibles en ambos: banda de
luminosidad, suelo de croma, separación bajo protanopía y deuteranopía (ΔE ≥ 8 en
OKLab), suelo de visión normal y contraste 3:1 contra la superficie. El par que
más se acerca es serie-2 ↔ serie-3, con ΔE 9,3.

⚠️ **No son los colores de estado.** `success`, `warning` y `error` significan
algo; reutilizarlos como «serie 3» convierte una etiqueta cualquiera en una
alarma.

⚠️ **El orden es fijo y no se cicla.** A partir de la sexta categoría se agrupa en
«Otras» —y el resto se **suma**, no se tira: una dona de las cinco etiquetas
mayores sin ese resto parece el reparto completo del proyecto y no lo es.

Y una decisión que ahorró la mitad del problema: **las barras van de un solo
color**. En unas barras horizontales el nombre está escrito al lado de cada
barra, así que pintarlas de seis colores es codificar dos veces lo mismo. La
paleta hace falta de verdad en la **dona**, que no tiene eje.

### 33.9 Verificado contra el stack

| Caso | Resultado |
|---|---|
| Lienzo de quien nunca lo tocó | `{ widgets: [], actualizadoEn: null }` — **200, no 404** |
| Guardar y releer | Vuelve igual, con `actualizadoEn` |
| Métrica inventada | 400, con la lista de las válidas |
| `flujo_por_columna` como dona | 400 · «no se puede dibujar como dona» |
| `dias` sobre `tareas_por_columna` | 400 · «es una foto del momento: no admite rango» |
| `soloVencidas` sobre prioridad | 400 · «no distingue las vencidas» |
| `topN: 99` | 400 · «el top N va de 2 a 20» |
| Un campo de más en el widget | 400 · «property colorFavorito should not exist» |
| `paradas_por_columna` con rango y `soloVencidas` | **200** — la métrica sí los acepta |
| `cierres_por_semana` como barras | **200** |
| Un no-miembro pidiendo el lienzo | **403** |

**La separación entre personas no se puede probar por la API, y esa es la
garantía:** no hay ninguna ruta que acepte un `userId`. Lo pone el gateway desde
el token y la clave primaria es `(userId, projectId)`.

---

## 35. El botón que giraba para siempre, la otra mitad

`commons/api/timeout.ts` ya contaba este síntoma y lo daba por resuelto: un
`fetch` sin plazo durante el render de `revalidatePath` dejaba la respuesta de la
acción sin cerrar, y con ella el `pending` del botón. Ese arreglo es correcto y
está completo —los cuatro clientes pasan `timeoutSignal()`— pero **el síntoma
seguía apareciendo**, sin regularidad, sobre cambios que sí se habían guardado.

Eran dos fallos distintos con la misma cara.

### 35.1 El estado del router **es** una promesa, y hay un camino que no la resuelve

En `use-action-queue.js` de Next 16.2.9, el estado del App Router se lee así:

```js
return isThenable(stateWithDebugInfo) ? use(stateWithDebugInfo) : stateWithDebugInfo;
```

Es decir: el estado es una promesa y se consume con `use()` **en la raíz del
árbol**. Y en `app-router-instance.js`, cada acción del router —una Server
Action, un `router.refresh()`, una navegación— hace esto al despacharse:

```js
const deferredPromise = new Promise((resolve, reject) => { resolvers = { resolve, reject } });
startTransition(() => { setState(deferredPromise); });
```

Si esa promesa no se resuelve, la transición no termina nunca. Y no se resuelve
cuando la acción se marca `discarded`, porque el manejador sale antes:

```js
function handleResult(nextState) {
  if (action.discarded) {
    ...
    runRemainingActions(actionQueue, setState);
    return;                        // ← action.resolve(nextState) no se llama
  }
  actionQueue.state = nextState;
  runRemainingActions(actionQueue, setState);
  action.resolve(nextState);
}
```

Una acción se descarta cuando llega un `ACTION_NAVIGATE` o un `ACTION_RESTORE`
con otra en vuelo: pulsar un enlace, o el botón atrás, mientras se guarda.

**El `resolve` del payload sí se llama** —es otro, y es el que devuelve el
resultado al formulario—, así que la escritura llegó al backend y se guardó. El
que no se llama es el de la cola. De ahí la firma exacta del fallo: el cambio
está hecho, no hay ningún error en ninguna consola, y como la transición es una
sola para toda la aplicación, **giran todos los botones a la vez**.

### 35.2 Por qué a PRAXIS le pasaba más que a una aplicación normal

Porque la cola del router estaba ocupada casi siempre, y eso ensancha la ventana
de la carrera:

| Fuente | Qué hacía |
|---|---|
| `AvisosEnVivo` | `router.refresh()` **por cada evento SSE**, sin agrupar, montado en el armazón de las seis zonas |
| El chat | Viaja por ese mismo flujo. Una conversación viva son varios eventos por minuto, en toda pestaña abierta |
| `AutoRefresh` | Un refresco por intervalo en la bandeja, de cuando no había tiempo real |
| `revalidateProject` | Revalidaba `/<id>` **y** `/` en cada acción, y §24.4 ya midió lo que cuesta re-renderizar el detalle |

Es intermitente porque `notifyOthers` excluye al autor: los avisos que provocan
la colisión son los de **otras personas**. Solo, cuesta reproducirlo; con el
equipo dentro, pasa a diario.

### 35.3 Cómo se mide ahora la espera — `commons/hooks/useAccion`

Reemplazo directo de `useActionState`, misma tupla. Mide con dos contadores:

| Contador | Cuándo sube | Prioridad |
|---|---|---|
| `lanzadas` | Al empezar la acción | La de la transición — igual que antes |
| `terminadas` | En el `finally`, dentro de un `setTimeout(…, 0)` | **Normal** |

El `setTimeout` es la pieza. React propaga el contexto de la transición a través
de los `await` de una acción, pero **no** al callback de un macrotask: lo que se
programa ahí se actualiza por la vía normal, que la transición atascada no
bloquea. Apagar el aviso deja de depender de aquello que se cuelga.

Y son contadores y no un booleano para que el orden no importe: los dos son
monótonos, así que si el «terminó» llegara a pintarse antes que el «empezó»
—prioridades distintas—, `lanzadas > terminadas` sigue dando lo correcto en
cuanto han llegado los dos. Con un booleano ese cruce deja el botón encendido
para siempre, que es justo lo que se venía a arreglar.

`TECHO_DE_ESPERA_MS` (25 s) cubre el último caso: que la acción no vuelva **de
ninguna manera** y el `finally` no llegue a correr. Está por encima de
`REQUEST_TIMEOUT_MS` a propósito — si fuera a fallar por tiempo, ya habría
fallado con su mensaje.

⚠️ **No uses `useActionState` directamente en un formulario nuevo.** Funciona el
95 % de las veces, y el 5 % restante es este fallo.

### 35.4 Y se baja la presión sobre la cola

- **`commons/hooks/useRefrescoAgrupado`**: un refresco por ventana de 800 ms,
  el primero sin retraso, nada con la pestaña oculta y el pendiente al volver.
  Su estado vive **en el módulo, no en el hook**: lo que se raciona es una cola
  global, así que dos componentes que pidan a la vez tienen que contar juntos.
  Lo usan `AvisosEnVivo` y `AutoRefresh`.
- **`AutoRefresh` pasa de 60 s a 300 s** en la bandeja. Dejó de ser la vía
  principal cuando llegó el SSE; hoy solo cubre lo que se pierda si el flujo se
  cae, y su documentación seguía diciendo que no había canal abierto.
- **`revalidateProject` ya no revalida `/`.** `ProjectGrid` pinta `name`,
  `description`, `status`, `createdAt`, `_count.members` y `_count.workspaces`,
  y nada más: un comentario o una tarea no cambian ninguno. Se separó en
  `revalidateProjectAndList`, que llaman **tres** acciones —`removeMember`,
  `createWorkspace`, `deleteWorkspace`— y son las que mueven un contador.

### 35.5 Alcance del cambio

45 puntos de uso en 31 archivos migrados a `useAccion`. No quedaba ni un
`useFormStatus` en el repo, así que la migración cubre **todos** los botones con
espera. Las seis zonas compilan y construyen; Biome no añade ni un diagnóstico
nuevo.

---

## 36. El asistente arranca el proyecto, y las etiquetas se van a donde se usan

Tres cambios de una misma sesión. El grande es el primero.

### 36.1 Por qué hacía falta un endpoint nuevo, y no otra `tool`

El asistente vivía entero bajo `/projects/:projectId/assistant/*`, y sus seis
herramientas son todas de tarea. Para proponer la estructura de un proyecto
faltaban las dos cosas: una ruta sin `projectId` —porque el proyecto todavía no
existe— y una herramienta que supiera hablar de espacios, tableros, columnas,
etiquetas y roles.

**Y no entra en `herramientasPara`.** Las seis se declaran en cada turno de una
conversación; meter ahí la de plantilla habría significado que a mitad de una
charla sobre tareas el modelo pudiera proponer rehacer el proyecto entero. Vive
en `plantilla.ts`, con su propia instrucción de sistema, y solo se le declara a
la llamada que la pide.

| Pieza | Dónde |
|---|---|
| Herramienta, prompt y validación | `assistant/src/assistant/plantilla.ts` |
| El turno | `AssistantService.borradorDePlantilla` |
| Comando TCP | `assistant_project_draft` |
| Ruta | `POST /me/assistant/project-draft` (solo `JwtGuard`) |
| Tipos | `contracts/assistant/plantilla.dto.ts` y `commons/api/domain.ts` |

### 36.2 La invariante de §26.1, intacta

**La IA propone; ejecuta el código que ya existe.** El endpoint devuelve
**nombres** y nada más — ni un id, porque nada existe todavía—. Quien crea el
proyecto es `commons/plantilla/aplicar.ts`, llamando una a una a las rutas que ya
usan los formularios de cada cosa, con la sesión de quien acepta.

No hay ninguna vía de escritura nueva. Y sigue sin haber borrado: una plantilla
solo añade, y sobre un proyecto que acaba de nacer vacío.

El paso de revisión **no es cortesía**: es esa regla puesta en pantalla. Un botón
que dijera «crear con IA» y montara veinte cosas de golpe sería la misma
capacidad con la revisión quitada.

#### Lo que se puede tocar antes de crear

Nombre y descripción se escriben; todo lo demás se **incluye o se quita**, y lo
quitado se queda tachado en vez de desaparecer — volver a meterlo sin repetir la
consulta importa, porque cada consulta cuesta cuota. Un editor de cada columna y
cada permiso sería rehacer aquí cuatro pantallas que ya existen para eso.

⚠️ **La poda transforma antes de filtrar, y ese orden arregla un bug real.** Las
claves de exclusión (`w1b0c2`) son posiciones del plan original. Encadenando
`.filter().map()`, el índice que recibe el `map` es el de la lista ya recortada:
quitar el primer espacio corría los demás una posición y la poda de sus tableros
se aplicaba al espacio equivocado, en silencio.

### 36.3 Dos decisiones del prompt que salen de trampas ya conocidas

- **`permisos` se declara como `ARRAY`** porque es lo que un modelo rellena bien,
  y se normaliza a **diccionario de booleanos** al validar. Es la trampa 8, y
  aquí muerde seguro: un array llegaría a `POST /projects/:id/roles` como un 400
  que nadie sabría de dónde sale.
- **`success` en una columna no es un color, es un significado**: marca la de
  cierre (§20.2). El prompt insiste en que solo la última lo lleve y la
  validación **recorta a una por tablero** — pedirle un color «de acabado» y
  darle una lista de fases invita a pintar de verde todo lo que suene a
  terminado, y eso da un tablero donde una tarea se cierra a mitad del flujo.

Se excluye `canDeleteProject` de lo repartible: una plantilla de arranque no
tiene motivo para regalar el borrado del proyecto entero el primer día.

### 36.4 Fallar a mitad, y decirlo

`POST /projects` es la única excepción: si falla no hay dónde colgar nada y se
vuelve con el error. A partir de ahí **se sigue y se apunta**. No hay transacción
que abarque varias peticiones HTTP, así que abortar en la quinta columna dejaría
el proyecto a medias igual, pero además sin lo que sí se podía crear. Misma
decisión que el checklist del asistente (§30.3).

El resumen enseña **los fallos uno a uno**, no un contador: quien acaba de crear
el proyecto necesita saber *cuáles* para ponerlos a mano.

Las columnas van **en secuencia**, no en paralelo: `order` es la posición, y
lanzadas a la vez el orden lo decide quién llegue antes al servidor.

### 36.5 Las etiquetas, al diálogo de la tarea

Tenían pestaña propia. El argumento de entonces —son configuración del proyecto,
se definen una vez y se usan muchas— chocaba con cuándo hacen falta de verdad:
**siempre estás clasificando una tarea y la que necesitas no está**. Eso obligaba
a cerrar el diálogo, cambiar de pestaña, crearla, volver al tablero, reabrir la
tarea y buscar dónde te habías quedado.

`GestorDeEtiquetas` vive dentro del diálogo, tras `canManageLabels`.

⚠️ **No tiene ningún `<form>`, y era el motivo por el que no estaba aquí.** Un
`<form>` anidado es HTML inválido y lo que se rompe no es el gestor, es el
autoguardado de la tarea. Se resuelve por donde había que resolverlo: la tupla de
`useAccion` devuelve un despachador que acepta un `FormData` construido a mano.

⚠️ Y por eso **ningún campo del gestor lleva `name`**: si lo llevara, el
formulario de la tarea lo recogería al autoguardar, y un campo de más es un 400.
Los valores viven en estado de React. Los botones son todos `type="button"`.

⚠️ **El `fieldset` cubre solo los interruptores.** Va con `disabled={readOnly}`, y
un `fieldset` deshabilitado apaga todo lo que tenga dentro: con el gestor dentro,
quien tuviera `canManageLabels` sin `canEditTask` se lo encontraría apagado. Los
dos permisos son independientes.

### 36.6 El chat, la última pestaña

`espacios → equipo → roles → chat`. Las tres primeras son dónde está el trabajo,
quién lo hace y bajo qué reglas; el chat es una conversación, se entra a leer y
no a decidir, y su insignia de no leídos ya lo reclama cuando toca. En segunda
posición partía en dos ese recorrido.

### 36.7 Segunda pasada: un bug del hook y una pantalla que no se entendía

**`useAccion` avisaba por consola al usarlo sin formulario.** «An async function
with useActionState was called outside of a transition». El gestor de etiquetas
llama al despachador desde un `onClick` —que es lo que permite mandar un
`FormData` a mano sin anidar un `<form>`— y eso no abre transición, así que el
`isPending` interno de `useActionState` no se actualizaba. Se arregla **dentro
del hook**, envolviendo el despachador en `startTransition`: son 45 puntos de
uso y basta con que a uno se le olvide. Anidar `startTransition` dentro de la
que React ya abre para un formulario no tiene efecto, así que el caso normal no
cambia.

**Y la vista previa del plan no se entendía.** Cinco arreglos, todos del mismo
problema —la pantalla donde se decide si aceptar veinte objetos que no has
creado tiene que poder leerse—:

| Antes | Ahora |
|---|---|
| Tres niveles con sangría y un borde | Árbol tipo EDT: guías en L, y cada nivel con su etiqueta —**Espacio**, **Tablero**— y su color |
| Columnas como chips sueltos | Chips con la de cierre marcada **con palabra**: «· cierra tareas» |
| «3 permisos» | Los permisos **por su nombre**, ordenados contra `PROJECT_PERMISSIONS` |
| Descripción en 2 filas | 6 filas y contador: la que propone el modelo son dos o tres frases |
| `max-w-lg` en los dos modos | `xl` (48rem) en **los dos**: cambiarlo al alternar de pestaña hacía saltar la ventana bajo el cursor |

`PERMISSION_LABELS` sube a `commons/api/domain.ts` — lo necesitan el formulario
de roles de `projects-front` y esta vista previa, que vive en `commons`.

`Dialog` estrena `size="xl"`. Un árbol de tres niveles dentro de 42rem obliga a
que cada nombre envuelva, y un árbol cuyos nombres envuelven deja de leerse como
un árbol.

#### Y se puede seguir hablando con el asistente

`POST /me/assistant/project-draft` acepta ahora `ajuste` y `previa`: con los dos
la llamada deja de ser «propón algo» y pasa a ser «cambia esto de lo que ya
propusiste». El plan anterior vuelve al modelo **como su propio turno**; sin eso,
pedir «quítale el espacio de marketing» llegaba sin nada que quitar y el modelo
rehacía el plan desde el brief, perdiendo todo lo demás que ya estaba bien.

⚠️ **`previa` viaja como cadena JSON, no como objeto anidado.** El
`ValidationPipe` del gateway corre con `forbidNonWhitelisted`, así que un objeto
obligaría a declarar seis clases DTO para describir algo que el servicio **no usa
como datos** — solo lo reenvía al modelo como texto. Una cadena con tope
(`PLANTILLA_PREVIA_MAX`) es lo que hace falta y no puede desincronizarse de la
forma real.

⚠️ **Cada ajuste reinicia las exclusiones.** Son posiciones (`w1b0c2`), no
identidades: conservarlas sobre una estructura recién generada quitaría lo que
hubiera caído en esa posición, que casi nunca es lo mismo. Perder dos clics es
mucho mejor que crear un proyecto al que le falta algo que nadie quitó.

Y gasta cuota, como cualquier turno. Se dice al lado del botón, con las que
quedan, y no después de pulsarlo.

### 36.8 Lo que **no** está verificado

El stack estaba apagado durante esta sesión, así que **nada de esto se ha
probado contra Gemini ni contra la base**. Compila entero —las seis zonas, el
gateway y assistant-service— y `next build` pasa, pero eso no dice nada de la
calidad de las plantillas que devuelve el modelo, ni de si `aplicarPlantilla`
sobrevive a un 409 por nombre repetido en mitad del árbol. Queda pendiente:

- un `pnpm e2e:regresion` completo;
- probar el borrador con briefs de tres sectores distintos y ver si el recorte de
  `success` aguanta;
- forzar un fallo a mitad —una etiqueta duplicada— y comprobar que el resumen lo
  cuenta bien.

---

## 37. «Tu cuenta»: la URL en inglés y la pantalla en tres bloques

La pantalla funcionaba y estaba mal repartida: cuatro `SettingsSection` apiladas
—«Cómo te ven», «Tus datos», «Sesión», «Eliminar la cuenta»— con dos líneas de
contenido cada una y una regla horizontal entre ellas. A 1400 px de ancho eso
son cuatro franjas de fondo vacío separadas por líneas: **la división pesaba más
que lo dividido**, y lo primero que se veía al entrar en «tu cuenta» era una
tabla de contenidos.

### 37.1 La ruta pasa a `/dashboard/profile`

Era la única pantalla de la zona con la URL en español; sus vecinas ya son
`chat`, `notifications` y `settings`. El segmento de la URL es lo primero que se
ve de una pantalla y no tiene por qué estar en un idioma distinto al del resto.

| Qué cambia | Dónde |
|---|---|
| La carpeta | `src/app/(private)/perfil/` → `(private)/profile/` (con `git mv`, para no perder el historial) |
| El destino de la ficha de usuario | `CUENTA_HREF` en `commons/organisms/AppLayout/AppShell.tsx` |
| «Completar perfil» del panel | `DashboardWelcome` apuntaba a `/settings`, que es de donde el formulario **ya se había ido** cuando nació esta pantalla: un enlace que prometía el campo del nombre y llevaba a una pantalla sin él |
| Los imports de los server actions | `AccountIdentity`, `DeleteAccount` y el `layout.tsx` de la zona |

`/dashboard/perfil` **sigue existiendo**, como page de una línea con
`redirect('/profile')`. El motivo es el mismo que en §24.2 y no ha cambiado:
dentro ya no lo usa nadie, pero los marcadores y lo que alguien haya pegado en
un chat no se corrigen desde aquí.

⚠️ Esa page vive en `src/app/perfil/`, **fuera del grupo `(private)`**. Dentro,
el `layout.tsx` monta el armazón, y montarlo pide el perfil y la navegación al
gateway: dos llamadas para pintar una pantalla que nadie llega a ver. La zona la
protege `proxy.ts` entera (§17.2), así que estar fuera del grupo no la deja sin
guard.

⚠️ **`updateProfileAction` no revalidaba esta ruta.** Vive en
`settings/actions.ts` —la escritura es la misma y no tiene sentido duplicarla—
y revalidaba `/` y `/settings`, que era cierto cuando el formulario estaba allí.
Desde que lo pinta esta pantalla, guardar el nombre dejaba el encabezado grande
con el nombre viejo hasta recargar. Ahora revalida las tres.

### 37.2 Tres bloques con forma, en vez de cuatro franjas

| Bloque | Qué junta | Por qué |
|---|---|---|
| **Portada**, ancho completo | foto, nombre, correo, rol, alta, estado de la cuenta, presencia actual | Es «quién eres» de un vistazo, y es lo único que justifica ocupar los 1400 px |
| **Rejilla 5/7** | «Tus datos» · «Tu estado» | Los dos son cortos: uno al lado del otro llenan la fila en vez de dejar medio ancho muerto |
| **«Sesión y cuenta»** | cerrar sesión · eliminar la cuenta | Las dos formas de terminar, en una tarjeta partida por una línea vertical |

**5 y 7, no 6 y 6.** Dos tarjetas de la misma fila miden lo mismo de alto
(`items-stretch`), así que el reparto lo decide la más alta: seis estados en dos
columnas son tres filas, y un formulario de dos campos a mitad de ancho no llega
—a 6/6 quedaba un palmo de tarjeta vacía bajo los campos, exactamente el hueco
que esta pasada venía a quitar—. Con el formulario en la columna estrecha sus
campos se apilan, gana alto, y las dos columnas acaban casi a la misma altura.

`ProfilePanel` (`molecules/`) es la tarjeta: icono, título, frase y contenido.
No reusa `SettingsSection` porque aquello es una sección **suelta** separada por
una línea —funciona en Configuración, donde cada sección trae dentro una tarjeta
o una tabla— y lo que hacía falta aquí es justo lo contrario: algo con marco,
que se pueda poner **al lado de** otra cosa en una rejilla.

### 37.3 La portada, y lo que dejó de ocupar una fila de formulario

- **El correo sale del formulario.** Estaba como `<input>` deshabilitado con el
  motivo debajo: una fila entera de formulario para un campo que nadie puede
  tocar. El dato y el motivo se conservan —el motivo sigue siendo verdad: vive
  en `Credential` y no hay endpoint que lo cambie— pero ahora es una línea de la
  ficha, con un candado y el porqué en el `title`.
- **La tira de datos** son los tres hechos que la cuenta sabe de sí misma y que
  no se editan en ninguna parte: `createdAt` («Miembro desde»), `status`
  («Activa») y la presencia. Ocupan el ancho que antes era fondo vacío y no
  inventan ningún dato que el backend no dé. ⚠️ `status` es el estado
  **administrativo**, no la presencia; un valor que no reconozcamos se enseña
  tal cual y **sin** pintarlo de verde, para que un estado nuevo del backend no
  salga como «todo bien» por defecto.
- **Las insignias de rol se quitan de la cabecera** en esta pantalla y solo en
  esta: ya salen junto al nombre, en la portada, y arriba serían el mismo dato
  dos veces en la misma vista.
- **Las fechas se formatean en el servidor** y viajan como cadena. `Intl` en el
  navegador usa la zona horaria de quien mira: formatear en un componente de
  cliente es un desajuste de hidratación esperando a que alguien viaje.

### 37.4 La presencia: dónde se cambia y quién la pinta

`PresencePicker` (organismo de la zona) enseña los seis estados **con su frase
de ayuda**, que es lo que no cabe en el menú flotante de la barra lateral. La
esfera de `PresenceSwitcher` (`commons/molecules/`, la del pie de la barra
lateral) sigue estando para cambiarlo en marcha desde
cualquier pantalla; esta es la pantalla donde se decide.

⚠️ **El retrato de la portada no tiene estado propio.** Pinta la prop que le da
el servidor. Con estado local en las dos piezas, el punto del avatar y la opción
marcada podrían decir cosas distintas; como está, el `revalidatePath('/',
'layout')` del action actualiza a la vez la opción, el retrato **y** la esfera de
la barra lateral. Verificado en el navegador: elegir «Comiendo» tiñe los tres.

### 37.5 Dos arreglos que salieron por el camino

🔴 **`LogoutButton` se encogía por el pliegue de una barra que no es la suya.**
Lee `useSidebarPlegada()` para quedarse en icono cuando la barra lateral está
plegada, y ese mismo botón se pinta en esta pantalla: con la barra plegada, el
botón de la tarjeta «Cerrar sesión» perdía la palabra y quedaba un icono suelto
en medio de una tarjeta ancha, por un estado de otra parte de la interfaz. Ahora
acepta `compacto`, y fuera de la barra se pasa en falso.

⚠️ **`Avatar` estrena `size="lg"`** (96 px). El retrato estaba puesto con
`scale-[1.6]` sobre el mediano, y una transformación **no ocupa sitio en el
diseño**: el círculo se veía grande pero seguía reservando 40 px, así que lo de
al lado se le montaba encima y había que compensarlo con márgenes a ojo. La
tabla del punto de presencia pasa a ser un `Record` por tamaño, porque el
ternario `sm ? … : …` daba el punto del mediano a un círculo del doble.

### 37.6 Móvil

- El retrato va **encima** del nombre, no a su lado: a 390 px, 96 px de círculo
  más el margen dejaban ~230 px, y el nombre y el correo se cortaban los dos.
- La tira de datos cae a dos columnas (no a una lista de tres filas), y la
  tercera ocupa la fila entera para que su pie con la fecha larga quepa en una
  línea.
- La rejilla 5/7 cae a una columna y la tarjeta de sesión apila sus dos mitades.
- Comprobado a 390 px: `scrollWidth === clientWidth`, sin desbordamiento
  horizontal.

### 37.7 Verificado en el navegador

Con el stack levantado, en las dos temperaturas de tema y en tres anchos:

| Caso | Resultado |
|---|---|
| `/dashboard/perfil` | 307 a `/dashboard/profile`, misma pantalla |
| Ficha de usuario de la barra, desde `dashboard` y desde `projects` | `href="/dashboard/profile"` en las dos zonas |
| Elegir «Comiendo» | opción marcada, punto del retrato, «Te ven como» y esfera de la barra lateral, los cuatro naranjas |
| Volver a «Disponible» | los cuatro verdes |
| «Guardar cambios» | «Listo, Andres. Tus datos quedaron guardados.» |
| Tema oscuro | la franja de la portada aguanta: va con `alpha()` sobre los tokens de marca, no con hexadecimales |
| 390 px y 820 px | sin desbordamiento; la rejilla y la tarjeta de sesión apilan |
| Consola | limpia, sin avisos de hidratación |

---

## 38. Configuración, con el mismo trato que la cuenta

La pila de secciones de §27.4 tenía el problema de §37 y **peor**: medido en el
navegador a 1352 px de ancho de contenido, «Praxis Voice» ocupaba 409 px de alto
con media pantalla en blanco a la derecha de una lista de tres pasos,
«Facturación» 315, y **«Apariencia» 159 px de banda a lo ancho de toda la
pantalla para un interruptor de 72 px**. Entre bloque y bloque, una regla
horizontal. Lo primero que se veía al entrar era la separación, no lo separado.

### 38.1 La misma tarjeta, y el nombre que ya no mentía

`ProfilePanel` pasa a llamarse **`PanelCard`**: se escribió para la pantalla de
la cuenta, y en cuanto la usan dos pantallas el nombre estorba. Sigue en las
moléculas de la zona y no sube a `commons` — la regla es cruzar cuando lo usan
**dos zonas**, y las dos pantallas son de `dashboard-front`.

Dos cambios en el componente:

- `children` pasa a ser **opcional**. Una tarjeta cuyo control entero cabe en el
  encabezado no tiene cuerpo (ver «Apariencia», abajo).
- El encabezado es `flex-wrap`, para que en móvil el `aside` caiga bajo el
  título en vez de estrujarlo.

🔴 **`SettingsSection` se borra.** Era la única consumidora que le quedaba, y
dejar dos maneras de dibujar el mismo bloque es exactamente lo que aquel
componente existía para evitar (§24.2). Nada más lo importaba.

### 38.2 El reparto

| Bloque | Sitio | Por qué |
|---|---|---|
| **Praxis Voice** | fila 1, `lg:col-span-7` | Es lo más alto —pasos, generador y dispositivos— y lo único de esta pantalla que **habilita** algo que no se puede hacer desde ninguna otra parte, que es el criterio con el que ya iba primera |
| **Facturación** | fila 1, `lg:col-span-5` | Con los planes apilados mide casi lo mismo que Voice: la fila queda pareja sin que sobre tarjeta por abajo |
| **Apariencia** | fila 2, banda de una fila | Un interruptor no da para una tarjeta alta |

**La banda de Apariencia no lleva cuerpo.** El `ThemeToggle` entra por `aside`,
así que la tarjeta es una fila: icono, título y frase a la izquierda, control a
la derecha. Se descartó rellenarla —una vista previa del tema, un par de datos
de más— porque habría sido **cambiar un hueco por relleno**, y porque una vista
previa de verdad no se puede pintar: `:root[data-theme='light']` está atado a la
raíz, así que un trozo de interfaz no puede llevar el tema contrario dentro de
una página que ya tiene el suyo. Copiar la paleta clara a mano en un componente
para simularla es justo el error que documenta el aviso de `@theme static`.

### 38.3 Lo que había que ajustar dentro de las tarjetas

- **Los dos planes, apilados.** `BillingSummary` usaba `sm:grid-cols-2`, que
  tenía sentido a lo ancho de la pantalla. En la columna de 5/12 dejaba cada
  plan en ~260 px y el lema partido en tres líneas. ⚠️ Ojo con esto en general:
  `sm:` mira el **viewport**, no el contenedor, así que una rejilla interna no
  se entera de que su columna se ha estrechado.
- **`bg-surface` dentro de `bg-surface` no se ve.** Las tarjetas de plan y las
  filas de dispositivo vinculado tenían el mismo color que la tarjeta que ahora
  las envuelve, y se quedaban solo con el borde. Pasan a `surface-elevated`,
  que es la superficie que existe para esto.
- **El aviso de «no se pudo cargar tu plan» pierde su recuadro**: lo pone
  `PanelCard`, y dos marcos concéntricos para una frase son marco de más.

### 38.4 Verificado

`tsc` limpio en las seis zonas y Biome limpio en todo lo tocado.

⚠️ **Sin pasada de navegador.** La sesión del navegador caducó a mitad de la
revisión y volver a entrar exige la contraseña de la cuenta, así que el repaso
visual de esta pantalla —los dos temas, 390 px y 820 px— queda pendiente de la
próxima sesión con el stack levantado. Lo que sí está comprobado en el navegador
es la pantalla de cuenta (§37.7), que estrena las mismas piezas: `PanelCard`, la
rejilla y el reparto de anchos.

---

## 39. La bandeja de avisos: de lista plana a bandeja de verdad

Este caso no se parecía a §37 ni a §38: aquí no sobraba espacio, sobraba
**indistinción**. Veinte filas iguales, una debajo de otra, cada una con un
icono genérico del tipo, y tres cosas que no se podían hacer: filtrar, saber de
un vistazo cuándo pasó algo, y abrir el aviso sin apuntar a un enlace de 11 px.

### 39.1 Siete colores diciendo dos cosas

Una fila sin leer se teñía —borde y fondo— **del color de su tipo**. Es decir,
el mismo canal visual llevaba dos mensajes a la vez: «esto no lo has leído» y
«esto es una invitación». Con siete tonos en la paleta de tipos, ninguno de los
dos llegaba. Ahora la regla es fija:

| Dónde | Qué dice |
|---|---|
| Fondo, borde y punto de la fila | **si está leído o no** — siempre el mismo violeta |
| Insignia sobre la cara | **de qué tipo es** — ámbar invitación, violeta tarea, rojo expulsión |

Y se mantiene lo que ya estaba bien: **sin leer no es negrita**. Con quince
avisos, media bandeja en negrita no distingue nada. El peso se reserva ahora
para los nombres propios de cada frase.

### 39.2 La cara de quien lo hizo

Un aviso es siempre **alguien haciendo algo**, y la cara identifica antes que la
frase. La fila estrena el avatar del actor —el mismo que esa persona tiene en el
chat y en el tablero— con la insignia del tipo en la esquina, en el sitio exacto
donde `Avatar` pintaría el punto de presencia.

No cuesta ni una petición más: la page ya pedía el perfil de cada actor para
poner el nombre, y solo usaba `firstName`. Sin actor —un aviso del sistema— la
insignia se queda sola y en grande.

⚠️ **El disco de la insignia es del color de la tarjeta y el dibujo del color
del tipo, no al revés.** Con el disco relleno del tono, el dibujo tenía que ir
en `textInverse`, que es blanco en claro y negro en oscuro: blanco sobre el
verde de «invitación aceptada» no se ve, y negro sobre el violeta de «tarea
asignada» tampoco. Al revés, el contraste es el que el design system ya
garantiza para esos tonos como color de texto.

### 39.3 La frase, con los nombres destacados

`describe()` devolvía una cadena con comillas angulares. Ahora es un componente:
la frase va en texto secundario y **quién, qué proyecto y qué tarea** en primario
y peso medio. Separa mejor que un signo de puntuación y deja la lista legible de
un barrido, que es como se lee una bandeja.

### 39.4 Tramos de tiempo

Veinte filas con «hace 2 h», «hace 3 h», «hace 1 d» obligan a leer cada marca
para situarse. La página se reparte en **Hoy / Ayer / Esta semana / Antes**
(`lib/notifications.ts`), con la cuenta de cada tramo a la derecha de su línea.

⚠️ **Los tramos se calculan con el reloj de quien renderiza, que es el
servidor.** Un servidor en UTC y alguien mirando desde UTC−6 pueden discrepar en
la franja de medianoche. Es el mismo trato que ya reciben todas las fechas del
repositorio, y por eso cada fila lleva además **la fecha completa en su
`title`**: el tramo orienta, el `title` resuelve.

⚠️ **Y la marca relativa arranca en absoluta.** `Date.now()` en el cuerpo de un
componente de cliente da un valor en el servidor y otro al hidratar: el
desajuste clásico de las marcas de tiempo. El instante vive en un estado que
empieza en `null` —mientras tanto se pinta la hora absoluta, que no depende de
cuándo se lea— y se rellena al montar, con un latido de un minuto. Uno solo para
la lista entera, en `NotificationList`, y no veinte relojes.

### 39.5 La fila entera es el enlace, y abrirla la da por leída

Antes el destino era un «Ver» de 11 px al lado de la fecha: estaba, pero había
que apuntarle. Ahora la fila entera navega.

⚠️ **Es un `<a>` estirado (`absolute inset-0`), no un `<a>` envolviendo la
fila.** Dentro hay un botón —marcar como leído— y un botón dentro de un enlace
es HTML inválido: el navegador lo saca fuera al parsear y el diseño se desmonta.
Con la capa absoluta, los dos son hermanos y el botón se queda encima con su
`z-10`.

⚠️ **Y el envoltorio del avatar lleva `pointer-events-none`**, porque es
`relative` —lo necesita la insignia— y un hermano posicionado que va después del
enlace se pinta por encima: sin eso, el sitio más grande y más apetecible de la
fila era el único punto muerto.

**Abrir un aviso lo marca como leído**, que es lo que ya se esperaba de una
bandeja: si has ido al sitio del que habla, lo has visto. Se marca y **después**
se navega a mano, con 120 ms de respiro: el destino está en otra zona del
multi-zone, así que el clic es una carga de página completa y dejar la petición
en vuelo la habría cortado a mitad la mitad de las veces. Con `cmd`/`ctrl`/
`shift` no se toca la navegación —eso abre en otra pestaña y esta página se
queda— y basta con lanzar el marcado.

El botón de marcar a mano sigue estando, ahora en el hueco de la derecha, junto
al punto de «sin leer». Aparece al pasar por encima en escritorio y **está
siempre visible en táctil**: `group-hover` no existe sin puntero, y un botón que
solo aparece con el ratón es un botón que en el móvil no está.

### 39.6 El filtro «Sin leer», que el backend ya sabía hacer

`?filtro=sin-leer` se traduce a `unreadOnly=true`, un parámetro que
`FindNotificationsQueryDto` aceptaba desde siempre y que **desde aquí no usaba
nadie**. Vive en la URL: son dos `next/link`, se comparten, el botón atrás hace
lo que se espera y la pantalla sigue siendo un Server Component.

🔴 **Filtrar en el cliente habría sido mentira.** La lista está paginada de 20 en
20: esconder las leídas de la página actual dejaría «3 sin leer» arriba y una
sola fila abajo, con las otras dos en la página 2. Por lo mismo **no hay filtro
por tipo**: `unreadOnly` es el único que el backend sabe aplicar, y un
desplegable de «solo tareas» solo podría recortar lo que ya vino en esta página.

⚠️ **«Todas» no lleva número, y no es un olvido.** `total` viene contado con el
**mismo `where` que la consulta**, así que con `unreadOnly=true` vale lo mismo
que `unread`: pintarlo diría «Todas 3» cuando hay treinta, y solo mientras el
otro filtro está puesto. El de «Sin leer» sí es fiable siempre —`unread` cuenta
la bandeja entera pase lo que pase con el filtro, que es justo para lo que
existe—.

Y **el paginador conserva el filtro**: perder el parámetro al cambiar de página
es el fallo clásico de esto, y aquí saltaría a la vista.

### 39.7 Verificado

`tsc` limpio y Biome limpio, incluidos dos avisos de accesibilidad que este
archivo ya arrastraba: el enlace estirado lleva su nombre dentro (`sr-only`) en
vez de un `aria-label` sobre un enlace vacío, y los iconos decorativos llevan
`aria-hidden` literal —el analizador no ve los atributos que llegan por
propagación—.

⚠️ **Sin pasada de navegador, como §38.4.** La sesión sigue caducada y volver a
entrar exige la contraseña de la cuenta. Queda pendiente mirar en pantalla: los
dos temas, el filtro con y sin resultados, una fila sin destino, el móvil a
390 px y —lo que más me interesa— que abrir una fila la deje marcada al volver.

---

## 40. La rejilla de proyectos: una cara por proyecto

La pantalla funcionaba y era **plana**: doce tarjetas iguales, distinguibles solo
leyendo el título de cada una, que es justo lo que no se hace al buscar algo con
la vista. Y antes de la primera tarjeta, tres líneas de rótulo.

### 40.1 Dos títulos y una cursiva, fuera

La cabecera decía «Proyectos», y debajo había un `h2` de 3xl con «Tus
proyectos» y una frase en cursiva explicando qué lista era. Todo eso en una
pantalla a la que se llega **pulsando «Proyectos» en la barra lateral**. El
título de la cabecera se queda —lo pone `AppHeader`— y lo que decía la frase
—de quién son estos proyectos— se dobló en la línea del contador: «2 proyectos
· tuyos y donde te han añadido». Misma información, un bloque menos.

### 40.2 El monograma, y por qué el color sale del `id`

Cada tarjeta abre con un cuadrado de 44 px con las iniciales del proyecto, en
uno de los seis `serieColors`. Es lo que le da a cada proyecto una cara fija: el
mismo color y las mismas iniciales siempre, y la posición en la rejilla se
aprende sola.

`serieColors` existe **exactamente para esto** —«categorías que no tienen color
propio», medidas para separarse bajo daltonismo y con los mismos hexadecimales
en los dos temas— así que no se inventa una paleta nueva ni se reutilizan los
colores de estado: teñir un proyecto de rojo por azar diría que pasa algo.

⚠️ **El tono sale del `id`, no del nombre.** El `id` es inmutable; el nombre no,
y con el nombre el proyecto cambiaría de color al renombrarlo, que es justo
cuando más falta hace reconocerlo. Las iniciales sí salen del nombre —son texto
y deben decir lo que se ve—, y las calcula `iniciales()` de `Avatar`, que ya
resolvía el caso de una sola palabra.

### 40.3 Lo que la tarjeta dice ahora y antes no

- **De quién es**, en una línea bajo el nombre («Tuyo» / «Te añadieron») en vez
  de gastar una insignia. La insignia se reserva para `SUSPENDIDO`, que es lo
  único que cambia lo que se puede hacer al entrar.
- **Por qué está suspendido.** `suspendedReason` **venía en esta misma
  respuesta** —el `omit` del servicio solo esconde `suspendedBy`— y no se usaba:
  había que abrir el proyecto para leer por qué no responde nada. Y el monograma
  se apaga a gris, porque la tarjeta entera tiene que leerse como «esto está
  parado».
- **Iconos en los contadores** de miembros y espacios, que antes eran dos
  cifras sueltas con su palabra.

⚠️ **La fecha sigue siendo `createdAt`, y no es pereza.** Es por lo que el
backend ordena la lista (`orderBy: { createdAt: 'desc' }`, fijo en
`findAllProjects`), así que la tarjeta y el orden dicen lo mismo. **`updatedAt`
no vale como «última actividad»**: es la marca de la fila del proyecto, se mueve
al renombrarlo o suspenderlo y **no** cuando alguien crea una tarea o comenta —
enseñaría «hace 3 meses» en el proyecto donde más se trabaja.

### 40.4 Buscar dejó de ser un callejón sin salida

🔴 Buscar algo que no existía dejaba un párrafo suelto —«Ningún proyecto coincide
con X»— y **ninguna forma de volver**: había que borrar el campo a mano y pulsar
Enter en un formulario vacío. Ahora:

- el vacío es un estado con su icono, su explicación y un botón «Ver todos los
  proyectos»;
- el contador de arriba cambia a «N resultados para «X» · Ver todos»;
- el campo estrena lupa y una equis para limpiar **que sí navega**.

⚠️ El campo pasa de `type="search"` a `type="text"` a propósito: la equis nativa
del navegador **no dispara el submit**, así que vaciaba el campo y dejaba la
lista filtrada como estaba. La nuestra limpia y navega.

Se mantiene que **se busca al pulsar Enter**, no al teclear: con el filtrado en
el servidor y la lista paginada, cada pulsación sería una consulta al gateway y
una navegación del App Router; un rebote lo bastante largo para no castigar se
siente roto —escribes, no pasa nada, y cuando ya has dejado de mirar la lista
salta—.

### 40.5 🔴 El icono que se pintaba debajo del campo

Merece su propio apartado porque contradice lo que dice el orden de pintado y
costó encontrarlo. La lupa va en un `<span>` absoluto dentro del formulario, y
el `<input>` **no** está posicionado: por CSS, el positioned debería quedar
encima. No quedaba. El fondo sólido del campo lo tapaba entero.

Se vio midiendo en el navegador: el icono estaba en el DOM, con su color
(`rgb(86,92,114)`), en sus 16×16 px exactos y sobre el campo… e invisible en la
captura. Con `z-index: 10` aparece. Lo mismo vale para el botón de limpiar.

De paso, el icono estaba en `text-disabled`, que en tema claro es #a4a9ba sobre
un campo #eceef5: **1,7:1**. Un adorno puede permitirse ser tenue; algo que dice
para qué sirve el campo, no. Pasa a `text-secondary`.

### 40.6 El botón de crear, en dos formas

`CreateProjectDialog` estrena el «+» en su disparador —el mismo botón lo montan
la cabecera de Proyectos y los dos estados vacíos, así que el icono se escribe
una vez— y una forma nueva: **`triggerVariant="tarjeta"`**.

No es un color de botón, es otra forma: una tarjeta de borde discontinuo, del
alto de sus vecinas, que ocupa la última celda de la rejilla. Con dos proyectos
y tres columnas ese hueco existía igual y no decía nada; ahora el gesto de crear
está donde se está mirando y la fila queda cerrada.

Entra en `ProjectGrid` como **slot** (`crearSlot`) y no como props: el diálogo
necesita las tres Server Actions de la zona, y quien las tiene es la page. Un
render-prop no habría servido —`ProjectGrid` es un Server Component y una
función no cruza esa frontera—, y por eso la variante es un valor y no un
`renderTrigger`.

### 40.7 Lo que **no** se hizo, y por qué

**No hay ordenación.** `FindProjectsQueryDto` acepta `sortBy` y `sortOrder`, el
gateway los reenvía… y `findAllProjects` tiene el `orderBy` **escrito a mano**
(`{ createdAt: 'desc' }`) y no los mira. Un selector de «ordenar por nombre»
habría cambiado la URL, recargado la lista y devuelto exactamente el mismo
orden: la peor clase de control, el que parece funcionar. Anotado en
PENDIENTES-BACKEND §23.

**No hay filtro «solo los míos».** Se resolvería con `ownerId`, que el DTO del
microservicio tiene pero el gateway **no** expone a propósito: aceptar un
`ownerId` de la query sería un interruptor para mirar los proyectos de otro. Con
la lista paginada, filtrarlo en el cliente sería el mismo engaño que ya se
descartó en la bandeja de avisos (§39.6). La línea «Tuyo / Te añadieron» de cada
tarjeta cubre el 90 % de la necesidad sin mentir.

### 40.8 Las caras del equipo en cada tarjeta

«4 miembros» dice cuántos son; las caras dicen **quiénes**, que es lo que se
quiere saber para reconocer un proyecto de un vistazo. Es el mismo gesto que ya
hace la tarjeta de tarea con los encargados —mismo tamaño, mismo solape, tope de
cuatro y «+N»— así que no hay un idioma nuevo que aprenderse. Tú vas la primera
y con el círculo rojo de `Avatar`, que significa «eres tú» en todo el producto.

🔴 **Y cuesta N+1 peticiones. Es una decisión, no un descuido.**

`GET /projects` devuelve `_count.members` y **ninguna persona**, así que poner
caras obliga a pedir `GET /projects/:id/members` por proyecto —doce en una
página— y después el perfil de cada id, que es donde vive la foto. No hay ruta
que lo traiga junto (PENDIENTES-BACKEND §24, abierto con lo que haría falta).

Se acota como se puede, y se dice:

| Medida | Efecto |
|---|---|
| Las doce, **en paralelo** | Dos saltos de red de profundidad, no doce |
| Ids **deduplicados entre todos los proyectos** antes de pedir perfiles | La segunda tanda es del tamaño del equipo, no de la suma de miembros: en un equipo real las mismas personas están en casi todos |
| Cada petición con su `catch` | Si el equipo de un proyecto no se puede leer, esa tarjeta **vuelve al número de miembros** — exactamente lo que enseñaba antes |

⚠️ **El «+N» sale de `_count.members`, no de las caras resueltas.** Si un perfil
no se pudo leer, su cara se cae de la lista pero sigue contando: enseñar «+1»
cuando faltan dos sería mentir sobre el tamaño del equipo por un fallo de red.

Sin punto de presencia, igual que en las tareas: cuatro círculos de 24 px
solapados y el punto de cada uno taparía la cara del siguiente.

### 40.9 El diálogo de crear: sigue siendo diálogo, y por qué

Se planteó sacarlo del modal —incrustarlo en la propia pantalla— y se descartó
con cuatro motivos que están escritos en el propio componente: lo montan **dos
zonas**, el modo asistido pinta un árbol que empujaría la rejilla ~600 px, crear
es una tarea modal de verdad (se termina o se cancela) y el `<dialog>` nativo ya
da atrapado de foco, Escape y fondo inerte. Una ruta propia (`/projects/new`)
habría obligado al panel a navegar duro a otra zona.

Lo que sí se rehízo es **lo de dentro**, que tenía el mismo mal que las demás
pantallas de esta tanda: el diálogo es `xl` porque lo pide el árbol del asistente,
y el formulario en blanco eran **dos campos sueltos en 48 rem**.

- **Las dos formas de empezar, con lo que hace cada una escrito.** Eran dos
  pestañas de dos palabras y elegir bien exigía haberlas probado; ahora cada una
  es una tarjeta con su icono y una línea. ⚠️ El icono del modo manual es una
  **hoja**, no un «+»: `Sparkle` es una estrella de cuatro puntas y a 16 px se
  lee casi igual que un más, así que las dos opciones parecían el mismo icono.
- **Vista previa en vivo**, ocupando la columna que sobraba: el cuadrado con las
  iniciales, el nombre y la descripción recortada, como se verá en la rejilla.
  ⚠️ **El cuadrado va en gris.** En la rejilla el tono sale del `id`, y el `id`
  no existe hasta crear el proyecto: enseñar un violeta y que salga verde sería
  prometer algo que no depende de nadie. Se pinta neutro y una línea explica que
  el color se asigna al crearlo —que además es cómo se entera uno de que los
  proyectos tienen color—. Las iniciales salen de `iniciales()`, **la misma
  función** que usa la tarjeta.

### 40.10 Verificado

En el navegador, con el stack levantado y en los dos temas:

| Caso | Resultado |
|---|---|
| Rejilla con dos proyectos | Monogramas de tonos distintos, caras del equipo con foto, tarjeta de crear cerrando la fila |
| Caras | 2 y 4 miembros, con las fotos reales y las iniciales de quien no tiene |
| Diálogo desde la cabecera **y** desde la tarjeta fantasma | Abre igual por los dos caminos |
| Vista previa | Escribir «Rediseño del panel» da «RD», «Tuyo» y «Sin descripción» al instante |
| Cambiar a «Con el asistente» | La otra tarjeta se marca y sale el compositor del brief, sin que el diálogo cambie de ancho |
| Tema oscuro | Monogramas, caras y lupa correctos |
| 390 px (en iframe) | Una columna, sin desbordamiento, la lupa y las caras se ven |
| Lupa con el `z-10` | Visible; era lo que quedaba pendiente de §40.5 |

Y de paso, con la misma sesión, se saldó lo que quedaba a deber de las dos
pantallas anteriores: **Configuración** (§38) con sus dos tarjetas parejas y la
banda de Apariencia, y **la bandeja de avisos** (§39) con sus tramos, sus caras,
sus insignias de tipo y el filtro — comprobando además que la marca de tiempo
**arranca absoluta y pasa a relativa al hidratar**, que es justo lo que §39.4
decía que tenía que pasar.

---

## 41. Las sesiones se cerraban solas, y eran tres cosas

Se reportó como «se me cierra la sesión a cada rato sin hacer nada», y era
literalmente eso: nada de lo que hacía quien lo sufría tenía que ver. Tres
causas distintas, apiladas, ninguna con un error a la vista.

Es la primera vez que esta tanda toca `apps/backend/`, **con autorización
expresa**, y queda registrado también en PENDIENTES-BACKEND.

### 41.1 🔴 El limitador del login, cerrando sesiones

`/auth/refresh` llevaba el mismo apretón que `login` y `register`: **10 por
minuto y por IP**. Pero a esa ruta **no la llama una persona**: la llama
`refresh-proxy.ts` desde el middleware de cada zona, en cada navegación en la
que al access token le queda menos de un minuto. Las seis zonas salen por la
misma IP —en desarrollo todo es `::1`— así que las diez se gastan entre pestañas
sin que nadie note nada.

Y al pasarse, el gateway responde **429**. El proxy tenía esto:

```ts
if (!response.ok) return { estado: 'rechazado' };   // ← 429 entraba aquí
```

…y un rechazo **borra las dos cookies**, porque significa «tu refresh ya no
vale». Un límite de cortesía convertido en cierre de sesión.

Arreglado por los dos lados, y el del frontend es el que importa:

- **Solo un 401 o un 403 cuentan como sesión muerta.** Un 429, un 500 o un
  gateway a medio arrancar caen en `inalcanzable`, que no toca las cookies y
  reintenta en la siguiente navegación. El propio archivo ya documentaba que
  «no pude preguntar» y «no vales» son distintos; faltaba aplicarlo al status.
- El límite de la ruta sube a **120/min**. Adivinar un refresh token no es un
  ataque realista —es un JWT firmado—, así que ese apretón no protegía de nada
  que la firma no protegiera ya.

### 41.2 🔴 Una sola sesión por cuenta

La sesión vivía en `auth:session:<userId>` con **un solo** refresh token dentro,
y cada entrada lo sobrescribía. El recorrido completo del síntoma:

> Entras en el portátil. Al rato entras en el móvil, o en otro navegador, o
> vuelves a entrar en incógnito. El refresh guardado pasa a ser el de la última
> entrada. El portátil no se entera **hasta que su access token cumple 15
> minutos**: entonces renueva, recibe «refresh token no válido», y el proxy
> —haciendo lo correcto— borra las cookies. Te ha echado otra entrada tuya, con
> un cuarto de hora de retraso para que no se pueda relacionar una cosa con la
> otra.

Ahora la clave es un **hash con un campo por sesión**: `auth:sessions:<userId>`
→ `{ <jti>: <refreshToken> }`. El `jti` viaja dentro del propio refresh token,
así que quien lo presenta dice **cuál** de las sesiones es.

| Gesto | Antes | Ahora |
|---|---|---|
| Entrar desde otro sitio | Echaba al anterior | Conviven |
| Cerrar sesión | Cerraba en todos lados | Cierra solo ese dispositivo (`HDEL`) |
| Suspender o borrar la cuenta | `DEL` | `DEL` — sigue cerrando todas de un golpe |
| Cambiar la contraseña | `DEL` | `DEL` — sigue cerrándolas todas, a propósito |
| Comprobar que hay sesión | `GET` | `EXISTS` |

⚠️ **El nombre de la clave cambia** (`auth:session:` → `auth:sessions:`) a
propósito: la vieja guardaba una cadena y `HSET` sobre una clave de tipo cadena
responde `WRONGTYPE`. Con un nombre nuevo no hay migración que escribir y las
viejas caducan solas. **El precio es una entrada más para todo el mundo, una
sola vez.** Los tres sitios que borraban la clave vieja —suspender, borrar
cuenta, restablecer contraseña— están actualizados; si se olvida uno, suspender
a alguien deja de echarlo.

### 41.3 ⚠️ El plazo no era deslizante, y Redis no guardaba nada

- El TTL de la sesión se ponía **al entrar y no se tocaba más**: caducaba a los 7
  días exactos de la entrada aunque hubieras estado dentro cinco minutos antes.
  Ahora cada renovación lo estira, que es lo que cualquiera espera de
  «recuérdame».
- ⚠️ **El tope duro sigue siendo el `exp` del refresh token**, que no se rota:
  7 días desde que se emitió. Estirar la clave de Redis no alarga un JWT ya
  firmado. **Rotar en cada renovación se descartó**: el proxy de cada zona
  renueva en cada navegación y dos pestañas pueden pedirlo a la vez con el mismo
  token — con rotación estricta, la segunda se queda fuera. Cambiar un cierre
  aleatorio por otro no es arreglarlo.
- 🔴 **Redis no tenía volumen.** Guarda las sesiones, no solo caché, y vivían en
  la capa del contenedor: recrearlo —un `down`, tocar el compose, una
  actualización de Docker— echaba a todo el mundo a la vez. Ahora tiene
  `redis_data` y `--appendonly yes`, para que sobrevivan también a un corte y no
  solo a los snapshots cada cinco minutos.

### 41.4 De 1 + 12 + K peticiones a 2

Lo que §40.8 dejó anotado como deuda, cerrado por donde tocaba:

| | Antes | Ahora |
|---|---|---|
| Lista | `GET /projects` | igual, y ya trae `members` con los 4 primeros ids |
| Equipos | `GET /projects/:id/members` ×12 | — |
| Perfiles | `GET /users/:id` ×K | `GET /users?ids=a,b,c` ×1 |

`user_find_by_ids` **ya existía** en credentials-service —lo usaban el panel de
administración y alexa-service— y lo único que faltaba era la puerta HTTP en el
gateway. Responde `{ items, total }`, la misma forma que el listado, para que
quien la consume no tenga que desenvolver dos formas según el parámetro que
mandó.

Sigue degradando: si el directorio no se puede pedir, cada tarjeta vuelve al
número de miembros, que es lo que enseñaba antes de que hubiera caras.

### 41.5 Pendiente de probar en vivo

Compila entero —gateway, credentials, projects y las seis zonas— pero **esto no
se ha ejercitado contra el stack**: hay que reiniciar el backend (los servicios
leen `@praxis/contracts` desde `dist/`) y comprobar en el navegador

1. entrar en dos navegadores a la vez y que ninguno eche al otro;
2. que cerrar sesión en uno **no** cierra el otro;
3. que suspender una cuenta sigue echándola de todas partes;
4. que la rejilla de proyectos hace dos peticiones y las caras salen igual.

Y recordar que al desplegarlo **hay que volver a entrar una vez** (§41.2).

---

## 42. PRAX sin proyecto, y con memoria de lo que le das

> Etapa **R6** del plan de rediseño. Dos capacidades que se pidieron juntas
> porque la segunda sin la primera sale coja: contarle un proyecto con tres PDF
> y que dos turnos después no se acuerde de nada es exactamente el caso que
> venía a cubrir.

### 42.1 Un adjunto se moría en su turno

Los bytes de un archivo viajan con la pregunta y **no se reenvían nunca más** —
hacerlo multiplicaría el coste por la longitud del hilo y acabaría comiéndose la
ventana entera—. Así que dos preguntas después PRAX hablaba de un documento que
ya no tenía delante, y la conversación quedaba mintiendo.

Estaba escrito como decisión consciente en `assistant.service.ts` (`pregunta:
payload.message`, «se guarda lo que la persona escribió, no el mensaje con los
archivos pegados») y el motivo era bueno: un turno con cuarenta mil caracteres de
un `.md` dentro no se lee como conversación.

**La salida es guardar el texto, no el archivo.** Una columna `extract` en
`Attachment`, calculada **una sola vez al subir**, y `historial()` la vuelve a
poner al armar el hilo. El mensaje sigue guardando lo que la persona escribió, la
burbuja se sigue leyendo, y el modelo vuelve a tener el documento delante.

| Tipo | Extracto | Cuándo |
|---|---|---|
| `.txt`, `.md` | el UTF-8 decodificado | al subir. Gratis y determinista |
| PDF | su capa de texto (`unpdf`) | al subir |
| PDF escaneado | ninguno | no tiene capa que sacar; no es un error |
| Imagen | **ninguno** | ver abajo |

⚠️ **El PDF sigue viajando nativo en el turno en el que se adjunta.** Pasarlo a
texto plano *ahí* sería perder maquetación, tablas y figuras que Gemini sí lee.
El extracto es para *después*.

### 42.2 Las imágenes se quedan, y la llamada para describirlas se murió

El primer diseño las describía con una **segunda llamada a Gemini** cuyo
resultado se guardaba. Se descartó entero: era una llamada más, un modo de fallo
más, una columna con estados y una pregunta abierta sobre si eso gastaba cuota.

Lo que la sustituye no cuesta nada. **En el turno en el que se adjunta una imagen
el modelo ya la tiene delante, y su respuesta sí se guarda**, así que basta con
que el prompt le exija contar lo que ve (regla 17). La descripción queda en su
propio mensaje y se reinyecta por el camino que ya existe.

⚠️ Y el marcador de hecho que iba a guardarse —`[imagen adjunta: captura.png]`,
como red de seguridad para que PRAX no negara después que hubo una imagen—
**también se cayó, al implementarlo**: se compone de `filename` y `mimeType`, que
están siempre. Una columna con un dato derivado de otras dos es una columna que
se va a quedar desincronizada.

### 42.3 El presupuesto no es un ajuste fino

Con los topes de hoy —3 adjuntos por mensaje, 40 000 caracteres por archivo— un
hilo de 12 turnos reinyectaría hasta **360 000 caracteres en cada pregunta**. Eso
no es un riesgo: es una certeza de reventar la ventana y la factura.

- Se **almacena** hasta 40 000 caracteres por archivo.
- Se **inyecta** hasta **24 000 en total** (`ASSISTANT_EXTRACT_BUDGET_CHARS`),
  del mensaje más reciente hacia atrás.
- Lo que se recorta **se avisa dentro del propio prompt**. Un recorte mudo hace
  que el modelo hable con confianza de un documento del que solo ha visto el
  principio, que es la peor forma de equivocarse aquí.

**Guardar más de lo que se inyecta es a propósito**: subir el dial luego no
obliga a volver a extraer nada.

⚠️ Y el orden de las comprobaciones importa: primero «¿cabe entero?», después el
mínimo útil. Al revés —que es como se escribió— un extracto corto se descartaba
«por espacio» teniendo sitio de sobra.

### 42.4 Hablar sin ningún proyecto

`AssistantChat` era literalmente `{!projectId ? null : …}`: sin proyecto no había
compositor. El argumento era correcto para lo que había —el turno iba a
`POST /projects/:id/assistant/chat` y sin proyecto no había a dónde mandarlo— y
lo que cambió no es el criterio, es que **ahora sí hay dónde**.

`POST /me/assistant/chat`, solo con `JwtGuard`. Sin proyecto no hay briefing, ni
miembros, ni chat de equipo, ni permisos que filtrar — no porque se ahorren, sino
porque no existen.

#### Las reglas del prompt llevan ámbito, y no hay dos listas

Decirle a una conversación sin datos que «los numeros salen del CONTEXTO» es peor
que no decir nada: le hace buscar un bloque que no existe. Pero la mitad de las
reglas —el tono, el español de la región, escribir siempre algo, no dejar
callejones sin salida, que las herramientas no ejecutan— vale igual en los dos
modos.

⚠️ **Duplicarlas habría sido garantizar que PRAX hablara distinto según hubieras
elegido proyecto o no.** Así que la lista es una y cada regla dice dónde aplica
(`ambito: 'siempre' | 'proyecto' | 'sin-proyecto'`). El número que ve el modelo se
calcula **después de filtrar**, así que en cada modo salen del 1 al N sin huecos.

#### Tres herramientas donde había doce

Ninguna sale de un permiso, porque ninguna toca datos de ningún proyecto:
`proponer_pregunta`, `proponer_abrir_proyecto` y `proponer_plantilla`.

⚠️ **La plantilla sigue fuera de `herramientasPara`**, y el motivo de §36.1 no ha
cambiado: declarársela en una conversación sobre un proyecto existente dejaría
que a mitad de una charla sobre tareas propusiera rehacerlo entero. Sin foco ese
riesgo no existe —no hay nada que rehacer— y es justo la conversación para la que
se escribió.

### 42.5 Adoptar un proyecto a mitad

Dos caminos, y los dos conservan el hilo:

1. **PRAX propone abrir uno de los tuyos.** La tarjeta es un sí/no; aceptar
   navega a `?p=<slug>&c=<conversación>` y a partir de ahí la conversación es de
   ese proyecto, con briefing y con las doce herramientas.
2. **Se crea uno desde una plantilla.** Al terminar, el resumen ofrece seguir ahí
   mismo con el proyecto recién creado.

Lo que impide que el modelo se invente un proyecto no es el prompt: el gateway
resuelve la lista con la sesión de quien pregunta —`GET
/projects?permission=canViewReports`, la misma consulta que ya pinta el selector—
y la propuesta **se valida contra ella**.

⚠️ **Una conversación con foco no vuelve a no tenerlo.** Un turno sin proyecto
sobre una conversación que ya lo tiene responde **409**: solo puede venir de una
pestaña descolocada, y aceptarlo en silencio se respondería sin briefing — PRAX
diría que no tiene datos de un proyecto que la pantalla enseña como cargado, y no
habría forma de entender por qué.

### 42.6 La invariante de §26.1, otra vez intacta

Aceptar la plantilla llama a `commons/template/apply.ts`, que ya existía para el
diálogo de proyecto nuevo: `POST /projects` y después las rutas de etiquetas,
roles, espacios, tableros y columnas, **una a una, con la sesión de quien pulsa**.
Ninguna ruta de escritura nueva.

Y la tarjeta del chat **no crea de un clic**: su botón abre la revisión del plan,
que es el mismo componente que usa el diálogo. Un «Aceptar» que montara veinte
objetos de golpe sería la misma capacidad con el paso de revisión quitado.

### 42.7 Cuatro cosas que solo se vieron construyéndolo

| Qué | Por qué importa |
|---|---|
| 🔴 El resolve de propuestas es **una ruta de proyecto** | Aceptar o descartar cualquier tarjeta sin foco daba **404**. Hermana en `/me/assistant/proposals/:id/resolve` |
| 🔴 `maxOutputTokens: 2048` era **global** | Por ahí pasa la plantilla: un plan grande llegaba cortado, con `finishReason: MAX_TOKENS` y el JSON a medias. Por fuera, «no he sabido responder» |
| La tarjeta de abrir proyecto **anota su decisión ella misma** | Las demás lo dejan en un efecto de `Marco`; aquí aceptar navega, y una petición lanzada desde un componente que se desmonta a la vez es una carrera que se pierde la mitad de las veces |
| El proyecto recién creado **no está en la lista de la pantalla** | Se renderizó antes de existir, así que adoptarlo se quedaba en un `return` silencioso. Por eso el `slug` viaja con la propuesta aceptada |

Y un 🐛 que ya estaba: `text/x-markdown` estaba en la lista de tipos permitidos
—con un comentario explicando que Safari y algunos Linux declaran así un `.md`—
pero **no** en la de los que se pegan como texto. El mismo archivo entraba como
texto en Chrome y como binario en Safari.

### 42.8 Lo que **no** está verificado

🔴 **Nada de esto se ha probado contra el modelo**: la clave de Gemini está sin
crédito. Lo que sí está comprobado:

- la migración, aplicada sobre la base real;
- la extracción, con un PDF de verdad (2300 caracteres), un `.md`, una imagen y
  un PDF corrupto —que registra el aviso y devuelve `null` sin tumbar la subida—;
- el reparto del presupuesto, con dos mensajes y tres adjuntos;
- typecheck de las siete zonas y de los dos servicios, y `next build` de
  `assistant-front`.

Lo que falta por ver en vivo es lo que solo dice el modelo: si con la regla 17
narra de verdad las imágenes, si sin foco propone abrir el proyecto correcto, y
si una plantilla pedida en mitad de una conversación sale tan buena como la que
sale del formulario, donde el brief se escribe de una sentada.

---

## 43. Lo que cuesta un turno del asistente, medido

> Sale de una pregunta buena: «1,6 M de tokens de entrada en 56 peticiones,
> ¿está bien o mal?». No había forma de responderla sin medir, así que se midió
> el prompt real contra la base real.

### 43.1 La vara de medir, que es lo que faltaba

| Tipo de sistema | Tokens de entrada por mensaje |
|---|---|
| Chatbot sin contexto | 500 – 2 000 |
| Asistente con búsqueda (RAG) | 3 000 – 8 000 |
| **Agente con inventario de trabajo — este** | **10 000 – 30 000** |
| Agente de programación | 50 000 – 200 000 |

A tarifa de gama Flash eso son **céntimos por conversación**. El gasto nunca fue
el problema; el problema era que **no tenía techo**.

### 43.2 Dónde iba cada token, antes de tocar nada

Sobre el proyecto de demostración —186 tareas, el caso malo—:

| Bloque | Tokens |
|---|---|
| Reglas + andamiaje | 2 500 |
| Briefing | 23 100 |
| — de ellos, `tareas` | **20 900** |
| Declaración de herramientas | 3 700 |
| **Total por turno** | **29 300** |

El dato que lo decidió todo: **de los 449 caracteres que ocupaba una tarea, solo
55 eran texto**. El resto, UUIDs y nombres de clave. Y 116 de las 186 estaban
cerradas, viajando enteras en cada mensaje.

### 43.3 Los cuatro recortes

1. **Una tarea cerrada viaja en versión corta** —id, título, columna—. Se la
   puede seguir nombrando, contando, reabriendo y borrando, que es todo lo que se
   hace con trabajo terminado. Repartir, clasificar, priorizar o marcar pasos son
   gestos sobre trabajo vivo.
2. **`boardId` no sale del briefing.** El modelo nombra el tablero por su nombre
   y coloca por `columnId`, que ya lo identifica: eran 47 caracteres por tarea
   pagados por un dato que nadie lee.
3. **La descripción se acota a 500 caracteres**, avisando del corte. Era el único
   campo sin techo de todo lo que viaja en cada turno.
4. **El inventario entero tiene presupuesto** (`INVENTARIO_MAX_CHARS`, 45 000
   caracteres). En caracteres y no en filas por lo mismo que en los adjuntos: una
   tarea abierta con encargados y checklist cuesta el doble que una cerrada.

| | inicio | tras 1–3 | con techo |
|---|---|---|---|
| `tareas` | 20 900 | 13 900 | **10 700** |
| **Total por turno** | **29 300** | 22 500 | **19 300** |

Y lo que de verdad cambia: **a partir de aquí un proyecto de mil tareas cuesta lo
mismo que uno de doscientas**.

### 43.4 ⚠️ Un recorte mudo es peor que no recortar

`task_inventory` devuelve `{ tareas, omitidas }` y el briefing propaga
`tareasOmitidas` cuando hay alguna. La regla 5 del prompt le prohíbe entonces
decir «esas son todas».

Sin eso, el modelo respondería con total seguridad sobre una lista que alguien le
cortó por detrás — y esa es la clase de error que nadie detecta, porque la
respuesta suena igual de bien.

Lo mismo vale para las cerradas abreviadas: el prompt dice que vienen sin detalle
y que, si se lo piden, **diga que no lo tiene delante en vez de suponerlo**.

### 43.5 Lo que NO se hizo, y por qué

**La caché de contexto.** Es el siguiente lever y el único que queda grande: los
modelos son sin estado, así que toda conversación se reenvía entera en cada
turno —eso lo hacen ChatGPT, Claude y Gemini por igual— pero el proveedor puede
tener cacheado el trabajo de procesar un prefijo idéntico y cobrarlo mucho más
barato.

No se hizo **a ciegas**: exige conocer los mínimos y el ciclo de vida del
proveedor para el modelo concreto, y no se puede verificar nada con la clave sin
presupuesto. Queda como R7 en el plan de rediseño, con lo que habría que hacer.

---

## 44. Análisis: filtros, cartera y un constructor que no necesita a PRAX

La etapa R4 del [plan de rediseño](PLAN-REDISENO.md), cerrada. Cuatro cosas que
la sección no tenía y una que tenía mal.

### 44.1 Los filtros, en las ocho rutas y en el `WHERE`

`from`/`to`, `boardId`, `assigneeId`, `labelId` y `priority`. Un solo DTO
—`ReportFiltersQueryDto`— validado por el gateway en las siete rutas sueltas y
en el paquete, y aplicado en las siete consultas agregadas de `StatsService`.

**Por qué un DTO compartido y no un parámetro por ruta.** Con los filtros metidos
ruta a ruta, la pantalla acabaría pudiendo filtrar el flujo acumulado por tablero
pero no la instantánea, sin nada que explicara la diferencia. Un filtro que está
en unos gráficos y no en otros no se lee como una limitación técnica: se lee como
que el gráfico que no filtra está mal.

**El tablero no hubo que traducirlo a columnas.** Parecía que sí —los tableros
viven en projects-service y aquí se agregan tareas— pero `Task` guarda `boardId`
además de `columnId`, y `TaskEvent` también. Comprobarlo antes ahorró un cruce
contra projects-service en la ruta más pedida de la sección.

#### 🔴 Los filtros van en la clave de Redis, y el `from` derivado de `days` no

Las dos mitades hacen falta y las dos fallan en silencio:

- **Sin los filtros en la clave**, quien mira el flujo de un tablero concreto deja
  su resultado guardado bajo la clave del proyecto entero, y el siguiente en
  entrar —filtre o no— ve el gráfico de otro durante los 60 s de la caché. No hay
  error: hay un gráfico plausible y equivocado.
- **Con el `from` derivado de `days` dentro**, la clave cambia cada milisegundo
  —es «ahora menos sesenta días»— y ningún informe vuelve a acertar en caché
  jamás. Se ve como que la caché dejó de funcionar.

`claveDeFiltros` vive en el mismo archivo que el DTO para que un filtro nuevo se
añada a los dos sitios a la vez.

#### ⚠️ Un tramo demasiado ancho se rechaza; `days` se recorta

Son dos formas de pedir la misma ventana y se tratan distinto a propósito. Quien
escribe `?days=100000` está pidiendo «todo», y devolverle 365 días es lo que
quería. Dos fechas son una pregunta concreta —«del 1 de enero al 30 de junio»— y
estrecharla por detrás devuelve un gráfico que se lee como su respuesta sin
serlo. Es la regla de §43: **un recorte mudo es peor que no recortar**.

#### ⚠️ `from`/`to` no acota lo mismo en todos los informes

Y no puede, porque no miden lo mismo:

| Informe | El tramo acota | Por qué |
|---|---|---|
| `snapshot`, `blocked`, `people` | `createdAt` | Miden **estado de ahora**. Un tramo solo puede querer decir «de lo que entró en él» |
| `cycle-time`, `forecast` | `completedAt` | Miden lo que se cerró |
| `flow` | `occurredAt` | Mide movimientos |
| `weekly` | **es el eje** | Qué semanas salen, no qué tareas cuentan |

Los cuatro devuelven un gráfico plausible con cualquier criterio, que es la razón
de que la tabla esté escrita en `StatsService`.

#### ⚠️ Y el reparto se acota a la dimensión filtrada

Filtrar por una responsable devolvía un reparto **por persona** con tres: la suya
y las de quien compartiera tarea con ella, con un 1 al lado. Medido:
`22222222:62` junto a `11111111:1` y `33333333:1`. Lo mismo por etiqueta —pedir
«frontend» daba 45 de frontend y otras tres etiquetas con 1, 6 y 2—.

Las tareas seleccionadas estaban bien; el problema era la dimensión del reparto:
las dos relaciones son de muchos a muchos. En la pantalla eso se lee como que el
filtro **no se aplicó**, y un filtro que funciona pareciendo roto es peor que uno
que no está. Lo que se pierde es el cruce —«de lo de frontend, cuánto es
urgente»— y se pierde a propósito: es una pregunta de dos dimensiones sobre un
gráfico que tiene una.

#### La barra, y su `key`

Los filtros viven en la URL, como en Administración: «las urgentes del tablero de
diseño» es un enlace que se pega en un mensaje. Sin botón «Aplicar», porque desde
R4.2 un cambio de filtro cuesta **una** petición —la misma que abrir la pantalla—
y un botón aparte solo crea el estado en el que la pantalla enseña unos números y
los controles dicen otra cosa.

⚠️ **`AnalysisFilters` lleva una `key` atada a los filtros puestos.** Los dos
selectores de fecha no se controlan desde fuera y en una navegación suave del App
Router no se desmontan: «Quitar filtros» dejaba la URL limpia y el campo seguía
enseñando la fecha.

### 44.2 La cartera — `GET /me/reports/portfolio`

Una fila por proyecto con lo que hace entrar: abiertas, vencidas, sin asignar,
paradas y el ritmo de esta semana contra la anterior. Cuelga de `/me` porque no
hay proyecto en la ruta contra el que comprobar nada, y **la línea de acceso es
la lista**: el gateway pide los proyectos con `canViewReports` y agrega solo
esos.

**Dos consultas, no dos por proyecto.** Llamar a `snapshot` y `sinMovimiento` por
cada uno habría hecho que quien lleva doce pagara veinticuatro agregaciones para
pintar una tabla que se lee en cinco segundos. Es el cálculo de R4.2
multiplicado por cuántos proyectos lleve cada cual.

⚠️ **Se recorre `projectIds`, no el resultado del `GROUP BY`**: un proyecto sin
ninguna tarea no sale de una agrupación, y desaparecer de la cartera se lee como
que no tienes acceso.

⚠️ **No se calcula ninguna variación del ritmo**, solo los dos números. La semana
en curso está a medias y un lunes cualquier comparación con siete días completos
da un «−80 %» falso dicho con seguridad. En el informe semanal de un proyecto eso
se resuelve mandando también el ritmo diario de las dos; aquí no cabe.

⚠️ **`/reports/cartera` puede quedar oculta por un proyecto con ese slug.** Es una
ruta estática hermana de `[[...id]]` y Next da prioridad a la estática. Es el
patrón que ya usa `projects-front` con `tablero` y `tarea`; el arreglo de verdad
—reservar esos slugs— está en PENDIENTES-BACKEND §21.

### 44.3 El constructor de gráficos

Diez métricas por cinco formas estaban **enteras detrás de una conversación**.
Ahora se eligen de dos desplegables, sin modelo y sin cuota. Los dos caminos se
quedan: PRAX sigue siendo el atajo para quien ya sabe qué preguntar.

**Produce exactamente lo mismo que la propuesta del asistente** —el mismo
`ReportChartSpec`, la misma validación, la misma ruta de guardado—. Si
divergieran, un gráfico hecho a mano y otro pedido hablando podrían dibujar
cosas distintas bajo el mismo título.

**Los desplegables no ofrecen lo imposible.** Las formas salen de
`METRICAS[metrica].formas`, y el rango, el top N y «solo vencidas» solo aparecen
si esa métrica los acepta. Un conjunto cerrado que deja componer combinaciones
inválidas y luego las rechaza es un formulario con trampas.

⚠️ **Cambiar de métrica rehace la forma y el título.** Si no, queda puesta una
forma que la métrica nueva no acepta y el error solo sale al pulsar «Añadir»; y
un gráfico de cierres semanales rotulado «Tareas por columna» se lee mal y nadie
lo revisa.

### 44.4 🔴 El lienzo de partida no se podía tocar

`lienzoPorDefecto()` nacía con los ids `defecto-resumen`, `defecto-columna` y
`defecto-prioridad`, y `ReportLayoutDto` valida cada `id` con `@IsUUID`. El
lienzo de R4.6 se pintaba bien y **el primer arrastre respondía 400**: la
disposición volvía atrás sola y la pantalla decía «Validation failed».

No aparecía al abrir —el lienzo de partida se pinta sin guardar nada— sino al
mover algo, que es el gesto siguiente. Y ni el typecheck ni `next build` podían
verlo: los dos lados son `string`. Salió al ejecutarlo contra el backend
levantado, que es la moraleja entera de este apartado.

Ahora son tres UUID constantes, y constantes a propósito: `lienzoPorDefecto()`
corre en el servidor en cada carga, y con `crypto.randomUUID()` dos pestañas del
mismo proyecto guardarían dos lienzos distintos y ganaría el último.

### 44.5 Lo que sube a `commons` en esta etapa

`SelectorDeFecha` y `DataTable`, las dos con la regla de siempre: las usan dos
zonas. Mudanzas sin cambios de lógica y con sus comentarios intactos —los de
`DataTable` sobre la pista `auto` y el `minmax(0, Nfr)` son media razón de que
ese componente exista—.

### 44.6 R4.8: no hacen falta tablas para `reports-service`

Estaba escrito como «si R4.2 o R4.4 las piden». No las piden: R4.2 agrupa
peticiones que ya existían y R4.4 agrega en tasks-service, donde están los datos.
El servicio sigue **sin base de datos**, que es lo que se decidió en §25.6, y el
lienzo sigue en `projects-service` sin migración entre bases.


### 44.7 Segunda pasada de interfaz (2026-08-19)

La primera arregló fallos y dejó la pantalla casi igual. Esta la cambia.

**Los paneles se abren sin dar un salto.** Los tres —filtros, catálogo,
constructor— aparecían de golpe y miden entre 100 y 300 px: el lienzo pegaba un
brinco y quien miraba un grafo lo perdía de vista sin tocar nada.

🔴 **`grid-template-rows` de `0fr` a `1fr`, nunca `max-height`.** Aquello
«funciona» y miente: la transición corre sobre los píxeles que el contenido **no**
tiene, así que un panel de 100 px con `max-height: 500px` abre en un quinto del
tiempo y pasa el resto en nada; al cerrar, empieza lento y termina de golpe. Y el
ritmo cambia con lo que haya dentro, que aquí depende de cuántos filtros se
pinten. `height: auto` directamente no se puede animar. Medido: 325 px a los
120 ms, 581 px abierto. Vive en `molecules/Desplegable`, con `motion-safe`.

🔴 **El panel de filtros se cerraba en cada selección**, por la `key` de §44.1:
remontaba el organismo entero en cada cambio, así que acumular tres filtros eran
tres viajes de abrir y volver a abrir. La `key` se mudó a los dos
`SelectorDeFecha`, que es lo único que la necesitaba.

**Los grafos se eligen por su forma.** El catálogo eran ocho tarjetas de texto:
elegir «flujo acumulado» obligaba a leerse la frase y traducirla a una imagen.
`molecules/MiniGrafo` dibuja las cinco formas del constructor más tres que solo
existen en el catálogo —cifras, dispersión, lista—. En el constructor, la forma
pasa de desplegable a **fila de miniaturas**: «área apilada» en una lista obliga
a saber qué significan esas dos palabras antes de poder elegir.

⚠️ **La miniatura nunca lleva datos reales.** En un proyecto sin historial saldría
plana, y una fila de barras a cero se lee como «este grafo no sirve» cuando lo que
pasa es que aún no hay nada. Dice qué forma tiene, no qué valores tendrá.

**Un panel con pestañas** en lugar de dos que se cerraban el uno al otro: son dos
formas de hacer lo mismo, y quien llega al catálogo descubre el constructor sin
que nadie se lo cuente. El estado pasa a ser uno en vez de dos booleanos —que
tenían un estado imposible y cuatro sitios donde acordarse de cerrar al otro—.

**Y «gráfico» pasa a «Grafo»** en la interfaz, por decisión de producto del
2026-08-19. ⚠️ Queda escrito que en español un grafo son nodos y aristas: si algún
día chirría, el cambio está acotado a las cadenas de un solo commit.

---

## 45. Reglas: un catálogo que son datos, y dos trampas de formulario

El apartado **Reglas** de un proyecto —automatizaciones académicas—, construido
sobre las siete rutas que `automation-service` ya servía. Antes vivía incrustado
en `page.tsx` como marcado suelto: un formulario de tres campos que mandaba
`conditions: []` fijo, sin editar, sin eliminar y sin `useAccion`, así que un 400
del validador se perdía entero y el formulario se quedaba igual sin decir nada.

Plan en [PLAN-FRONTEND-REGLAS-IMPLEMENTACION.md](../../.planning/PLAN-FRONTEND-REGLAS-IMPLEMENTACION.md),
siete bloques; correcciones posteriores en
[PLAN-CORRECCION-REGLAS.md](../../.planning/PLAN-CORRECCION-REGLAS.md). Para
enseñarlo, [GUION-DEMO-REGLAS.md](GUION-DEMO-REGLAS.md).

### 45.1 El mapa

```
lib/automation-catalog.ts     el catálogo, como datos
lib/automation-draft.ts       borrador ⇄ cuerpo del DTO, coerción, resúmenes
lib/validation.ts             validateAutomationDraft
components/organisms/ProjectRules/
├─ ProjectRules.tsx           servidor: cabecera, lista, vacío, permiso, suspensión
├─ RuleCard.tsx               servidor: resumen legible + controles
├─ RuleDialog.tsx             cliente: el constructor guiado
├─ TriggerSection.tsx         «Cuando»
├─ ConditionsSection.tsx      «Si»
├─ ActionsSection.tsx         «Entonces»
├─ ValueField.tsx             un renderizador por tipo de valor
├─ RuleStatusToggle.tsx       habilitar / deshabilitar
├─ DeleteRuleButton.tsx       eliminar, con confirmación
└─ RuleExecutions.tsx         «Revisar ahora» + auditoría
```

La carga sigue en `page.tsx`, condicionada a la pestaña abierta **y** al permiso
—pedirlas sin poder verlas sería una petición que siempre da 403— y con
`.catch(() => [])`, para que un fallo del servicio de automatización no se lleve
por delante el proyecto entero.

La pestaña se llama «Reglas» y acepta `?tab=automatizaciones` como alias, para
que un enlace compartido siga aterrizando donde debe.

### 45.2 El catálogo es **datos**, no ramas de JSX

`lib/automation-catalog.ts` describe cada trigger: etiqueta, explicación, campos
de configuración, campos de condición con su tipo y sus operadores, acciones
admitidas con su config fija, y los avisos de reglas que no pueden coincidir. Los
componentes **recorren** ese array.

```
lib/automation-catalog.ts        se toca al añadir trigger / condición / acción
components/…/ValueField.tsx      se toca solo al añadir un TIPO de valor nuevo
resto de componentes             no se tocan
```

Esa es toda la abstracción: un catálogo y un renderizador por tipo de valor. **No**
hay un motor de formularios genérico ni un editor de nodos — el MVP tiene dos
triggers y una acción, y el requisito era que crecer fuera localizado, no que la
pantalla se autogenerara desde un esquema arbitrario.

⚠️ **Es una copia de `rule-definition.ts`, y se sabe.** Nada expone el catálogo por
HTTP: es el hueco 1 de
[PENDIENTES-BACKEND-AUTOMATIZACION.md](PENDIENTES-BACKEND-AUTOMATIZACION.md). El
día que exista `GET /automations/catalog`, se sustituye el módulo por la respuesta
y ningún componente cambia. Mientras tanto, los ocho casos de rechazo de
`e2e/tests/api/17-automatizaciones.spec.ts` son la red: si backend
endurece el contrato, salta ahí y no en la pantalla.

### 45.3 ⚠️ Un booleano se pinta con `Select`, nunca con `Checkbox`

Es la trampa con peor forma de fallar de todo el apartado.

Las condiciones viajan en **tres arrays paralelos** de `FormData` —
`conditionField`, `conditionOperator`, `conditionValue`— y se recomponen por
posición: la entrada `i` de cada uno pertenece a la misma fila. Eso obliga a que
**cada fila emita siempre los tres**, aunque el valor esté vacío.

Un `<input type="checkbox">` sin marcar **no se envía en el `FormData`**. Una fila
booleana en «No» no emitiría su valor, y la fila siguiente heredaría el hueco: la
condición 2 se guardaría con el valor de la 3. No da error de tipos, no da 400 y
produce **una regla plausible y equivocada**.

Por el mismo motivo tampoco vale un `<select multiple>` para `IN`: emitiría N
valores bajo un nombre y rompería la misma invariante. La lista viaja como una
sola cadena JSON que `coerceConditionValue` desempaqueta.

La prueba que fija esto está en `automation-draft.spec.ts`: tres condiciones, la
del medio booleana en «No», y las tres tienen que salir en su fila.

### 45.4 El resumen de una ejecución busca el campo en todo el catálogo

`describeExecutionContext` traduce el `conditionResult.context` de una ejecución
con las etiquetas del catálogo —«prioridad Alta, fecha de vencimiento 2026-08-21»—
porque `recent()` no devuelve el trigger que la generó: solo `rule: { name }`. Por
eso existe `conditionFieldSpecByName`, que busca por nombre **sin** el trigger.

⚠️ Vale porque en el MVP ningún nombre de campo se repite entre triggers
(`priority`/`dueDate`/`assigneeCount` contra `staleDays`/`overdue`/
`withoutHistory`). Un trigger nuevo que reutilizara un nombre lo rompería, y sin
ruido: enseñaría la etiqueta del otro.

### 45.5 Lo que el diálogo aprendió por las malas

**El borrador se siembra al abrir, no al cerrar.** El *initializer* de `useState`
solo corre en el montaje, y `RuleDialog` **nunca se desmonta**: no lleva `key` y su
posición en el árbol no cambia, así que `revalidateProject` re-renderiza el Server
Component padre sin tocar el estado del hijo. El diálogo de creación arrastraba el
nombre y las condiciones de la regla anterior — crear dos seguidas partía de lo que
quedó de la primera, sin error y sin aviso. `ConditionsSection` tenía el mismo
problema un nivel más abajo, y se resuelve remontándola.

**Y sembrar al cerrar habría sido peor**: borraría lo escrito justo cuando el
servidor responde con error, que es lo único que el diálogo tiene que conservar.

⚠️ **`onClose` de `Dialog` no significa «alguien pidió cerrar».** Significa «el
`<dialog>` nativo se cerró, por lo que sea»: `setOpen(false)` llama a
`dialog.close()`, que emite el evento `close`, que vuelve a entrar por `onClose`.
Colgar de ahí la confirmación de «hay cambios sin guardar» hacía que un guardado
**correcto** preguntara si se descartan los cambios. Por eso esa confirmación solo
cuelga de «Cancelar»; `Esc`, la `X` y el clic en el fondo cierran sin preguntar.
Cubrir las tres exige que `Dialog` distinga ambos casos, y ese componente lo usan
15 archivos.

### 45.6 Lo que no se promete

La revisión es **manual a propósito** —no hay cron detrás de «Revisar ahora»— y la
interfaz lo dice donde está el botón, porque es lo primero que alguien pregunta.

El resumen enseña los cuatro números que el backend manda y **no inventa** los que
faltan: `skipped` y `deduped` no vienen (hueco 4), y el detalle de por qué una
candidata no produjo aviso se lee fila por fila, donde `SKIPPED` sí aparece.

Y hay una acción por trigger, sin botón de «añadir»: el modelo admite cinco, pero
con el catálogo actual dos acciones serían dos avisos idénticos a las mismas
personas. El botón aparecerá solo cuando el catálogo ofrezca una variante más.

---

## 46. Automatización: de dos disparadores a un motor que reacciona

Lo que la §45 describe —el apartado **Reglas**, dos disparadores, una acción y un
botón de «Revisar ahora»— sigue siendo cierto en su forma y ha dejado de serlo en
casi todo lo demás. Esta sección cuenta qué cambió y **por qué cada cosa estaba
mal**, que es lo que evita que vuelva.

Plan de la etapa en [PLAN-AUTOMATIZACION.md](PLAN-AUTOMATIZACION.md).

### 46.1 La tubería estaba construida y desconectada

`tasks-service` y `projects-service` escriben cada hecho en un `DomainOutbox`
dentro de la misma transacción que lo provoca; un publicador lo vuelca en el
stream de Redis `praxis:domain-events`; `InboundEventConsumer` lo copia a
`automation.inbound_events` con deduplicación por hash canónico, reclamo de
mensajes huérfanos y todo lo que hace falta.

**Y esa tabla no la leía nadie.** Ni una consulta en todo el repositorio. Las
reglas solo corrían cuando alguien pulsaba «Revisar ahora», así que el outbox
transaccional de dos servicios, el grupo de consumo y el `XAUTOCLAIM` entregaban
a un archivo muerto.

Ya está conectada. El consumidor guarda y, **en un paso aparte**, evalúa las
reglas contra lo que haya pendiente en la tabla.

⚠️ **Los dos pasos son dos a propósito.** Guardar es rápido y local; actuar habla
con dos servicios y puede tardar. Si fueran lo mismo, un `tasks-service` lento
bloquearía la lectura del stream, el `XACK` no llegaría, Redis daría el mensaje
por huérfano y **otro consumidor lo reclamaría mientras el primero sigue
ejecutando acciones**. Separarlos hace que el stream se vacíe siempre y que la
tabla haga de cola, con reintentos y un techo (`EVENT_MAX_ATTEMPTS`).

### 46.2 El catálogo, y por qué ya no hay tres copias

`automation-service/src/rules/catalog.ts` declara los disparadores, de qué
familia es cada uno, qué campos admite filtrar, con qué operadores, y qué
acciones existen con el permiso que exigen. Lo leen el validador, el motor y —por
`GET /projects/:id/automations/catalog`— el frontend.

🔴 **Antes vivía en tres sitios**: un `switch` en el validador, otro en el motor y
una copia a mano en `projects-front/src/lib/automation-catalog.ts`. Las tres
tenían que coincidir sin que nada lo comprobara, y cuando el servidor pasó de dos
disparadores a diez, el cliente siguió ofreciendo dos. **No falla ninguna
compilación cuando un formulario ofrece de menos.**

### 46.3 Dos familias de disparador, y no es una distinción interna

| Familia | Qué describe | Cuándo se evalúa |
|---|---|---|
| `sweep` | Un **estado** («vence pronto», «lleva parada») | Al pulsar «Revisar ahora» |
| `reactive` | Un **hecho** («la han movido») | Sola, por el flujo de eventos |

⚠️ **El mapa anterior decía que `TASK_DUE_SOON` reaccionaba a cinco hechos.** Es
de barrido: no hay un instante en que ocurra. Con el flujo conectado, esa entrada
habría hecho saltar «va a vencer» al crear cualquier tarea, tuviera fecha o no.
Hay una prueba que cruza los `eventType` del catálogo contra lo que
`tasks-service` emite de verdad — un nombre inventado se guarda, se ve habilitado
y **no se dispara nunca**, sin un solo error en ningún log.

Y la distinción se enseña: el constructor agrupa los disparadores en «pasa solo»
y «al revisar», porque del nombre no se deduce.

### 46.4 La identidad de una acción

Una regla se ejecuta sin nadie mirando, así que hay que decidir en nombre de
quién escribe. Se decidió «actor sistema»… y al implementarlo apareció algo
mejor, que además ya estaba: **`tasks-service` comprueba permisos por
`requesterId` en cada escritura** (`assertPermission` → `project_check_permission`).
No es el gateway quien los aplica: es el propio servicio.

Así que las acciones viajan con `requesterId = rule.createdBy`, y eso da tres
cosas gratis: una regla no puede hacer nada que su autor no pudiera hacer a mano;
la auditoría dice la verdad; y la comprobación ocurre **en el momento**, no
cuando se guardó. Si el autor pierde el permiso, la acción responde 403 y la
regla **se pausa sola** con `PAUSED_SYSTEM` y un `pauseReason` que la pantalla
enseña — sin ese texto, la regla se ve apagada, alguien la reactiva y se vuelve a
pausar.

El candado al guardar sigue existiendo, pero como aviso temprano: enterarse al
pulsar «Guardar» es mejor que enterarse tres días después.

### 46.5 El freno de bucle

Una regla que mueve una tarea produce un `task.moved.v1`, que despierta a las
reglas de movimiento. Dos reglas que se empujan —«si llega a Revisión, muévela a
Hecho» y «si llega a Hecho y no tiene encargado, muévela a Revisión»— giran para
siempre, y **la idempotencia por causa no las para**: cada vuelta tiene un
contexto distinto, así que es una causa distinta de verdad.

No hay forma barata de detectar el ciclo —`causationId` no sobrevive al salto por
RPC— así que hay un techo de 20 automatizaciones por tarea y hora. **No es
correctitud, es un fusible**, y cuando salta lo deja escrito en la ejecución.

### 46.6 El aviso lo decide el disparador, no el destinatario

🔴 El tipo de aviso salía de `recipientSelector`. Con dos disparadores coincidía
por casualidad —«a los encargados» con «va a vencer», «a quien lleva el proyecto»
con «lleva parada»—. Con diez dejó de coincidir: **«cuando se cree una tarea,
avisa a quien lleva el proyecto» mandaba un aviso que decía «lleva varios días
sin movimiento» sobre una tarea de un segundo antes.** El texto describía a quién
se le contaba, no lo que había pasado.

Hay un tipo por disparador y lo empareja el catálogo, así que uno nuevo sin el
suyo no compila.

En la misma tarjeta había otras dos: el icono era **un sobre** —las ramas de
`TypeIcon` miran el prefijo del tipo y `AUTOMATION_TASK_CREATED` no empieza por
`TASK_` ni por `MEMBER_`, así que caía al icono por defecto, que es el del
correo— y el tono era **rojo**, igual de alarmante que «te sacaron del proyecto».

⚠️ **Y un aviso de automatización lleva a la bandeja, no a la tarea.** Los demás
cuentan algo que hizo una persona y la tarea explica el resto; este cuenta algo
que hizo una regla, y la tarea no dice nada de la regla.

### 46.7 Tres depósitos que solo crecían

| Qué | Qué le pasaba | Qué se hizo |
|---|---|---|
| `domain_outbox` | `publishedAt` se ponía y la fila se quedaba para siempre | Purga a los 7 días |
| `inbound_events` | Igual, y encima con el rastro de proyectos borrados | Purga a los 7 días, y `purgeProject` se los lleva |
| El stream de Redis | `xadd` sin `MAXLEN` | `MAXLEN ~ 50000` |

🔴 **Un `XACK` no borra del stream**: saca la entrada de los pendientes del grupo
y ya. Cada movimiento de cada tarea de cada proyecto se quedaba ahí, y **este
Redis es también el de las sesiones** — llenarlo echa a todo el mundo.

### 46.8 El race del `causeKey`

`direct-execution.ts` hacía `findUnique` y después `create`. Entre las dos
consultas cabe otra revisión entera: dos pestañas, un doble clic en «Revisar
ahora» o dos instancias del servicio, y las dos leen «no existe», las dos crean, y
la segunda revienta contra `@@unique([ruleId, causeKey])` con un P2002 que nadie
capturaba. Por fuera: **un 500 por pulsar un botón dos veces**.

La restricción única ya era el árbitro; la lectura previa solo añadía una carrera
y una consulta por candidata.

### 46.9 Lo que la interfaz dejó de hacer

- **«Reglas» → «Automatización»**, y `?tab=automation`. Los dos nombres
  anteriores siguen resolviendo: un enlace compartido no puede morir por un
  renombre.
- **El constructor no es un modal.** Un modal tapa la lista que estás intentando
  complementar, secuestra el foco y el `Esc`, y obliga a resolver el cierre con
  cambios sin guardar en un `confirm()` del navegador encima de otra ventana
  encima de la página. Ahora se despliega dentro de la sección, y tanto el aviso
  de cambios sin guardar como la confirmación de borrado viven dentro del
  elemento que los provoca.
- **Servicio caído ≠ «no tienes reglas».** La página pedía con `.catch(() => [])`
  y una lista vacía ya significaba otra cosa: con automation parado, quien
  tuviera diez reglas veía la pantalla de bienvenida. Ahora llega `null` y se
  dice.
- **Los ids se resuelven a nombres.** «Columna es 3f2a…-9c11» es cierto y no
  sirve para comprobar nada. El catálogo dice de qué lista sale cada campo
  (`source`) y la página pone los valores con lo que ya tenía en pantalla —
  ninguna consulta nueva.
- **Las ejecuciones son filas desplegables**, y guardan `subjectTitle` y
  `triggerType` **copiados**: la tarea puede renombrarse o borrarse, y una
  auditoría que cambia cuando cambia el presente no es una auditoría.

### 46.10 🔴 La animación que no existía

Los paneles desplegables de Equipo y Roles usaban `animate-in
slide-in-from-top-4 fade-in duration-300`, del plugin `tailwindcss-animate`,
**que este repositorio no tiene instalado**. Tailwind no genera nada para una
utilidad que no conoce y **no avisa**: llevaban meses apareciendo de golpe
mientras el código decía que se deslizaban.

Es la misma clase de fallo que el de los `@source` (`ba94057`) y el de `@theme
static`: Tailwind descarta en silencio lo que no reconoce. Ahora hay
`.animate-desplegar-panel` en `theme.css`, que anima `grid-template-rows` de
`0fr` a `1fr` — abre hasta el alto real del contenido sin medirlo en JavaScript
ni fijar un `max-height` a ojo.

### 46.11 Administración puede borrar de verdad

`DELETE /admin/users/:id` y `DELETE /admin/projects/:id`, cada uno con su verbo
en el registro (`USER_DELETED`, `PROJECT_DELETED`) para no confundirse con
desactivar ni con archivar, que son estados y se deshacen.

⚠️ **Borrar una cuenta no borra su trabajo.** Las tareas, los mensajes y la
actividad viven en otros esquemas sin clave foránea: borrarlos dejaría huecos en
tableros de proyectos que no tienen nada que ver con esa persona. Se quedan, y la
interfaz los lee como `PERSONA_ELIMINADA` — antes caía al UUID, y en pantalla eso
es «3f2a…-9c11 salió del proyecto».

⚠️ **Y se niega si todavía es dueña de algún proyecto**, diciendo cuáles. Un
proyecto sin dueño sí rompe: `ownerId` resuelve los permisos, decide a quién
avisan las automatizaciones y es lo que la propia pantalla de administración
enseña. Un id que no existe deja ese proyecto sin nadie que pueda administrarlo y
sin forma de arreglarlo desde la interfaz.

La confirmación pide **escribir el nombre** y enumera lo que se lleva **y lo que
se queda**. Lo segundo es la mitad del mensaje: sin ello, quien administra cree
que borrar una cuenta vacía los tableros donde esa persona trabajó, y no borra
nunca.

### 46.12 El asistente, de paso

🔴 `chat()` capturaba cualquier cosa que no fuera `RpcException` y la sustituía
por un `500 'Error del asistente.'`. Un `GeminiError` **nunca** es una
`RpcException`, así que caía ahí siempre — y con él el trabajo entero de
`mensajeDelFallo()`, que distingue un límite por minuto de un tope de gasto y de
una clave mal configurada. El remate: `describe()` en el cliente devuelve el
mensaje del servidor salvo en los 5xx que no son 502, así que ese 500 salía como
«El asistente no ha podido responder. Inténtalo otra vez.» para las tres causas.

Ahora pasa por `comoRpc()` (502 con su mensaje), hay reintento con espera
creciente **solo para lo transitorio**, y si aun así falla **PRAX responde en su
burbuja** en vez de borrar la pregunta del hilo. Detalle en el plan de la etapa.

Y `ModelText` gana tablas y una gráfica de barras, con el mismo método de
siempre: sin librería de markdown y sin un solo `dangerouslySetInnerHTML`.

---

## 47. La organización pasa a contener los proyectos

> Etapa de organizaciones, 2026-08-26 y 27, rama `feature/organizaciones`.
> El plan, con las once decisiones y sus apuntes, en
> [PLAN-ORGANIZACIONES.md](PLAN-ORGANIZACIONES.md).

### 47.1 El cambio, en una frase

**Un proyecto ya no cuelga de una persona: pertenece a una organización.** Antes
la organización era una suscripción por volumen —repartía topes más altos entre
su gente— y la pregunta *«¿qué nos da estar dentro?»* no tenía buena respuesta:
cuando alguien se iba de la empresa, su trabajo se iba con él.

De ahí sale todo lo demás. `Project.organizationId` es `NOT NULL`, el tope de
proyectos se cuenta **por organización**, y quien está en un proyecto tiene que
tener **asiento** en la organización que lo contiene.

### 47.2 El noveno servicio

`billing-service` en el **3009**, esquema `billing`. Seis tablas:
`organizations`, `organization_members`, `organization_roles`,
`project_role_templates`, `subscriptions` y `billing_events`.

⚠️ **No habla con ningún otro servicio, y esa invariante sigue en pie.** Contesta
*qué plan tienes, qué da, quién está dentro y qué puede*. Quien cuenta proyectos
y mensajes es el gateway, que ya tiene delante los clientes de `projects`,
`tasks` y `assistant`. Si aparece un `*_SERVICE_HOST` en su `.env`, se ha
invertido el reparto.

**Redis sí**, desde 2026-08-27, y no rompe esa regla: es infraestructura, igual
que Postgres, y es lo que ya usa `permissions-service` para lo mismo. Cachea 30 s
`permisosDe` y `organizacionesDe` —las dos lecturas calientes— con invalidación
explícita en las nueve escrituras que cambian quién puede qué. El TTL solo cubre
lo que la invalidación no alcance.

### 47.3 Cuatro planes en una escalera

`FREE` · `TEAM` · `BUSINESS` · `ENTERPRISE`. `PLUS` y `PRO` **se borraron**, del
enum de TypeScript y del de Postgres: lo desplegado eran cuentas de prueba y no
había a quién conservarle un escalón.

⚠️ **Desapareció la distinción individual/empresa.** Desde que la organización
contiene los proyectos, «individual» no es una categoría: es una organización de
un asiento. Todos los planes de pago van **por asiento** y se contratan **para
una organización** — `POST /me/billing/checkout` exige `organizationId` siempre.

Los topes viven en `contracts/src/billing/plans.ts` y **en ningún otro sitio**.

### 47.4 Los papeles de organización, que son la tercera capa hecha datos

Eran un enum de tres valores (`OWNER`/`ADMIN`/`MEMBER`) y se quedó corto en
cuanto una empresa quiso decidir *quién crea proyectos* aparte de *quién invita*.
Ahora cada organización define los suyos con un **diccionario de booleanos**,
exactamente igual que un proyecto define sus roles.

🔴 **Ser dueño no es un papel.** Se resuelve contra `Organization.ownerUserId`
**antes** de mirar ninguno, igual que `ownerId` en un proyecto. Guardarlo como
fila permitiría quitarse permisos a uno mismo y dejar la organización sin nadie
que la administre y sin salida.

Los nueve permisos:

```
canManageOrganization   canCreateProject      canViewAllProjects
canManageAllProjects    canInviteMembers      canManageMembers
canManageRoleTemplates  canManageBilling      canViewAuditLog
```

🔴 **`cabenEn`: repartir permisos no puede crear permisos.** Sin esa regla, quien
tiene `canManageMembers` se crea un papel con `canManageBilling`, se lo asigna, y
está tocando la tarjeta de la empresa. Se aplica en los **cuatro** sitios donde
se reparte: crear papel, editar papel, asignar papel e **invitar** —esa última es
la puerta trasera que se olvida—.

⚠️ **«Administración» NO lleva `canManageBilling`** al crearse. Quien lleva el
equipo no toca la tarjeta salvo que el dueño se lo dé a propósito.

### 47.5 El puente: plantillas de rol de proyecto

Cada organización define los roles con los que **nacen** sus proyectos. Resuelve
el problema más molesto que tenía PRAXIS: cada proyecto inventaba sus roles desde
cero, y con quince proyectos eso es el mismo trabajo quince veces hecho distinto.

⚠️ **El puente va en una sola dirección.** Cambiar una plantilla **no** reescribe
los proyectos que ya existen: sería borrar el trabajo de quien los ajustó, desde
una pantalla que habla de otra cosa. La pantalla lo dice, porque nadie lo supone.

⚠️ Y son permisos **de proyecto** (`ProjectPermission`), no de organización. Son
dos vocabularios distintos: `canCreateTask` no significa nada arriba y
`canManageBilling` no significa nada dentro de un tablero. Por eso son **dos
pantallas**.

### 47.6 Tres códigos de error, tres salidas

| Código | Status | Qué pasó | Cómo se arregla |
|---|---|---|---|
| `FORBIDDEN` | 403 | No tienes el permiso | Pedírselo a quien administra el proyecto |
| `NOT_IN_ORG` | 403 | No tienes asiento en la organización | Que te den uno |
| `QUOTA_EXCEEDED` | 402 | Se agotó un tope del plan | Pagar, o borrar algo |

🔴 **`NOT_IN_ORG` no es un `402`**: no se ha agotado nada, esa persona no está
dentro. Y no es un `FORBIDDEN` normal: la salida es un **asiento**, que es otra
pantalla y otro coste.

⚠️ El tope de `miembrosPorProyecto` **se retiró**: lo sustituyó el asiento. Si
vuelve a aparecer un límite por proyecto, es señal de que alguien reabrió la
puerta a los invitados externos.

### 47.7 El 402 tiene dos caras

🔴 **Con el tope contado por organización, quien ve el mensaje puede no ser quien
puede resolverlo.** En un equipo de diez, nueve no tocan la tarjeta de la
empresa. El gateway resuelve `canManageBilling` **solo en el camino del fallo**
—una llamada TCP de más cuando ya se va a negar la escritura, cero en el camino
normal— y lo manda en `details.puedeAmpliar`.

Con él, la pantalla ofrece los planes; sin él, «avísale a quien administra». Un
botón de pagar delante de quien no puede pagar se lee como una avería, y una
avería no se paga: se abandona.

⚠️ **Ausente significa «no se sabe», y entonces se ofrece la salida.** Esconderle
el camino a quien sí puede pagar cuesta más que enseñárselo a quien no.

### 47.8 La organización activa vive en una cookie

`praxis_org`, junto a `praxis_theme` y `praxis_sidebar` y por el mismo motivo: el
servidor tiene que conocerla **al pintar**, o la lista de proyectos sale entera y
se recorta tras hidratar — un parpadeo en cada carga, y en Multi-Zones cada
cambio de zona es una carga completa.

🔴 **Es un filtro, nunca un permiso.** No es `httpOnly` y cualquiera puede
escribir ahí lo que quiera: el servidor la **suma** al filtro de «dueño o
miembro» que ya aplicaba. Poner una organización ajena devuelve **cero**
proyectos, no los suyos. Verificado.

⚠️ Sin cookie significa **todas**, no «la personal»: quien nunca ha tocado el
selector sigue viendo lo que veía antes de que esto existiera.

⚠️ **El selector recarga la página, no hace `router.refresh()`.** La cookie la
leen los siete `layout.tsx` en el servidor, y un refresco del App Router no
vuelve a ejecutar el layout de una zona ya montada: el sidebar se quedaría
marcando la organización vieja mientras la lista de abajo enseña la nueva.

### 47.9 La organización personal dejó de ser invisible

Era `PERSONAL`, sin nombre, creada perezosamente y escondida de todas las
pantallas. Tenía sentido mientras solo repartía topes; desde que **contiene** los
proyectos, una organización que no se ve es un sitio donde no se puede meter
nada.

Ahora tiene nombre, sale en el selector y en la lista, y **se crea al
registrarse**. Sigue habiendo como mucho una por cuenta, con el índice único
parcial (`WHERE kind = 'PERSONAL'`) escrito a mano en la migración porque Prisma
no sabe expresarlo.

### 47.10 Las pantallas, en el lenguaje de Kyloo desde el primer trazo

Seis pantallas nuevas o rehechas, todas con el dispositivo de
[`kyloo-design/SKILL.md`](../../kyloo-design/SKILL.md) §4 —filas con raya
punteada, número a la izquierda, botones como texto subrayado— y sobre los tokens
`--color-*`, **no** los `--l-*` de la landing, porque estas responden al tema
(§13).

| Pantalla | Ruta |
|---|---|
| Tus organizaciones | `/dashboard/organizations` |
| Crear una | `/dashboard/organizations/new` |
| El portal de una | `/dashboard/organizations/:id` |
| Papeles y plantillas | `/dashboard/organizations/:id/roles` |
| La entrada del sidebar | `/dashboard/roles` → redirige a la activa |
| Planes y consumo | `/dashboard/billing` |

🔴 **El portal empieza por sus proyectos, y ese fue el arreglo que importaba.**
Empezaba por los asientos y el plan, y se leía **vacío** — con razón: eso es una
factura, no un sitio de trabajo. Lo que hay dentro de una organización es el
trabajo del equipo, así que va primero; el plan es una línea al final.

🔴 **Crear una organización dejó de preguntar el plan y los asientos.** Era una
decisión comercial pedida a alguien que todavía no sabe qué es esto. Pide un
nombre, explica las tres cosas que cambian, y nace en gratuito.

### 47.11 Cinco trampas nuevas, todas verificadas

1. 🔴 **Un campo declarado solo en el DTO interno da 400 en la URL.** El
   `ValidationPipe` del gateway rechaza lo que el DTO de query no declara, y el
   síntoma fue **una lista vacía**, no un error visible. Es la trampa de «envía
   solo los campos que el DTO declara» leída al revés.
2. 🔴 **`QuotaService.exigir()` reconstruía el detalle del 402 con cuatro campos
   fijos** y tiraba el resto en silencio. Añadir un dato compilaba, llegaba al
   helper y no salía por la respuesta.
3. 🔴 **Editar una migración ya aplicada no la vuelve a ejecutar.** Se editó la
   inicial de `billing` para quitar dos valores de un enum; la base de quien ya
   tenía el esquema se quedó con `PLUS` y `PRO` vivos y **sin `ENTERPRISE`**,
   mientras el código creía lo contrario. Editar en su sitio solo vale cuando
   todo el mundo parte de cero.
4. 🍎 **Compilar un servicio con `nest start --watch` en marcha deja `dist/` a
   medias**, con un `MODULE_NOT_FOUND` que no se arregla recompilando. Es lo que
   CLAUDE.md documenta para `prisma:generate`, y vale igual para un `build`:
   parar, borrar `dist/`, reconstruir y arrancar en frío.
5. 🍎 **El `sed` de macOS no entiende `\b`.** Un `sed -i '' 's/\bX\b/Y/g'` se
   ejecuta, sale con código 0 y **no cambia nada**. Para renombrar, Python.

### 47.12 Lo que no está hecho

- **Sin pruebas end-to-end de facturación ni de organizaciones.** Todo se
  verificó a mano y por API contra el stack levantado.
- **Huérfanos**: qué pasa con los proyectos de una organización borrada. Hoy no
  hay ruta que borre una, así que no es urgente — en cuanto exista, lo es.
- **Administración de plataforma no ve las organizaciones.** Tiene cuentas,
  proyectos y actividad.
- **Dominio de correo propio y exportación de un proyecto**, que son las dos
  piezas de gobierno que más venden y no están.
- **El mensaje directo sigue sin ámbito**: hoy se puede escribir a cualquiera.

---

## 48. Las seis cuotas del plan, y las tres que no comprobaba nadie

> Etapa de cuotas, 2026-08-28, rama `feature/enterprise-cuotas`. El plan, con las
> cinco decisiones y sus invariantes, en [PLAN-CUOTAS.md](../PLAN-CUOTAS.md).
>
> Continúa el [encargo Enterprise](ENCARGO-ENTERPRISE.md), que quedó casi entero
> repartido entre tres etapas anteriores y al que le faltaba justo esto.

### 48.1 El hueco, en una frase

**El catálogo prometía seis topes y el servidor aplicaba tres.**

`PlanQuotas` declara `asientos`, `proyectos`, `iaMensualPorPersona`,
`automatizacionesPorProyecto`, `almacenamientoOrgMb` e `historialAnalisisDias`.
Los tres primeros se comprobaban desde la etapa Enterprise. Los tres últimos
tenían su número en los cuatro planes, su mensaje escrito en `MENSAJES`, su
`QuotaKind` declarado en el enum — y **no aparecían fuera de `plans.ts`**.

🔴 **Es la tercera vez que pasa lo mismo.** Antes fue `miembrosPorProyecto`, que
se retiró, y después `organizacionesPropias`, que se descubrió en la etapa de la
organización activa. La regla que sale de ahí y está en `CLAUDE.md`: **el commit
que añade un número a `PlanQuotas` es el que tiene que invocarlo.**

Lo caro no es el fallo, es que no se ve. La tabla de precios promete un tope que
el servidor no aplica: el plan de pago vale menos de lo que dice y el gratuito da
más de lo que dice, y nadie se queja de una cuota que no se aplica — se queja el
día que se aplica.

### 48.2 Las automatizaciones: al activar, no al crear

`automatizacionesPorProyecto` es 3 en Gratis, 25 en Equipo y sin tope arriba.

La cuota dice «reglas **activas**; las pausadas no cuentan», y eso decide dónde
va el guard. Si estuviera al crear, dos cosas se romperían a la vez: alguien con
el cupo lleno no podría ni redactar una regla para dejarla lista, y la salida que
ofrece el mensaje —«pausa una»— no liberaría nada, porque la pausada seguiría
ocupando.

⚠️ **Son dos puertas.** Crear con `status: ENABLED` y **actualizar una que estaba
pausada**. La segunda es la que se olvida: sin ella el tope se salta pausando y
reactivando, y no lo cuenta ningún error. Es el mismo patrón que la invitación en
`cabenEn` — la puerta trasera está siempre en el `update`.

⚠️ **Y la regla que se reactiva se excluye del conteo.** Si estuviera dentro del
total, activarla con el cupo justo se negaría a sí misma.

`automation-service` cuenta (`automation_rule_active_count`, solo `ENABLED`:
`PAUSED_SYSTEM` e `INVALID` no se ejecutan, así que no cuestan) y el gateway
decide (`QuotaService.exigirAutomatizacion`).

### 48.3 El almacén: lo compone el gateway porque no lo tiene nadie

`almacenamientoOrgMb`: 200 MB en Gratis, 10 GB en Equipo, 100 GB en Negocio.

⚠️ **Ni tasks-service ni billing-service pueden contestar esto solos.** El
primero guarda los adjuntos y no sabe de organizaciones; el segundo sabe de
organizaciones y no ha visto un adjunto en su vida. El gateway pide los proyectos
de la organización por un lado y la suma de sus bytes por el otro. Es la misma
composición que `exigirProyecto` y la misma regla de arquitectura que fijó la
etapa anterior con el chat privado: **no se abre una dependencia entre
microservicios que hoy no existe.**

Tres detalles que costarían encontrarse:

1. **Se mide lo que ocupa ahora, no lo que se subió alguna vez.** Borrar libera.
   Un contador que solo sube cobra por lo que ya no está, y eso se lee como una
   avería. Los proyectos `DELETED` tampoco cuentan: sus adjuntos no se pueden ni
   abrir ni borrar, así que cobrar por ellos sería cobrar por algo que nadie
   puede liberar.
2. **`attachment_bytes_of_projects` suma la columna `size` y no toca
   `AttachmentBlob`.** Un `SUM(length(data))` traería el TOAST entero de la
   organización a memoria para contestar un número que ya está guardado — que es
   justo el motivo por el que los bytes viven en otra tabla.
3. ⚠️ **Es el único punto del repositorio que no usa `cabe()`.** `cabe` contesta
   «¿cabe uno más?» sobre unidades, y aquí lo que entra tiene tamaño: un archivo
   de 30 MB con 190 de 200 ocupados **no cabe** aunque quepa «uno más».

El guard va **el último de los cinco controles de la subida**: los otros cuatro
se contestan con el archivo que ya está en memoria y este cuesta dos viajes TCP.
Más importante que el coste: quien sube basura tiene que leer «esto no es un
PDF», no «no te cabe» — el segundo mensaje le manda a borrar adjuntos para
arreglar un problema que no es de espacio.

### 48.4 El historial de Análisis: recorta, y lo dice

`historialAnalisisDias`: 90 días en Gratis, 365 en Equipo, sin tope arriba.

🔴 **Es la única de las seis que acota una lectura, y por eso no lanza 402.** Un
muro de pago a media consulta no tiene salida: no es que alguien se haya pasado,
es que preguntó por más atrás de lo que su plan alcanza, y no hay nada que pueda
hacer distinto. Las otras cinco acotan escrituras y todas ofrecen algo —borrar,
pausar, liberar, esperar al día 1—.

Así que el gateway **recorta** `days`, `weeks` y el `from` de los filtros en las
once rutas de informes.

⚠️ **También cuando no llega ningún `from`.** Los informes que no reciben `days`
—`dynamics`, `column-time`, `people`, `matrix`— miran todo el historial capturado
si nadie les dice otra cosa. Recortar solo cuando el cliente manda un `from`
dejaba el tope abierto justo para el caso normal.

🔴 **El `days` de `blocked` NO se recorta, y es el único de los once así.** Ahí
`days` no es la ventana de historial: es **cuántos días lleva una tarea sin
moverse**. Recortarlo al tope del plan convertiría «lo que lleva 120 días quieto»
en «lo que lleva 90», con el mismo nombre en la pantalla y sin que nada fallara —
el informe seguiría saliendo, contestando a otra pregunta. Es la misma trampa por
la que el paquete tampoco le pasa su `days` (§44).

**Y hay que decirlo, o el recorte es mudo.** El paquete devuelve una clave
`ventana` con `dias`, `plan`, `recortado` y `desde`, y `VentanaDelPlanAviso` la
escribe encima del lienzo. Es la misma regla que `tareasOmitidas` en el briefing
del asistente (§43) y que la nota de días naturales de §44: un gráfico que
empieza noventa días atrás sin explicar por qué se lee como un dato incompleto,
no como un plan, y quien lo lea sacará conclusiones de una serie que cree entera.

⚠️ **`recortado` no es «tener tope».** Un plan de 90 días contestando a una
pregunta de 60 no ha ocultado nada, y un aviso permanente ahí se aprende a
ignorar antes de que llegue el que importa.

⚠️ **`ventana` va dentro del `data` del paquete y no en el `meta` del sobre**, y
la razón es del cliente: `createApiClient` devuelve el `data` ya desenvuelto y
**tira el `meta`**. Un aviso ahí llegaría hasta el navegador y no lo leería nadie
— el mismo final que tuvieron los avisos en vivo cuando el sobre se comía su
`type` (trampa 12 de `CLAUDE.md`).

### 48.5 Bajar de plan: la trampa 4 del encargo, decidida

*«Bajar de plan con más proyectos de los que el plan permite es el caso que nadie
diseña y todos sufren.»* Estaba escrita en el encargo y seguía sin decidirse.

**Decidido: no se borra, no se archiva y no se congela.** Una organización con 40
proyectos que pasa de Negocio a Equipo —25— queda por encima **sin haber hecho
nada**: el número no subió, bajó el techo. Pasa igual al cancelar, al fallar un
cobro y al acabarse el mes gratis.

Lo que ocurre entonces es lo que ya ocurría: `cabe(40, 25)` es `false`, así que no
se puede crear el 41. Los 40 se abren, se editan y se borran.

- **Por qué no se congela lo que hay:** la organización pagó por tenerlo, y quien
  baja de plan suele ser quien menos culpa tiene del volumen. Congelar cuarenta
  proyectos por una tarjeta caducada es la forma más rápida de que un cliente se
  vaya con sus datos dentro.
- **Por qué no se archiva solo:** archivar es elegir a quién se le apaga el
  trabajo, y eso no lo puede decidir un webhook. Es la misma regla que ya fijó
  D7 de PLAN-ENTERPRISE para los asientos.

Lo que faltaba era **decirlo**. `GET /me/billing/resumen` devuelve `excedidas[]`
y la pantalla de Facturación lo dibuja con la salida de cada tope, empezando por
lo que sigue funcionando. Sin eso, quien administra se entera pulsando un botón
que no responde — y un tope rebasado sin explicación se lee como una avería, que
no se paga: se abandona.

Tres cosas que la prueba fija porque ninguna falla con un error:

1. 🔴 **`SIN_TOPE` es `null`**, y un `actual > tope` suelto compara contra cero:
   el plan sin límite saldría como el único rebasado de los cuatro.
2. **Estar justo en el tope es estar lleno, no rebasado.** 25 de 25 no es un
   exceso, y decirle «te has pasado» a quien está donde compró es una acusación
   falsa.
3. **`almacenamientoMb: null` es «no se pudo medir», no «cero».** Marcar un
   exceso sobre una cifra que no se tiene sería inventarse el aviso más caro de
   la pantalla.

Y la menos evidente entra también: quien gastó 200 mensajes de IA con Negocio y
baja a Gratis —13— pasa el resto del mes por encima sin haber escrito nada más.

### 48.6 Lo que no está hecho

- **Sin pruebas end-to-end de las tres cuotas nuevas.** Se comprobaron por tipos
  y por unitarias —diez nuevas—, no pulsando. La regresión completa no se ha
  corrido; se revisó a mano que `17-automatizaciones` no la roza, porque sus
  reglas de rechazo nacen `DISABLED`.
- **Nada de esto se ha visto contra el stack levantado.**
- **`historialAnalisisDias` no se recorta en las siete rutas sueltas con un
  aviso**: se recorta igual, pero devuelven el informe pelado y no tienen dónde
  decirlo sin cambiarles la forma. Si algún día una de ellas la pinta una
  persona, hay que subir `ventana` al `meta` del sobre y enseñar al cliente a
  leerlo.
- **`ENTERPRISE` se contrata por un `mailto:`.** Es lo que había y sigue siendo
  lo que hay: no tiene precio en Stripe porque se negocia. Un formulario con su
  tabla sería la forma final.
- **El portal de Stripe sigue siendo de la persona y no de la organización.**
  Viene de la etapa anterior y está en PENDIENTES-BACKEND.
