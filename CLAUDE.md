# PRAXIS — Contexto de trabajo

Monorepo SOFEA: microfrontends Next.js 16 + microservicios NestJS.
**Nuestro trabajo es exclusivamente el frontend.** El backend lo desarrolla otro equipo; nosotros consumimos lo que existe y documentamos lo que falta — no lo modificamos sin acordarlo.

## Documentos de referencia

| Documento | Cuándo consultarlo |
|---|---|
| [docs/frontend/ESTADO-ACTUAL.md](docs/frontend/ESTADO-ACTUAL.md) | Arquitectura, estado de cada microfrontend, deuda técnica priorizada, roadmap |
| [docs/frontend/CONTRATO-API.md](docs/frontend/CONTRATO-API.md) | **Antes de escribir cualquier fetch.** Rutas, DTOs, permisos, trampas |
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

**Estilos:** Tailwind v4 con `@theme` en CSS (no hay `tailwind.config`). Dark-only. Cada `globals.css` de zona necesita `@source` apuntando a `commons/` o las clases de los átomos se purgan.

**Auth:** el JWT vive en una cookie httpOnly `praxis_session`, nunca en `localStorage` ni en el JS del cliente. Toda llamada al gateway pasa por el proxy de la zona:

- servidor → `getSession()` de `@praxis/commons/auth`
- cliente → `createApiClient({ proxyPath: '/<zona>/api/proxy' })` de `@praxis/commons/api`
- cada zona monta `src/app/api/proxy/[...path]/route.ts` con `createGatewayProxy()`

`@praxis/commons/auth` es código de servidor: **nunca** lo importes desde el índice raíz ni desde un componente cliente. Detalle en ESTADO-ACTUAL §14.

## Trampas del backend que ya nos han mordido

1. Toda respuesta viene envuelta en `{ success, data, meta }`. Los errores en `{ success: false, error: { code, message, details } }`.
2. `login`/`register` devuelven `{ userId, accessToken, refreshToken }` en camelCase — **no** `access_token`.
3. `forbidNonWhitelisted: true`: un campo de más en el body → 400.
4. Toda mutación de tarea o checklist necesita `projectId` en el body o el guard responde 403.
5. `GET /api/projects` y `GET /api/users` esperan filtros por **body en un GET** → inalcanzable desde `fetch`.
6. `GET /api/projects` no filtra por usuario: devuelve todos los proyectos del sistema.
7. Un proyecto nuevo no tiene roles ni miembros. Hay que crear un `ProjectRole` antes de invitar a nadie.

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
