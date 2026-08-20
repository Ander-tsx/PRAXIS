-- Los archivos que se le pasan a PRAX, guardados como los del chat de equipo.
--
-- 🔴 Antes viajaban en base64 dentro de la pregunta, y la pregunta va por una
-- Server Action: su cuerpo está topado en 1 MB. Un PNG de teléfono lo pasa de
-- sobra, y lo que se veía era «Body exceeded 1 MB limit» —un error de Next, sin
-- traducir, que no dice qué archivo ni qué hacer—. Además la conversación
-- quedaba mintiendo: el modelo citaba el documento y en el hilo no había rastro.
--
-- Ahora se suben aparte (multipart), quedan como borrador con `messageId` nulo,
-- y el turno los reclama al enviarse. Mismo patrón que `chat_attachments`.

CREATE TABLE "assistant"."assistant_attachments" (
  "id"             TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "messageId"      TEXT,
  "filename"       TEXT NOT NULL,
  "mimeType"       TEXT NOT NULL,
  "size"           INTEGER NOT NULL,
  "uploadedBy"     TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assistant"."assistant_attachment_blobs" (
  "attachmentId" TEXT NOT NULL,
  "data"         BYTEA NOT NULL,
  CONSTRAINT "assistant_attachment_blobs_pkey" PRIMARY KEY ("attachmentId")
);

CREATE INDEX "assistant_attachments_conversationId_messageId_idx"
  ON "assistant"."assistant_attachments" ("conversationId", "messageId");
CREATE INDEX "assistant_attachments_messageId_idx"
  ON "assistant"."assistant_attachments" ("messageId");

-- `CASCADE` en las dos: al borrar una conversación se van sus archivos, y al
-- borrar un mensaje los suyos. Es lo mismo que ya hacen las propuestas, y lo que
-- hace que «borrar una conversación» signifique de verdad borrarla.
ALTER TABLE "assistant"."assistant_attachments"
  ADD CONSTRAINT "assistant_attachments_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "assistant"."assistant_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assistant"."assistant_attachments"
  ADD CONSTRAINT "assistant_attachments_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "assistant"."assistant_messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assistant"."assistant_attachment_blobs"
  ADD CONSTRAINT "assistant_attachment_blobs_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "assistant"."assistant_attachments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
