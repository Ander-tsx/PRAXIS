# PRAXIS

Monorepo SOFEA: microfrontends Next.js 16 + microservicios NestJS.

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js 16 + TypeScript · **Multi-Zones** (`basePath` + `rewrites()`) |
| Backend | NestJS + PostgreSQL (Prisma) + Redis · transporte TCP |
| Monorepo | pnpm workspaces + Turborepo |

> No usamos Module Federation. Cada microfrontend es una app Next independiente
> con su propio `basePath`, y `web-shell` las publica bajo un solo origen
> mediante `rewrites()`. Se entra siempre por el shell (4100), nunca por el
> puerto de una zona.

## Requisitos

- Node.js 20+
- pnpm 9+
- Docker Desktop

## Puertos

| Servicio | Puerto |
|---|---|
| gateway (HTTP) | 3000 |
| credentials-service | 3001 |
| permissions-service | 3002 |
| projects-service | 3003 |
| tasks-service | 3004 |
| reports-service | 3005 |
| assistant-service | 3006 |
| alexa-service | 3007 |
| web-shell | 4100 |
| auth-front | 4101 |
| dashboard-front | 4102 |
| projects-front | 4103 |
| reports-front | 4104 |

---

# Primer arranque

Los ocho pasos, en orden. Ninguno es opcional.

## 1. Instalar dependencias

```bash
pnpm install
```

## 2. Crear los archivos `.env`

Sin esto no arranca nada. Hay que crear **12 archivos**. Cada servicio trae su
`.env.example` como plantilla; los valores reales (JWT_SECRET, GEMINI_API_KEY,
credenciales SMTP) se comparten por fuera del repositorio, nunca se versionan.

Backend — copiar el `.env.example` de cada carpeta a `.env` y rellenar:

- `apps/backend/gateway/.env`
- `apps/backend/services/credentials/.env`
- `apps/backend/services/permissions/.env`
- `apps/backend/services/projects/.env`
- `apps/backend/services/tasks/.env`
- `apps/backend/services/reports/.env`
- `apps/backend/services/assistant/.env`
- `apps/backend/services/alexa/.env`

Frontend — crear un `.env.local` en cada zona:

- `apps/frontend/web-shell/.env.local` → `GATEWAY_URL`, `JWT_SECRET`,
  `DASHBOARD_FRONT_URL`, `PROJECTS_FRONT_URL`, `REPORTS_FRONT_URL`
- `apps/frontend/auth-front/.env.local` → `GATEWAY_URL`, `JWT_SECRET`, `NODE_ENV`
- `apps/frontend/dashboard-front/.env.local` → `GATEWAY_URL`, `JWT_SECRET`
- `apps/frontend/projects-front/.env.local` → `GATEWAY_URL`, `JWT_SECRET`
- `apps/frontend/reports-front/.env.local` → `GATEWAY_URL`, `JWT_SECRET`

Reglas que rompen el arranque si se ignoran:

- **`JWT_SECRET` debe ser idéntico** en `gateway`, `credentials-service` y las
  cinco zonas del frontend. Si uno solo difiere, el login devuelve token pero
  toda petición posterior da 401.
- **`VOICE_JWT_SECRET`** (alexa-service) es un secreto **distinto**, no se
  reutiliza el de la plataforma. Generar con `openssl rand -hex 48`.
- **`GEMINI_API_KEY` vive únicamente** en `services/assistant/.env`. Nunca en el
  gateway ni en una variable `NEXT_PUBLIC_*`.
- `infra/docker/compose/.env` **no hace falta**: el compose ya trae valores por
  defecto (`praxis` / `praxis123` / `praxis`).

## 3. Levantar la infraestructura

```bash
docker compose -f infra/docker/compose/docker-compose.yml up -d
```

Levanta PostgreSQL (5432) y Redis (6379).

## 4. Generar los clientes de Prisma

```bash
for s in credentials permissions projects tasks assistant alexa; do
  pnpm --filter @praxis/$s-service exec prisma generate
done
```

El cliente se genera dentro de `src/generated/` de cada servicio y **no está
versionado**: en un árbol recién clonado este paso es obligatorio, o el servicio
arranca y muere con `Cannot find module '../generated/prisma-client'`.

`reports-service` se excluye a propósito: no tiene esquema propio, lee de
tasks-service y projects-service por TCP y cachea en Redis.

## 5. Recrear las tablas

```bash
for s in credentials projects permissions tasks assistant alexa; do
  pnpm --filter @praxis/$s-service exec prisma migrate reset --force --skip-seed
done
```

⚠️ Borra todos los datos de la base. Solo para desarrollo.

## 6. Ejecutar los seeds

```bash
for s in permissions credentials projects tasks; do
  pnpm --filter @praxis/$s-service run prisma:seed
done
```

Solo esos cuatro servicios tienen seed. Deja la base con:

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin@praxis.dev` | `Admin@12345!` | Admin |
| `maria@praxis.dev` | `User@12345!` | User |
| `carlos@praxis.dev` | `User@12345!` | User |

Más un proyecto de demostración con 1 espacio, 1 tablero de 4 columnas y 7 tareas
con etiquetas, checklists y comentarios.

## 7. Compilar el monorepo

```bash
pnpm build
```

**Obligatorio antes de arrancar el backend.** `@praxis/contracts` y
`@praxis/observability` (en `apps/backend/commons/`) publican su `main` como
`dist/index.js`, y todos los microservicios los importan. Sin este paso mueren
con `Cannot find module '@praxis/contracts'`.

## 8. Arrancar

Backend (gateway + los 7 microservicios):

```bash
npx turbo run dev --filter=@praxis/gateway --filter="@praxis/*-service"
```

Frontend (las 5 zonas):

```bash
pnpm dev:frontend
```

Abrir **http://localhost:4100**. Swagger en http://localhost:3000/api/docs.

---

## Uso diario

Con la base ya creada, basta con:

```bash
docker compose -f infra/docker/compose/docker-compose.yml up -d
npx turbo run dev --filter=@praxis/gateway --filter="@praxis/*-service"
pnpm dev:frontend
```

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `pnpm dev:frontend` | Levanta las 5 zonas del frontend. |
| `pnpm build` | Compila todo el monorepo (Turborepo resuelve el orden). |
| `pnpm lint` | Biome en la raíz, ESLint en `web-shell`. |
| `pnpm test` | Tests de todos los paquetes. |
| `pnpm format` | Formatea con Biome. |
| `pnpm docker:down` | Detiene PostgreSQL y Redis. |
| `pnpm docker:logs` | Logs de la infraestructura. |

⚠️ `pnpm prisma:generate` y `pnpm prisma:deploy` usan el filtro
`@praxis/*-service`, que incluye a `reports-service` — un servicio sin Prisma —
y abortan con `Command "prisma" not found`. Usa los bucles de los pasos 4 y 5
hasta que se corrijan.

⚠️ `pnpm dev:cli` (asistente interactivo) no arranca el gateway y no incluye
`reports-service`. Ver `scripts/dev-cli/README` o preguntar a quien lo mantiene.

## Si algo falla

| Síntoma | Causa |
|---|---|
| `Cannot find module '@praxis/contracts'` | Falta el paso 7 (`pnpm build`). |
| `Cannot find module '../generated/prisma-client'` | Falta el paso 4 (`prisma generate`). |
| Login OK pero todo devuelve 401 | `JWT_SECRET` distinto entre gateway, credentials y la zona. |
| La zona de Reportes va vacía | `reports-service` (3005) no está levantado. |
| El asistente responde error | Falta `GEMINI_API_KEY` en `services/assistant/.env`. |
| `nest: command not found` | Se está lanzando `nest` fuera de pnpm; usar siempre `pnpm --filter ... run dev`. |

Si haces `docker compose down -v`, hay que repetir los pasos 5 y 6.

## Estructura

Ver `STRUCTURE.md` y `docs/` para la arquitectura detallada.
