-- Adjuntos de tarea, guardados en la propia base.
--
-- Los metadatos y los bytes van en tablas distintas a propósito: así un SELECT
-- sobre `task_attachments` —o un include distraído desde la tarea— no puede
-- arrastrar megabytes. El contenido solo se lee en la ruta de descarga.

-- CreateTable
CREATE TABLE "tasks"."task_attachments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    -- Bytes reales medidos en el servidor, no los que declare el cliente.
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks"."attachment_blobs" (
    "attachmentId" TEXT NOT NULL,
    -- bytea: Postgres lo saca del bloque principal vía TOAST.
    "data" BYTEA NOT NULL,

    CONSTRAINT "attachment_blobs_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateIndex
CREATE INDEX "task_attachments_taskId_createdAt_idx" ON "tasks"."task_attachments"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "tasks"."task_attachments" ADD CONSTRAINT "task_attachments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks"."attachment_blobs" ADD CONSTRAINT "attachment_blobs_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "tasks"."task_attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
