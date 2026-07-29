-- Comentarios en una tarea.
--
-- `authorId` no lleva clave foránea: el usuario vive en otro microservicio.

-- CreateTable
CREATE TABLE "tasks"."task_comments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Aparte de `updatedAt`: solo se marca «editado» cuando cambia el texto.
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_comments_taskId_createdAt_idx" ON "tasks"."task_comments"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "tasks"."task_comments" ADD CONSTRAINT "task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
