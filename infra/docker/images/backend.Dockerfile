# syntax=docker/dockerfile:1.7
#
# Imagen del backend: el gateway y los 7 microservicios en un solo contenedor.
#
# Van juntos porque se hablan por TCP y así ese tráfico no sale de la máquina:
# el gateway abre el único puerto público (3000) y los servicios escuchan en
# 127.0.0.1. Escalar añade copias autocontenidas — no hay estado en el proceso.
#
# Se construye desde la RAÍZ del repo, no desde este directorio:
#   docker build -f infra/docker/images/backend.Dockerfile -t praxis-backend .

# ─────────────────────────── base ───────────────────────────
# Debian y no Alpine por Prisma: su motor se enlaza contra glibc y openssl 3.
# Con musl hay que declarar `binaryTargets` en los 6 schema.prisma, y ninguno lo
# hace — generan para la plataforma nativa y ya está.
FROM node:22-bookworm-slim AS base

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# ──────────────────────── dependencias ──────────────────────
# Solo los manifiestos primero: mientras no cambie ninguno, Docker reutiliza la
# capa del install aunque haya cambiado todo el código.
#
# Están los 17 paquetes del workspace, incluidos los dos del frontend que esta
# imagen no usa. No es un descuido: `--frozen-lockfile` compara el lockfile
# contra *todos* los miembros declarados en pnpm-workspace.yaml, y si falta un
# package.json aborta. El install sí se filtra a `apps/backend`.
#
# 🔴 **Y sobrar tampoco vale.** Un `COPY` de un archivo que no existe **falla el
# build**, así que esta lista tiene que seguir a los miembros del workspace en
# los dos sentidos. Eran nueve del frontend hasta la fusión de zonas; siete de
# esas rutas desaparecieron a la vez, y con ellas se habría caído la imagen del
# **backend**, que es donde menos se busca.
FROM base AS deps

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

COPY apps/backend/gateway/package.json                  apps/backend/gateway/
COPY apps/backend/commons/contracts/package.json        apps/backend/commons/contracts/
COPY apps/backend/commons/observability/package.json    apps/backend/commons/observability/
# ⚠️ Este paquete es nuevo: lleva el publicador del buzón de salida, que antes
# estaba duplicado en tasks y projects. Sin esta línea, `pnpm install` no lo
# enlaza y los dos servicios fallan al importarlo.
COPY apps/backend/commons/domain-events/package.json    apps/backend/commons/domain-events/
COPY apps/backend/commons/local-transport/package.json   apps/backend/commons/local-transport/
COPY apps/backend/services/automation/package.json      apps/backend/services/automation/
COPY apps/backend/services/billing/package.json         apps/backend/services/billing/
COPY apps/backend/services/assistant/package.json       apps/backend/services/assistant/
COPY apps/backend/services/credentials/package.json     apps/backend/services/credentials/
COPY apps/backend/services/permissions/package.json     apps/backend/services/permissions/
COPY apps/backend/services/projects/package.json        apps/backend/services/projects/
COPY apps/backend/services/reports/package.json         apps/backend/services/reports/
COPY apps/backend/services/tasks/package.json           apps/backend/services/tasks/
COPY apps/backend/services/collab/package.json          apps/backend/services/collab/
COPY apps/frontend/commons/package.json                 apps/frontend/commons/
COPY apps/frontend/web/package.json                     apps/frontend/web/
COPY packages/shared-devtools/package.json              packages/shared-devtools/
# El esquema del editor de documentos: lo usan el frontend y collab-service.
COPY packages/editor-schema/package.json                packages/editor-schema/
COPY e2e/package.json                                   e2e/

# `...` al final: también las dependencias de workspace de lo filtrado. Sin él,
# `@praxis/editor-schema` se enlaza pero sus paquetes (TipTap) no se instalan.
RUN pnpm install --frozen-lockfile --filter "./apps/backend/**..."

# ────────────────────────── build ───────────────────────────
FROM deps AS build

COPY apps/backend/ apps/backend/
COPY packages/ packages/

# `contracts` y `observability` publican dist/. Sin esto los servicios fallan
# con `Cannot find module '@praxis/contracts'`.
RUN pnpm build:shared

# ⚠️ `prisma generate` no se conecta a nada, pero **exige** que DATABASE_URL
# exista: cuatro de los servicios (credentials, projects, tasks, billing)
# llevan `prisma.config.ts` con `env('DATABASE_URL')`, y ese archivo se evalúa
# antes de mirar el schema. En local la resuelve el `.env` de cada servicio; en
# el contenedor no hay ninguno y el build muere con PrismaConfigEnvError.
#
# El valor es de relleno y no sobrevive a esta etapa: la de runtime parte de
# `base`, no de aquí, y las cadenas reales las compone pm2 por servicio.
ENV DATABASE_URL=postgresql://relleno:relleno@127.0.0.1:5432/relleno

# El cliente de Prisma, generado AQUÍ para que el motor sea el de Linux.
# `nest build` lo dispararía por el hook `prebuild` de cada servicio, pero
# hacerlo explícito deja el fallo en su propia capa si algo va mal.
RUN pnpm prisma:generate

# nest-cli.json copia `generated/prisma-client/**` a dist como asset, así que el
# cliente viaja junto al código compilado.
RUN pnpm --filter "@praxis/gateway" --filter "@praxis/*-service" run build

# ───────────────────────── runtime ──────────────────────────
FROM base AS runtime

ENV NODE_ENV=production

# pm2 supervisa los 9 procesos: reinicia el que muera y mantiene el contenedor
# atado al ciclo de vida del grupo, en vez de a un `node` suelto.
RUN npm install --global pm2@5 && npm cache clean --force

COPY --from=build /app /app
COPY infra/docker/images/backend.pm2.config.cjs /app/pm2.config.cjs

# Las migraciones se aplican desde dentro del contenedor porque Cloud SQL no
# tiene IP pública. La imagen conserva node_modules completo (incluidas las
# devDependencies), así que el CLI de Prisma está disponible aquí.
COPY --chmod=0755 infra/docker/images/migrar.sh /app/migrar.sh
COPY --chmod=0755 infra/docker/images/start-backend.sh /app/start-backend.sh

# El único puerto que sale de la máquina. Los otros siete (3001-3007) escuchan
# en localhost y no se publican.
EXPOSE 3000

# Sin sesión de login ni shell interactiva: si un proceso muere en bucle, pm2
# lo dice por stdout y ahí lo recoge Cloud Logging.
CMD ["/app/start-backend.sh"]
