-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "sprintAssignedAt" TIMESTAMP(3),
ADD COLUMN     "sprintId" TEXT;

-- CreateIndex
CREATE INDEX "tasks_boardId_sprintId_idx" ON "tasks"("boardId", "sprintId");
