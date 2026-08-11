# syntax=docker/dockerfile:1.7
#
# Imagen del frontend: el shell y las 5 zonas en un solo contenedor.
#
# Multi-Zones se apoya en los `rewrites()` del shell hacia cada zona. Metiéndolas
# todas en la misma máquina esos saltos son loopback y los valores por defecto
# de `next.config.ts` (`http://localhost:41xx`) siguen siendo los correctos en
# producción, no solo en desarrollo.
#
# Solo el shell (4100) sale de la máquina; las zonas escuchan en localhost.
#
# Se construye desde la RAÍZ del repo:
#   docker build -f infra/docker/images/frontend.Dockerfile -t praxis-frontend .

# ─────────────────────────── base ───────────────────────────
FROM node:22-bookworm-slim AS base

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# ──────────────────────── dependencias ──────────────────────
# Igual que en la imagen del backend: los 20 manifiestos del workspace, porque
# `--frozen-lockfile` los valida todos, y el install filtrado a apps/frontend.
FROM base AS deps

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

COPY apps/backend/gateway/package.json                  apps/backend/gateway/
COPY apps/backend/commons/contracts/package.json        apps/backend/commons/contracts/
COPY apps/backend/commons/observability/package.json    apps/backend/commons/observability/
COPY apps/backend/services/alexa/package.json           apps/backend/services/alexa/
COPY apps/backend/services/assistant/package.json       apps/backend/services/assistant/
COPY apps/backend/services/credentials/package.json     apps/backend/services/credentials/
COPY apps/backend/services/permissions/package.json     apps/backend/services/permissions/
COPY apps/backend/services/projects/package.json        apps/backend/services/projects/
COPY apps/backend/services/reports/package.json         apps/backend/services/reports/
COPY apps/backend/services/tasks/package.json           apps/backend/services/tasks/
COPY apps/frontend/admin-front/package.json             apps/frontend/admin-front/
COPY apps/frontend/auth-front/package.json              apps/frontend/auth-front/
COPY apps/frontend/commons/package.json                 apps/frontend/commons/
COPY apps/frontend/dashboard-front/package.json         apps/frontend/dashboard-front/
COPY apps/frontend/projects-front/package.json          apps/frontend/projects-front/
COPY apps/frontend/reports-front/package.json           apps/frontend/reports-front/
COPY apps/frontend/web-shell/package.json               apps/frontend/web-shell/
COPY packages/shared-devtools/package.json              packages/shared-devtools/
COPY e2e/package.json                                   e2e/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "./apps/frontend/**"

# ────────────────────────── build ───────────────────────────
FROM deps AS build

COPY apps/frontend/ apps/frontend/

# `next build` no necesita estos valores —las variables sin prefijo
# NEXT_PUBLIC_ se leen en cada petición, no se incrustan en el bundle— pero
# alguna página puede prerenderizarse y tocarlas. Se pasan de relleno para que
# el build no dependa de secretos reales; los de verdad llegan al arrancar.
ENV NODE_ENV=production
ENV GATEWAY_URL=http://localhost:3000
ENV JWT_SECRET=build-time-placeholder-sin-valor-en-runtime

# ⚠️ Las variables `NEXT_PUBLIC_*` son la excepción a lo de arriba: Next las
# **incrusta en el JavaScript** durante el build, no las lee al arrancar. Si
# esta llegara solo por el entorno del contenedor, el botón de Google se
# renderizaría sin identificador de cliente y no haría nada — sin error en los
# logs, porque desde el punto de vista del servidor todo fue bien.
#
# Por eso viaja como build-arg. No es un secreto: el ID de cliente es público
# por diseño y acaba en el navegador de todas formas. Lo que protege la cuenta
# es que Google solo acepta tokens para el origen autorizado.
ARG GOOGLE_CLIENT_ID=""
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID

# ⚠️ Tailwind v4 descarta en silencio las utilidades que no encuentra al
# escanear. Si algún `@source` de commons/styles/theme.css se rompiera, esto
# compilaría igual y el resultado saldría sin estilos. Ver CLAUDE.md.
RUN pnpm --filter "@praxis/web-shell" \
         --filter "@praxis/auth-front" \
         --filter "@praxis/dashboard-front" \
         --filter "@praxis/projects-front" \
         --filter "@praxis/reports-front" \
         --filter "@praxis/admin-front" \
         run build

# ───────────────────────── runtime ──────────────────────────
FROM base AS runtime

ENV NODE_ENV=production

# Next intenta enviar telemetría al arrancar. Las máquinas no tienen salida a
# internet (sin Cloud NAT), así que esa llamada solo puede fallar: apagarla
# evita un intento de conexión colgado en cada arranque y ruido en los logs.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm install --global pm2@5 && npm cache clean --force

COPY --from=build /app /app
COPY infra/docker/images/frontend.pm2.config.cjs /app/pm2.config.cjs

# Solo el shell. Las zonas (4101-4105) quedan en loopback.
EXPOSE 4100

CMD ["pm2-runtime", "start", "/app/pm2.config.cjs"]
