# PRAXIS — Contexto de trabajo

Monorepo SOFEA: microfrontends Next.js 16 + microservicios NestJS.
**Nuestro trabajo es exclusivamente el frontend.** El backend lo desarrolla otro equipo; nosotros consumimos lo que existe y documentamos lo que falta — no lo modificamos sin acordarlo.

## Documentos de referencia

| Documento | Cuándo consultarlo |
|---|---|
| [docs/frontend/ESTADO-ACTUAL.md](docs/frontend/ESTADO-ACTUAL.md) | Arquitectura, estado de cada microfrontend, deuda técnica priorizada, roadmap |
| [docs/frontend/CONTRATO-API.md](docs/frontend/CONTRATO-API.md) | **Antes de escribir cualquier fetch.** Rutas, DTOs, permisos, trampas |
| [docs/frontend/PENDIENTES-BACKEND.md](docs/frontend/PENDIENTES-BACKEND.md) | Lo que necesitamos del backend y no podemos resolver. Para pasárselo a ese equipo |
| [STRUCTURE.md](STRUCTURE.md) | Dónde va cada archivo nuevo |
| [docs/backend/permissions.md](docs/backend/permissions.md) | Modelo de permisos de dos capas |

## Reglas del frontend

**Next.js 16 tiene breaking changes.** Consulta `node_modules/next/dist/docs/` antes de usar una API que no hayas verificado en este repo. Regla heredada de `apps/frontend/web-shell/AGENTS.md`.

**Multi-Zones, no Module Federation** (el README miente). Cada microfrontend es una app Next independiente con `basePath: '/<zona>'`, expuesta por el `web-shell` vía `rewrites()`.

**Atomic Design:**
- Átomos y moléculas compartidos → `apps/frontend/commons/{atoms,molecules}/`
- Organismos y templates de dominio → `<zona>/src/components/{organisms,templates}/`
- Un organismo sube a `commons/organisms/` solo cuando lo usan ≥2 zonas
- **La lógica de negocio (fetch, estado, validación) vive solo en las pages.** Moléculas y organismos reciben slots `ReactNode` y props. Patrón de referencia: `commons/molecules/AuthForm` + `auth-front/src/app/login/page.tsx`

**Estilos:** Tailwind v4 con `@theme` en CSS (no hay `tailwind.config`). Dark-only.

Los tokens viven **una sola vez** en `commons/styles/theme.css`. Cada `globals.css` de zona lo importa y solo añade lo suyo: `@source "../**/*.tsx"` y sus `@font-face` (que llevan el basePath).

⚠️ Tailwind solo genera las clases que encuentra escaneando. Los `@source` hacia commons van dentro de `theme.css` y son relativos a ese archivo — si los quitas o el import falla, una utilidad usada solo dentro de un componente compartido se descarta **sin ningún error** y el componente se renderiza sin estilos. Ya nos pasó (`ba94057`).

**Auth:** el JWT vive en una cookie httpOnly `praxis_session`, nunca en `localStorage` ni en el JS del cliente. Toda llamada al gateway pasa por el proxy de la zona:

- Server Component → `createServerApiClient()` de `@praxis/commons/auth` (llama al gateway directo; `createApiClient` no sirve en el servidor)
- sesión en el servidor → `getSession()` de `@praxis/commons/auth`
- cliente → `createApiClient({ gatewayPath: '/<zona>/api/gateway' })` de `@praxis/commons/api`
- cada zona monta `src/app/api/gateway/[...path]/route.ts` con `createGatewayProxy()`

`@praxis/commons/auth` es código de servidor: **nunca** lo importes desde el índice raíz ni desde un componente cliente. Detalle en ESTADO-ACTUAL §14.

## Trampas del backend que ya nos han mordido

1. Toda respuesta viene envuelta en `{ success, data, meta }`. Los errores en `{ success: false, error: { code, message, details } }`.
2. `login`/`register` devuelven `{ userId, accessToken, refreshToken }` en camelCase — **no** `access_token`.
3. ✅ **La validación del gateway ya se aplica en los 28 endpoints** (`94721d8`, `477616f`, `2bad47c`). Antes 22 de ellos tipaban el `@Body()` con `Omit<XDto,...>`, que en runtime es `Object`, y devolvían **200 sin guardar nada**. Aun así seguimos validando en el cliente —el mensaje llega antes y marca el campo— y **confirmando contra el `data` de la respuesta, no contra el status**.
4. ✅ Ninguna ruta de tarea o checklist acepta `projectId` en el body: mandarlo da **400**. El guard lo resuelve desde la ruta. Estuvo al revés, y mientras lo eligió el cliente era un bypass: declarar un proyecto propio daba acceso a las tareas de cualquier otro (`ed88c63`).
5. ✅ `GET /api/projects` y `GET /api/users` aceptan **query params** (`page`, `limit`, `search`).
6. ✅ `GET /api/projects` filtra por **dueño o miembro**.
7. ✅ Un proyecto nuevo nace con rol "Administrador" y con el dueño dentro.
8. ⚠️ `permissions` de un rol es un **diccionario de booleanos**, nunca un array. El backend lo valida; los roles creados antes del validador siguen guardados como array y se normalizan al leer.
9. ⚠️ `Project.name` es único a nivel **global**, no por usuario. Un nombre puede chocar con el proyecto de un equipo que no conoces.

**Reglas al escribir un fetch:**

- Envía **solo los campos que el DTO declara**, ni uno más: uno de sobra ya da 400.
- **Valida en el cliente** igualmente: el mensaje llega antes y señala el campo.
- **Confirma el resultado contra el `data` de la respuesta, no contra el status.**
- Para saber qué puede hacer el usuario, pide `GET /projects/:id/permissions/me` en vez de intentar la acción y reaccionar al 403.

Lista completa de lo que falta por el lado del backend, con severidad y reproducción, en [PENDIENTES-BACKEND.md](docs/frontend/PENDIENTES-BACKEND.md).

## Estado

Los bloqueantes iniciales están resueltos: workspace, puertos, login y proxy autenticado. `auth-front` funciona end-to-end. Lo que falta y por qué, en ESTADO-ACTUAL §9 (tabla de deuda) y §15 (pendientes del equipo de backend).

**Puertos:** gateway 3000 · microservicios TCP 3001-3004 · web-shell 4100 · auth-front 4101 · dashboard-front 4102 · 4103+ para zonas nuevas.

**El shell no sirve páginas de negocio.** Es la cáscara: landing pública, `rewrites()` y la renovación de sesión. Cada pantalla privada va en su zona, que trae su propio guard en `proxy.ts` y se puede levantar sola. Checklist de zona nueva en ESTADO-ACTUAL §17.7.

⚠️ El `matcher` de `proxy.ts` con lookahead negativo **no casa la raíz**: hay que añadir `'/'` como entrada aparte o la página raíz de la zona se queda sin guard. Detalle en ESTADO-ACTUAL §17.6.

## Comandos

```bash
pnpm install
pnpm docker:up            # Postgres + Redis
pnpm --filter @praxis/contracts --filter @praxis/observability run build
pnpm prisma:reset         # recrea las tablas de los 4 servicios
pnpm prisma:seed
pnpm dev:backend
pnpm dev:frontend
```

⚠️ El `build` de `contracts` y `observability` no está en el README pero es imprescindible: publican `dist/` y sin él los 4 microservicios fallan con `Cannot find module '@praxis/contracts'`.

Los `.env` no se versionan. El `JWT_SECRET` debe ser idéntico en gateway, credentials-service y el `.env.local` de cada zona.

Swagger: `http://localhost:3000/api/docs`

## Convenciones de repo

- Commits: Conventional Commits en español (`feat:`, `fix:`), validados por commitlint + husky.
- Rama por feature (`feature/<nombre>`) → PR a `main`.
- Formato: Biome en la raíz, ESLint solo en `web-shell` — hoy están en desacuerdo con el código real.
