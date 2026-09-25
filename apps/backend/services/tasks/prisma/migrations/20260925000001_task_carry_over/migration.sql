-- Veces que una tarea pasó sin terminar de un sprint al siguiente.
ALTER TABLE "tasks" ADD COLUMN "carryOverCount" INTEGER NOT NULL DEFAULT 0;
