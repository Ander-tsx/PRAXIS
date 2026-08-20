-- Un adjunto puede existir antes que su conversación.
--
-- Se sube antes de escribir el mensaje, y en un chat recién abierto todavía no
-- hay conversación. Exigirla obligaba a crear una vacía solo para poder
-- adjuntar, y la que se abandonara sin llegar a enviar nada se quedaría en el
-- historial. El turno rellena `conversationId` y `messageId` a la vez al
-- reclamar el borrador.
ALTER TABLE "assistant"."assistant_attachments"
  ALTER COLUMN "conversationId" DROP NOT NULL;

-- Los borradores de una persona: la consulta del compositor y la de la limpieza
-- de huérfanos, que no tienen conversación con la que filtrar.
CREATE INDEX IF NOT EXISTS "assistant_attachments_uploadedBy_messageId_idx"
  ON "assistant"."assistant_attachments" ("uploadedBy", "messageId");
