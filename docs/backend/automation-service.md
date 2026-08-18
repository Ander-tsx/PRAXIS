# Automation service

`@praxis/automation-service` es el dueño futuro de las reglas y ejecuciones de
automatización. En el Bloque 2 solo ofrece una base operativa: Prisma en el
schema PostgreSQL `automation`, Redis y un health check TCP.

## Arranque local

1. Copia `.env.example` como `.env` dentro de
   `apps/backend/services/automation`.
2. Con PostgreSQL y Redis disponibles, ejecuta `pnpm prisma:generate` y
   `pnpm prisma:deploy` desde la raíz.
3. Inicia con `pnpm --filter @praxis/automation-service dev`, o inclúyelo en
   `pnpm dev:cli`.

Escucha TCP en el puerto `3008` y responde `{ status: 'ok' }` al patrón
`{ cmd: 'automation_health' }`. No se publica ninguna ruta HTTP ni se crean
reglas, colas, eventos o integraciones en este bloque.
