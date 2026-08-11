#!/bin/bash
#
# Aplica las migraciones de Prisma (y opcionalmente los seeds) contra la base de
# datos que tenga configurada esta máquina.
#
# Vive dentro de la imagen del backend porque Cloud SQL **no tiene IP pública**:
# no se puede migrar desde un portátil. La única forma de llegar a la base es
# desde algo que ya esté dentro de la VPC, y el contenedor del backend lo está.
#
# Uso, desde tu máquina:
#
#   gcloud compute ssh <vm-backend> --tunnel-through-iap --zone <zona> \
#     --command "sudo docker exec praxis-backend /app/migrar.sh"
#
# Y para sembrar datos de ejemplo la primera vez:
#
#   ... --command "sudo docker exec praxis-backend /app/migrar.sh --con-seeds"
#
# ⚠️ Ejecútalo en UNA sola máquina. Prisma toma un bloqueo en la base, así que
# dos a la vez no corrompen nada, pero la segunda falla con un error confuso
# sobre migraciones ya aplicadas.

set -euo pipefail

cd /app

CON_SEEDS=0
[ "${1:-}" = "--con-seeds" ] && CON_SEEDS=1

: "${POSTGRES_HOST:?falta POSTGRES_HOST}"
: "${POSTGRES_USER:?falta POSTGRES_USER}"
: "${POSTGRES_PASSWORD:?falta POSTGRES_PASSWORD}"
: "${POSTGRES_DB:?falta POSTGRES_DB}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

# La contraseña se codifica igual que en pm2.config.cjs: Cloud SQL admite
# caracteres que rompen una URL, y una `@` de más parte la cadena por donde no
# es y el error habla de un host que nadie escribió.
codificar() {
  node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"
}

USUARIO="$(codificar "$POSTGRES_USER")"
CLAVE="$(codificar "$POSTGRES_PASSWORD")"

url_para() {
  echo "postgresql://$USUARIO:$CLAVE@$POSTGRES_HOST:$POSTGRES_PORT/$POSTGRES_DB?schema=$1"
}

# ⚠️ `reports` no está en esta lista y no es un olvido: no tiene tablas propias
# ni carpeta prisma. Agrega lo que le sirven tasks y projects. Un bucle sobre
# `*-service` a secas moriría ahí con "Command 'prisma' not found".
#
# El orden importa para los seeds: permissions y credentials primero, porque
# projects y tasks referencian lo que crean.
SERVICIOS=(permissions credentials projects tasks assistant alexa)

echo "──────────────────────────────────────────────"
echo " Migraciones contra $POSTGRES_HOST/$POSTGRES_DB"
echo "──────────────────────────────────────────────"

for servicio in "${SERVICIOS[@]}"; do
  echo
  echo "▸ $servicio"
  # Los schemas los crea Prisma: cada schema.prisma declara el suyo en el
  # bloque `datasource`, así que no hay que crearlos a mano.
  ( cd "apps/backend/services/$servicio" \
    && DATABASE_URL="$(url_para "$servicio")" pnpm exec prisma migrate deploy )
done

if [ "$CON_SEEDS" -eq 1 ]; then
  echo
  echo "──────────────────────────────────────────────"
  echo " Seeds"
  echo "──────────────────────────────────────────────"
  # Solo estos cuatro tienen seed, y en este orden por sus dependencias.
  for servicio in permissions credentials projects tasks; do
    echo
    echo "▸ $servicio"
    ( cd "apps/backend/services/$servicio" \
      && DATABASE_URL="$(url_para "$servicio")" pnpm exec prisma db seed )
  done
fi

echo
echo "✓ Listo."
