-- Adjuntos del chat: metadatos y bytes separados, con borradores hasta enviar.
--
-- El archivo se sube ANTES de escribir el mensaje y queda en borrador
-- (`messageId` nulo) hasta que el mensaje lo reclama al enviarse. Eso permite
-- adjuntar varios archivos, enseñarlos como chips y mandarlos todos de una vez
-- con el cuerpo.
--
-- Todo es aditivo: no toca ninguna tabla existente.

-- CreateTable
-- Metadatos. Los bytes NO viven aquí: en Postgres van a `chat_attachment_blobs`
-- (fila aparte, para que ningún listado pueda arrastrarlos) y en GCS al bucket
-- (esta tabla quedaría vacía y la API no cambia).
CREATE TABLE "projects"."chat_attachments" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    -- NULL = borrador, aún no enviado con ningún mensaje.
    "messageId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    -- Bytes reales, medidos en el servidor y no declarados por el cliente.
    "size" INTEGER NOT NULL,
    -- Quién lo subió. Sin clave foránea, como `chat_messages.authorId`.
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Los bytes, uno a uno con el adjunto. Solo se llena cuando el proveedor
-- activo es Postgres; GCS los lleva en el bucket.
CREATE TABLE "projects"."chat_attachment_blobs" (
    "attachmentId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "chat_attachment_blobs_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateIndex
-- El acceso de los mensajes: los adjuntos de un mensaje (y, por el índice
-- compuesto, también los borradores de un canal sin mensaje).
CREATE INDEX "chat_attachments_channelId_messageId_idx"
  ON "projects"."chat_attachments"("channelId", "messageId");

-- CreateIndex
CREATE INDEX "chat_attachments_messageId_idx" ON "projects"."chat_attachments"("messageId");

-- AddForeignKey
-- Borrar un canal se lleva sus adjuntos, como ya hace con los mensajes.
ALTER TABLE "projects"."chat_attachments"
  ADD CONSTRAINT "chat_attachments_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "projects"."chat_channels"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Borrar un mensaje se lleva sus adjuntos: son de ese mensaje, no sobreviven
-- a él. Al revés que las respuestas, que sí se quedan. Un borrador (messageId
-- nulo) no se ve afectado.
ALTER TABLE "projects"."chat_attachments"
  ADD CONSTRAINT "chat_attachments_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "projects"."chat_messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects"."chat_attachment_blobs"
  ADD CONSTRAINT "chat_attachment_blobs_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "projects"."chat_attachments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;