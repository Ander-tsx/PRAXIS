#!/bin/sh
# Arranca PRAXIS entero dentro de un contenedor.
#
# El orden importa y es el mismo del entorno local: primero los almacenes,
# luego las migraciones, después los microservicios y al final lo que da la
# cara. Un frontend que responde antes de que exista su gateway solo sirve para
# enseñar errores.
set -eu

log() { echo "[praxis] $*"; }

# ─── Configuración que hay que dar por fuera ────────────────────────────────
: "${JWT_SECRET:?Falta JWT_SECRET. Tiene que ser el mismo para todo el contenedor}"
: "${GEMINI_API_KEY:=}"
: "${GEMINI_MODEL:=gemini-flash-latest}"
: "${PORT:=8080}"
: "${POSTGRES_PASSWORD:=praxis123}"

export JWT_SECRET GEMINI_API_KEY GEMINI_MODEL
: "${JWT_EXPIRES_IN:=15m}"
: "${REFRESH_TOKEN_EXPIRES_IN:=7d}"
: "${LOG_LEVEL:=warn}"
export JWT_EXPIRES_IN REFRESH_TOKEN_EXPIRES_IN LOG_LEVEL

BASE_URL="postgresql://praxis:${POSTGRES_PASSWORD}@127.0.0.1:5432/praxis"

# ─── Postgres ───────────────────────────────────────────────────────────────
# El directorio de datos debe estar en un volumen persistente. Sin él, cada
# redespliegue **borra la base entera**: no es solo teoría, un reinicio de la
# plataforma hace lo mismo.
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  log "Primera vez: creando el cluster de Postgres"
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  su-exec postgres initdb -D "$PGDATA" -U praxis --auth-local=trust --auth-host=md5 >/dev/null
  # Solo escucha en loopback: nadie de fuera del contenedor debe alcanzarla.
  echo "listen_addresses = '127.0.0.1'" >> "$PGDATA/postgresql.conf"
  NUEVA=1
else
  chown -R postgres:postgres "$PGDATA"
  NUEVA=0
fi

log "Arrancando Postgres"
su-exec postgres pg_ctl -D "$PGDATA" -o "-c listen_addresses=127.0.0.1" -w start >/dev/null

if [ "$NUEVA" = "1" ]; then
  su-exec postgres psql -U praxis -d postgres -c "ALTER USER praxis PASSWORD '${POSTGRES_PASSWORD}'" >/dev/null
  su-exec postgres createdb -U praxis praxis
  # Los cinco esquemas, como en `infra/docker/compose/init/01-schemas.sql`.
  for e in credentials projects permissions tasks assistant; do
    su-exec postgres psql -U praxis -d praxis -c "CREATE SCHEMA IF NOT EXISTS $e" >/dev/null
  done
fi

# ─── Redis ──────────────────────────────────────────────────────────────────
# Sin persistencia a propósito: aquí solo hay caché y contadores efímeros, y
# guardarlos en el volumen sería pagar disco por algo que se puede recalcular.
log "Arrancando Redis"
redis-server --daemonize yes --bind 127.0.0.1 --save "" --appendonly no

# ─── Migraciones ────────────────────────────────────────────────────────────
# Cada servicio tiene su propio esquema dentro de la misma base.
log "Aplicando migraciones"
for s in credentials projects permissions tasks assistant; do
  DATABASE_URL="${BASE_URL}?schema=${s}" \
    pnpm --filter "@praxis/${s}-service" exec prisma migrate deploy >/dev/null
done
unset TCP_PORT

if [ "$NUEVA" = "1" ]; then
  log "Sembrando el usuario administrador"
  # Solo `credentials` tiene semilla. Escribe además en el esquema `permissions`
  # por SQL directo —los roles globales—, y puede porque todos los esquemas
  # viven en la misma base: por eso va después de aplicar TODAS las migraciones.
  #
  # `|| true`: que falle la semilla no puede impedir que arranque el producto.
  DATABASE_URL="${BASE_URL}?schema=credentials" \
    pnpm --filter @praxis/credentials-service run prisma:seed || true
fi

# ─── Los 12 procesos ────────────────────────────────────────────────────────
# Si alguno se cae, se cae el contenedor entero: la plataforma lo reinicia y
# volvemos a un estado conocido. Un contenedor «vivo» con media aplicación
# muerta es peor que uno que se reinicia, porque nadie se entera.
PIDS=""
morir() { log "Parando"; kill $PIDS 2>/dev/null || true; su-exec postgres pg_ctl -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true; }
trap morir INT TERM

# ⚠️ Las variables se **exportan** antes de llamar, no se ponen delante de la
# llamada: `VAR=x mi_funcion` no es portable —en `sh` el prefijo se aplica a
# comandos externos, y para una función el comportamiento queda sin especificar.
arrancar() {
  nombre=$1; shift
  "$@" &
  PIDS="$PIDS $!"
  log "  $nombre"
}

log "Arrancando microservicios"
for s in credentials projects permissions tasks assistant; do
  case "$s" in
    credentials) PUERTO=$CREDENTIALS_SERVICE_PORT ;;
    projects)    PUERTO=$PROJECTS_SERVICE_PORT ;;
    permissions) PUERTO=$PERMISSIONS_SERVICE_PORT ;;
    tasks)       PUERTO=$TASKS_SERVICE_PORT ;;
    assistant)   PUERTO=$ASSISTANT_SERVICE_PORT ;;
  esac
  export DATABASE_URL="${BASE_URL}?schema=${s}"
  export TCP_PORT="$PUERTO"
  arrancar "$s-service" node "apps/backend/services/$s/dist/main"
done

# `reports` no tiene base de datos propia: lee de los otros servicios.
unset DATABASE_URL
export TCP_PORT="$REPORTS_SERVICE_PORT"
arrancar "reports-service" node apps/backend/services/reports/dist/main

# El gateway necesita que los seis estén escuchando antes de aceptar tráfico.
sleep 4
log "Arrancando gateway"
arrancar "gateway" node apps/backend/gateway/dist/main

# ─── Frontend ───────────────────────────────────────────────────────────────
# ⚠️ `PORT` se asigna **por proceso**. La plataforma lo inyecta en el entorno
# del contenedor, y sin esto las cinco zonas intentarían escuchar en el mismo
# puerto y solo arrancaría una.
log "Arrancando zonas"
PUBLICO="$PORT"
export HOSTNAME=0.0.0.0
for z in auth-front:4101 dashboard-front:4102 projects-front:4103 reports-front:4104; do
  nombre=${z%:*}
  export PORT=${z#*:}
  arrancar "$nombre" node "apps/frontend/$nombre/.next/standalone/apps/frontend/$nombre/server.js"
done

# El shell va el último y es el único que se publica: es la puerta de entrada y
# lo que reenvía a las otras cuatro.
export PORT="$PUBLICO"
log "Arrancando web-shell en el puerto $PUBLICO"
arrancar "web-shell" node apps/frontend/web-shell/.next/standalone/apps/frontend/web-shell/server.js

# ⚠️ **No se usa `wait -n`**: es de bash y aquí el shell es el de BusyBox, donde
# no existe. Se vigila a mano: en cuanto uno de los doce deja de estar vivo,
# se para todo. Con `wait` a secas el contenedor seguiría «arriba» con media
# aplicación muerta, que es la peor forma de fallar porque nadie se entera.
log "Todo arriba. Vigilando."
while :; do
  sleep 5
  for pid in $PIDS; do
    if ! kill -0 "$pid" 2>/dev/null; then
      log "El proceso $pid ha muerto; parando el contenedor"
      morir
      exit 1
    fi
  done
done
