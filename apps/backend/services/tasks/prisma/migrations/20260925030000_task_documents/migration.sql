-- Documentos vinculados a una tarea (E9 de docs/PLAN-DOCUMENTOS.md).
-- CreateTable
CREATE TABLE "task_documents" (
    "taskId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "linkedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_documents_pkey" PRIMARY KEY ("taskId","documentId")
);

-- CreateIndex
CREATE INDEX "task_documents_documentId_idx" ON "task_documents"("documentId");

-- AddForeignKey
ALTER TABLE "task_documents" ADD CONSTRAINT "task_documents_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

