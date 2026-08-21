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
# ⚠️ `--con-seeds` es para una base LOCAL o de pruebas: siembra las cuatro
# cuentas de desarrollo, y sus contraseñas están escritas en el repositorio.
# Para una instalación expuesta va `--arranque-limpio`, que siembra una sola
# cuenta con la contraseña que le pases por entorno:
#
#   ... --command "sudo docker exec \
#         -e SEED_SUPERADMIN_EMAIL=... -e SEED_SUPERADMIN_PASSWORD=... \
#         praxis-backend /app/migrar.sh --arranque-limpio"
#
# ⚠️ Ejecútalo en UNA sola máquina. Prisma toma un bloqueo en la base, así que
# dos a la vez no corrompen nada, pero la segunda falla con un error confuso
# sobre migraciones ya aplicadas.

set -euo pipefail

cd /app

CON_SEEDS=0
ARRANQUE_LIMPIO=0
case "${1:-}" in
  --con-seeds)      CON_SEEDS=1 ;;
  --arranque-limpio) ARRANQUE_LIMPIO=1 ;;
esac

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
#
# ⚠️ **`automation` entró tarde y este script no lo sabía.** El servicio existe
# desde la rama de automatizaciones y tiene su propio schema con cinco
# migraciones; sin esta línea, el despliegue arranca con `automation.*` sin
# crear y el servicio muere en bucle contra una tabla que no existe — con la
# sección de Automatización caída y ningún otro síntoma.
SERVICIOS=(permissions credentials projects tasks assistant alexa automation billing)

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

if [ "$ARRANQUE_LIMPIO" -eq 1 ]; then
  echo
  echo "──────────────────────────────────────────────"
  echo " Arranque limpio"
  echo "──────────────────────────────────────────────"
  #
  # Para una instalación **expuesta**, no para una local.
  #
  # Se diferencia de `--con-seeds` en tres cosas, y las tres importan:
  #
  #   1. Siembra UNA cuenta, no cuatro, y con la contraseña que llega por
  #      entorno. Las de `--con-seeds` están escritas en el repositorio.
  #   2. NO siembra `projects` ni `tasks`: nada de «Proyecto PRAXIS Demo» ni de
  #      sus tareas de ejemplo. La instalación arranca sin proyectos de mentira.
  #   3. SÍ siembra `seed-events`, que es el proyecto con historial fabricado, y
  #      lo deja **sin encargados** para poder repartirlo a mano después.
  #
  # Exige SEED_SUPERADMIN_EMAIL y SEED_SUPERADMIN_PASSWORD en el entorno; sin
  # ellas el seeder de credentials falla a propósito en vez de caer a la
  # contraseña del repositorio.
  : "${SEED_SUPERADMIN_EMAIL:?falta SEED_SUPERADMIN_EMAIL}"
  : "${SEED_SUPERADMIN_PASSWORD:?falta SEED_SUPERADMIN_PASSWORD}"

  export SEED_SOLO_SUPERADMIN=1
  export SEED_SIN_ASIGNAR=1

  echo
  echo "▸ permissions (catálogo de roles + SuperAdmin)"
  ( cd apps/backend/services/permissions \
    && DATABASE_URL="$(url_para permissions)" pnpm exec prisma db seed )

  echo
  echo "▸ credentials (una sola cuenta: $SEED_SUPERADMIN_EMAIL)"
  ( cd apps/backend/services/credentials \
    && DATABASE_URL="$(url_para credentials)" pnpm exec prisma db seed )

  echo
  echo "▸ tasks (proyecto con historial fabricado, sin encargados)"
  # `prisma db seed` corre `seed.ts`, que siembra el proyecto de demostración.
  # Aquí hace falta el OTRO: `seed-events.ts`. Se invoca por su script.
  ( cd apps/backend/services/tasks \
    && DATABASE_URL="$(url_para tasks)" pnpm run prisma:seed:events )
fi

echo
echo "✓ Listo."
