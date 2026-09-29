# syntax=docker/dockerfile:1.7
#
# Imagen del frontend: **una sola aplicación Next**.
#
# Fueron ocho —el shell y siete zonas de un multi-zone—, todas en este mismo
# contenedor y bajo el mismo pm2. O sea: se pagaba el coste entero de
# Multi-Zones y no se recibía su único beneficio, que es desplegar cada zona por
# separado. La fusión (`docs/PLAN-FUSION-ZONAS.md`) las juntó en una.
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
COPY apps/backend/commons/domain-events/package.json    apps/backend/commons/domain-events/
COPY apps/backend/commons/local-transport/package.json   apps/backend/commons/local-transport/
COPY apps/backend/services/assistant/package.json       apps/backend/services/assistant/
COPY apps/backend/services/automation/package.json      apps/backend/services/automation/
COPY apps/backend/services/billing/package.json         apps/backend/services/billing/
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
RUN pnpm install --frozen-lockfile --filter "./apps/frontend/**..."

# ────────────────────────── build ───────────────────────────
FROM deps AS build

COPY apps/frontend/ apps/frontend/
COPY packages/editor-schema/ packages/editor-schema/

# El esquema del editor publica dist/ y el frontend lo importa compilado.
RUN pnpm --filter "@praxis/editor-schema" run build

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

# Los precios que pinta la tabla comparativa, por el mismo motivo que el de
# arriba: son `NEXT_PUBLIC_*`, o sea que Next los incrusta al construir.
#
# ⚠️ **Puestos solo como variable del servicio no harían nada**, y sin un solo
# error: la tabla saldría con los planes, sus botones de compra y **sin cifra**.
# Es el mismo fallo mudo que describe el bloque de arriba.
#
# Vacíos por defecto y no con un número: una instalación sin ellos enseña la
# tabla sin precios, que es honesto. Un valor de relleno aquí sería un precio
# inventado en la pantalla de alguien.
#
# No son secretos —acaban en el navegador de todas formas— y no deciden nada:
# lo que se cobra es el `price_…` de Stripe que tiene el gateway. Esto es
# cartelería, y por eso puede desincronizarse: si cambias la tarifa en Stripe,
# cambia también estos.
ARG NEXT_PUBLIC_PRECIO_PRO=""
ENV NEXT_PUBLIC_PRECIO_PRO=$NEXT_PUBLIC_PRECIO_PRO
ARG NEXT_PUBLIC_PRECIO_TEAM=""
ENV NEXT_PUBLIC_PRECIO_TEAM=$NEXT_PUBLIC_PRECIO_TEAM
ARG NEXT_PUBLIC_PRECIO_BUSINESS=""
ENV NEXT_PUBLIC_PRECIO_BUSINESS=$NEXT_PUBLIC_PRECIO_BUSINESS

# ⚠️ Tailwind v4 descarta en silencio las utilidades que no encuentra al
# escanear. Si algún `@source` de commons/styles/theme.css se rompiera, esto
# compilaría igual y el resultado saldría sin estilos. Ver CLAUDE.md.
RUN pnpm --filter "@praxis/web" run build

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

# El único puerto que hay. Antes las zonas ocupaban del 4101 al 4107 en loopback.
EXPOSE 4100

CMD ["pm2-runtime", "start", "/app/pm2.config.cjs"]
