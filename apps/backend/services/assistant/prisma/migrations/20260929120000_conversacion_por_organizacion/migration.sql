-- La organización en la que se tuvo cada conversación (PLAN-PRAX-SEMIAGENTICO, D6).
--
-- Cadena vacía y no NULL, como AssistantUsage: '' son las de antes de esta
-- columna. Se enseñan en la organización personal y adoptan la del primer turno
-- que reciban. No se rellenan aquí porque la organización personal vive en otro
-- schema (billing), y una migración no cruza servicios.
ALTER TABLE "assistant"."assistant_conversations"
  ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT '';

CREATE INDEX "assistant_conversations_userId_organizationId_updatedAt_idx"
  ON "assistant"."assistant_conversations"("userId", "organizationId", "updatedAt");
