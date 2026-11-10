-- Coautoría de los agentes de IA (MCP): quién marcó cada paso del checklist y
-- qué notas escribió un agente. Todo opcional: las filas existentes no cambian.
ALTER TABLE "tasks"."checklists"
  ADD COLUMN "completedById" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "completedVia" TEXT;

ALTER TABLE "tasks"."task_comments"
  ADD COLUMN "viaAgent" TEXT;
