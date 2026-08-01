# PRAXIS, entero en una sola imagen.
#
# ## Para qué es esto, y para qué NO
#
# Es la forma más corta de tener el proyecto en línea y enseñárselo a alguien:
# los 12 procesos, Postgres y Redis dentro del mismo contenedor. Sirve para
# pedir opiniones, no para producción — no hay copias de seguridad, ni forma de
# escalar una pieza sin las otras, y si el volumen se pierde se pierde todo.
#
# **No obliga a cambiar nada de la aplicación.** Funciona porque el código ya lee
# toda su configuración de variables de entorno y sus valores por defecto son
# `localhost`, que dentro de un contenedor es justo lo correcto.
#
# ## Por qué la base es la de Postgres y no la de Node
#
# Al revés —instalar Postgres sobre `node:alpine`— hay que reproducir a mano lo
# que la imagen oficial ya trae resuelto: usuario del sistema, permisos del
# directorio de datos, `initdb`, locales. Node, en cambio, es copiar dos
# directorios. Las dos imágenes son Alpine, así que los binarios son compatibles.

# ─────────────────────────────────────────────────────────────────────────────
# 1. Compilación
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /repo

# `openssl` lo pide el motor de Prisma en Alpine.
RUN apk add --no-cache openssl

# ⚠️ **Se copia el repositorio entero antes de instalar, a propósito.**
#
# Lo habitual es copiar primero los `package.json` para que la capa de
# dependencias se reutilice mientras no cambien. Aquí se probó y se descartó:
# son quince paquetes en cuatro niveles distintos, la lista se escribe a mano y
# ya falló a la primera —`commons/security` es una carpeta sin `package.json` y
# `packages/shared-devtools` faltaba—. Una lista que hay que mantener en paralelo
# al workspace es una lista que se desincroniza.
#
# El coste es que un cambio en el código invalida el `install`. Con lo que se
# despliega esto —de vez en cuando— sale más barato que perseguir rutas.
COPY . .

RUN pnpm install --frozen-lockfile

# ⚠️ Estos dos van primero y no es negociable: publican `dist/` y sin ellos los
# seis microservicios fallan con «Cannot find module '@praxis/contracts'». Es la
# misma trampa que documenta CLAUDE.md para el arranque local.
RUN pnpm --filter @praxis/contracts --filter @praxis/observability run build

# ⚠️ **`DATABASE_URL` de relleno, solo para compilar.**
#
# `prisma generate` no se conecta a ninguna base, pero `prisma.config.ts` exige
# la variable **al cargarse** y sin ella el build muere con
# `PrismaConfigEnvError`. En local la aporta el `.env` de cada servicio, que no
# entra en la imagen y no debe entrar. La de verdad la pone el arranque.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"

# El cliente de Prisma se genera en `src/generated/` de cada servicio y **no
# está versionado**: sin él el servicio arranca y muere. No hace falta un paso
# aparte — los cinco servicios lo generan en su `prebuild`, así que `pnpm run
# build` ya lo cubre. Un `prisma generate` extra aquí solo repetiría el trabajo.

# Backend y frontend. Next necesita `NODE_ENV=production` aquí para no dejar
# fuera lo que solo se compila en producción.
ENV NODE_ENV=production

# ⚠️ **El dominio público, y va en el build a propósito.**
#
# Next rechaza toda Server Action cuyo `Origin` no case con el host que ve el
# servidor. Detrás de un proxy inverso nunca casan, y como aquí *todos* los
# formularios son Server Actions, sin esto no se puede ni iniciar sesión: falla
# con `Invalid Server Actions request`. Lo leen los cinco `next.config.ts`.
#
# Con `output: 'standalone'` el valor queda grabado en
# `.next/required-server-files.json` al compilar, así que **pasarlo en el
# `docker run` no sirve de nada**: cambiar de dominio obliga a reconstruir.
#
# Se deja vacío por defecto porque en local no hace falta —navegador y servidor
# ven el mismo host— y un valor equivocado sería peor que ninguno.
#
#   docker build --build-arg PUBLIC_ORIGIN=34-1-2-3.sslip.io -t praxis:local .
#
# Sin protocolo y con el puerto si no es el estándar: `mi-dominio.com`,
# `1-2-3-4.sslip.io`, `localhost:8080`.
ARG PUBLIC_ORIGIN=""
ENV PUBLIC_ORIGIN=$PUBLIC_ORIGIN

# ⚠️ **`--env-mode=loose`, y hace falta.**
#
# Turborepo 2 filtra el entorno de cada tarea: solo pasa lo que esté declarado
# en `turbo.json`. `DATABASE_URL` está puesta justo arriba y aun así el
# `prebuild` moría con `PrismaConfigEnvError`, porque turbo la quitaba por el
# camino.
#
# Se pone **aquí y no en `turbo.json`** a propósito: declararla allí cambiaría
# las claves de caché de todo el mundo y tocaría una configuración que hoy
# funciona. Esto solo afecta a la construcción de la imagen.
RUN pnpm exec turbo run build --env-mode=loose

# Solo las dependencias de producción, para no arrastrar el compilador a la
# imagen final.
RUN pnpm prune --prod

# ─────────────────────────────────────────────────────────────────────────────
# 2. Ejecución
# ─────────────────────────────────────────────────────────────────────────────
FROM postgres:16-alpine AS runtime

# Node desde la imagen oficial: las dos son Alpine y comparten musl.
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build /usr/local/lib/node_modules /usr/local/lib/node_modules

RUN apk add --no-cache redis su-exec openssl \
 && ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -sf /usr/local/lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
 && corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo
COPY --from=build /repo ./

# Dentro del contenedor todo se habla por `localhost`, que es justo lo que ya
# usan los valores por defecto del código. Solo se declara lo que no tiene uno.
ENV NODE_ENV=production \
    PGDATA=/var/lib/postgresql/data \
    REDIS_URL=redis://127.0.0.1:6379 \
    HTTP_PORT=3000 \
    CREDENTIALS_SERVICE_PORT=3001 \
    PROJECTS_SERVICE_PORT=3002 \
    PERMISSIONS_SERVICE_PORT=3003 \
    TASKS_SERVICE_PORT=3004 \
    REPORTS_SERVICE_PORT=3005 \
    ASSISTANT_SERVICE_PORT=3006

COPY docker-entrypoint-praxis.sh /usr/local/bin/praxis
RUN chmod +x /usr/local/bin/praxis

# El puerto que publica Railway. `web-shell` escucha aquí; las otras cuatro
# zonas se quedan en su puerto interno y solo las alcanza el shell.
EXPOSE 8080

CMD ["/usr/local/bin/praxis"]
