-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'INVITATION_RECEIVED',
  'INVITATION_ACCEPTED',
  'INVITATION_REJECTED',
  'MEMBER_LEFT',
  'MEMBER_REMOVED',
  'TASK_ASSIGNED',
  'TASK_UNASSIGNED'
);

-- CreateTable
--
-- Sin claves foráneas a propósito: un aviso es un hecho del pasado y tiene que
-- sobrevivir al borrado de aquello de lo que habla. De ahí las copias de
-- `projectName` y `taskTitle`.
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "actorId" TEXT,
    "projectId" TEXT,
    "projectName" TEXT,
    "taskId" TEXT,
    "taskTitle" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");
