-- Etiquetas de proyecto, reutilizables entre tableros.
--
-- Sin clave foránea hacia `projects.projects`: vive en otro microservicio, así
-- que la limpieza al borrar un proyecto la hace `task_purge`.

-- CreateTable
CREATE TABLE "tasks"."labels" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks"."task_labels" (
    "taskId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "task_labels_pkey" PRIMARY KEY ("taskId","labelId")
);

-- CreateIndex
CREATE INDEX "labels_projectId_idx" ON "tasks"."labels"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "labels_projectId_name_key" ON "tasks"."labels"("projectId", "name");

-- CreateIndex
CREATE INDEX "task_labels_labelId_idx" ON "tasks"."task_labels"("labelId");

-- AddForeignKey
ALTER TABLE "tasks"."task_labels" ADD CONSTRAINT "task_labels_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks"."task_labels" ADD CONSTRAINT "task_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "tasks"."labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
