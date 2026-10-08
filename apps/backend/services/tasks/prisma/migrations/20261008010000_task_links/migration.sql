-- Enlaces adjuntos a una tarea (docs/PLAN-CAMPOS-PERSONALIZADOS.md, segunda entrega).
-- Solo aditiva: una tabla nueva; no toca ninguna columna existente.
-- CreateTable
CREATE TABLE "task_links" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_links_taskId_idx" ON "task_links"("taskId");

-- AddForeignKey
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

