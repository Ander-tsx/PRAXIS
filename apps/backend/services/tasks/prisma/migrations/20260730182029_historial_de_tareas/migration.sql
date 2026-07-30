-- CreateEnum
CREATE TYPE "TaskEventType" AS ENUM ('CREATED', 'MOVED', 'COMPLETED', 'REOPENED', 'ASSIGNED', 'UNASSIGNED', 'PRIORITY_CHANGED', 'DELETED');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "task_events" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "type" "TaskEventType" NOT NULL,
    "fromColumnId" TEXT,
    "toColumnId" TEXT,
    "fromPriority" "Priority",
    "toPriority" "Priority",
    "subjectId" TEXT,
    "actorId" TEXT NOT NULL,
    "taskTitle" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_events_projectId_occurredAt_idx" ON "task_events"("projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "task_events_taskId_occurredAt_idx" ON "task_events"("taskId", "occurredAt");

-- CreateIndex
CREATE INDEX "task_events_projectId_type_occurredAt_idx" ON "task_events"("projectId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "tasks_projectId_completedAt_idx" ON "tasks"("projectId", "completedAt");
