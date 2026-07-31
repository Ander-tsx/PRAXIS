-- Varios encargados por tarea.
--
-- Sustituye `tasks.assigneeId` (un solo campo) por una tabla intermedia. Se
-- migra en vez de mantener los dos: dos fuentes para el mismo hecho divergen, y
-- «¿quién está asignado?» pasaría a tener dos respuestas.
--
-- ⚠️ El orden importa: primero se copian los encargados que ya había y solo
-- después se borra la columna. Al revés se perderían.

-- CreateTable
CREATE TABLE "tasks"."task_assignees" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_assignees_userId_idx" ON "tasks"."task_assignees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignees_taskId_userId_key" ON "tasks"."task_assignees"("taskId", "userId");

-- AddForeignKey
ALTER TABLE "tasks"."task_assignees" ADD CONSTRAINT "task_assignees_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Traspaso de datos: cada `assigneeId` que hubiera se convierte en una fila.
-- `assignedBy` queda como el `reporterId`, que es lo más cercano a la verdad
-- que se puede reconstruir: no se guardaba quién había asignado.
INSERT INTO "tasks"."task_assignees" ("id", "taskId", "userId", "assignedBy", "assignedAt")
SELECT gen_random_uuid()::text, "id", "assigneeId", "reporterId", "createdAt"
FROM "tasks"."tasks"
WHERE "assigneeId" IS NOT NULL;

-- DropColumn
ALTER TABLE "tasks"."tasks" DROP COLUMN "assigneeId";

-- CreateIndex
CREATE INDEX "tasks_projectId_dueDate_idx" ON "tasks"."tasks"("projectId", "dueDate");
