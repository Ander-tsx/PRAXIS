#!/bin/bash
#
# El monolito en local, construido, con las variables de los `.env` de
# desarrollo de cada servicio.
#
# Se leen con `node --env-file` y no con `source`: un `.env` admite valores que
# la shell no (paréntesis, espacios sin comillas) y `source` se salta esas líneas
# sin detenerse — la variable falta y el servicio arranca con otra cosa.
#
# Los `.env` repiten claves (`DATABASE_URL`, `TCP_PORT`…); da igual cuál gane,
# porque el monolito compone las suyas por servicio (src/entorno.ts).
set -euo pipefail
cd "$(dirname "$0")/../../../.."

ARGS=()
for f in apps/backend/services/{credentials,permissions,projects,tasks,reports,assistant,automation,billing,collab}/.env apps/backend/gateway/.env; do
  [ -f "$f" ] && ARGS+=("--env-file=$PWD/$f")
done

cd apps/backend/monolith
exec env NODE_ENV="${NODE_ENV:-production}" node "${ARGS[@]}" --max-old-space-size=512 dist/main.js
