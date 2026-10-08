-- Campos personalizados por proyecto (docs/PLAN-CAMPOS-PERSONALIZADOS.md).
-- Solo aditiva: dos tablas y un tipo nuevos; no toca ninguna columna de tasks.
-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'PERSON', 'CHECKBOX', 'URL');

-- CreateTable
CREATE TABLE "custom_fields" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "showOnCard" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_field_values" (
    "taskId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "text" TEXT,
    "number" DOUBLE PRECISION,
    "date" TIMESTAMP(3),
    "bool" BOOLEAN,
    "ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_field_values_pkey" PRIMARY KEY ("taskId","fieldId")
);

-- CreateIndex
CREATE INDEX "custom_fields_projectId_idx" ON "custom_fields"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_fields_projectId_name_key" ON "custom_fields"("projectId", "name");

-- CreateIndex
CREATE INDEX "task_field_values_fieldId_idx" ON "task_field_values"("fieldId");

-- AddForeignKey
ALTER TABLE "task_field_values" ADD CONSTRAINT "task_field_values_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_field_values" ADD CONSTRAINT "task_field_values_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

