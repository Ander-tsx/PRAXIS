-- El instante real en que se empezó el sprint (auditoría S1).
ALTER TABLE "sprints" ADD COLUMN "startedAt" TIMESTAMP(3);

-- Los sprints que ya estaban en marcha: su mejor aproximación es la fecha de inicio.
UPDATE "sprints" SET "startedAt" = "startDate" WHERE "status" <> 'PLANNED' AND "startedAt" IS NULL;

-- Como mucho un sprint ACTIVE por tablero (D3, auditoría S9). Antes lo
-- comprobaba el servicio leyendo y luego escribiendo: dos inicios a la vez
-- dejaban dos activos. Prisma no sabe declarar un índice parcial.
CREATE UNIQUE INDEX "sprints_one_active_per_board" ON "sprints"("boardId") WHERE "status" = 'ACTIVE';
