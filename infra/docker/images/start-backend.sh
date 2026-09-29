#!/bin/bash
#
# Arranque del contenedor del backend en Railway.
#
# En GCP las migraciones se aplicaban a mano por SSH (Cloud SQL sin IP pública).
# En Railway el contenedor sí llega a Postgres por la red privada, así que se
# aplican aquí, en el arranque, antes del monolito.
#
# ⚠️ **Idempotente y para 1 réplica.** `prisma migrate deploy` solo aplica lo
# pendiente, pero toma un bloqueo en la base: con varias réplicas arrancando a
# la vez, la segunda falla con un error confuso. El servicio corre con
# `min_replicas = 1`, así que no hay carrera. Si algún día escala, mover esto a
# un `release`/pre-deploy de una sola ejecución.
set -u

echo "==> [start-backend] Aplicando migraciones de Prisma…"
if bash /app/migrar.sh; then
  echo "==> [start-backend] Migraciones al día."
else
  # No se aborta el arranque: si la base no está lista todavía, los servicios
  # con Prisma reintentarán y el gateway —que no tiene base— responde igual el
  # healthcheck. Un fallo aquí se ve en el log, no tumba el contenedor.
  echo "!! [start-backend] migrar.sh terminó con error; el contenedor arranca igual."
fi

# Un solo proceso (docs/PLAN-MONOLITO.md). `exec` para que reciba él el SIGTERM
# de Railway y cierre ordenado: gateway, collab y servicios en orden inverso.
# 512 MB de techo de heap para todo; la huella en reposo ronda los 200 MB.
echo "==> [start-backend] Arrancando el monolito…"
cd /app/apps/backend/monolith
exec node --max-old-space-size=512 dist/main.js
