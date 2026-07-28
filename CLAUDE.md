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

⚠️ Cada `globals.css` de zona **debe** declarar `@source` hacia `commons/atoms`, `molecules` y `organisms`. Tailwind solo genera las clases que encuentra escaneando: sin eso, una utilidad usada solo dentro de un componente compartido se descarta **sin ningún error** y el componente se renderiza sin estilos. Ya nos pasó (`ba94057`).

**Auth:** el JWT vive en una cookie httpOnly `praxis_session`, nunca en `localStorage` ni en el JS del cliente. Toda llamada al gateway pasa por el proxy de la zona:

- servidor → `getSession()` de `@praxis/commons/auth`
- cliente → `createApiClient({ gatewayPath: '/<zona>/api/gateway' })` de `@praxis/commons/api`
- cada zona monta `src/app/api/gateway/[...path]/route.ts` con `createGatewayProxy()`

`@praxis/commons/auth` es código de servidor: **nunca** lo importes desde el índice raíz ni desde un componente cliente. Detalle en ESTADO-ACTUAL §14.

## Trampas del backend que ya nos han mordido

1. Toda respuesta viene envuelta en `{ success, data, meta }`. Los errores en `{ success: false, error: { code, message, details } }`.
2. `login`/`register` devuelven `{ userId, accessToken, refreshToken }` en camelCase — **no** `access_token`.
3. ⚠️ **La validación del gateway casi nunca se aplica.** Solo validan los 6 endpoints cuyo `@Body()` declara una clase DTO (`/auth/login`, `/auth/register`, los 3 de `/permissions`, `GET /users`). Los otros 22 usan `@Body() body: Omit<XDto, ...>`, que en runtime es `Object`: el `ValidationPipe` se desentiende y **no valida nada**. Verificado: `POST /projects` con un campo inventado devuelve 201, y `PATCH /users/:id` con el casing equivocado devuelve **200 sin cambiar nada**. Consecuencia: valida en el frontend y **confirma contra el `data` de la respuesta, no contra el status**.
4. Toda mutación de tarea o checklist necesita `projectId` en el body o el guard responde 403.
5. `GET /api/projects` y `GET /api/users` esperan filtros por **body en un GET** → inalcanzable desde `fetch`.
6. `GET /api/projects` no filtra por usuario: devuelve todos los proyectos del sistema.
7. Un proyecto nuevo no tiene roles ni miembros. Hay que crear un `ProjectRole` antes de invitar a nadie.

**Regla de compatibilidad hacia adelante.** Como hoy el gateway apenas valida (trampa #3), es fácil escribir código que funciona ahora y se rompe cuando lo arreglen. Para evitarlo:

- Envía **solo los campos que el DTO declara**, ni uno más. Hoy sobrarían sin consecuencia; mañana darían 400.
- **Valida siempre en el cliente**, sin delegar en el servidor.
- **Confirma el resultado contra el `data` de la respuesta, no contra el status.**

Lista completa de lo que falta por el lado del backend, con severidad y reproducción, en [PENDIENTES-BACKEND.md](docs/frontend/PENDIENTES-BACKEND.md).

## Estado

Los bloqueantes iniciales están resueltos: workspace, puertos, login y proxy autenticado. `auth-front` funciona end-to-end. Lo que falta y por qué, en ESTADO-ACTUAL §9 (tabla de deuda) y §15 (pendientes del equipo de backend).

**Puertos:** gateway 3000 · microservicios TCP 3001-3004 · web-shell 4100 · auth-front 4101 · 4102+ para zonas nuevas.

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
