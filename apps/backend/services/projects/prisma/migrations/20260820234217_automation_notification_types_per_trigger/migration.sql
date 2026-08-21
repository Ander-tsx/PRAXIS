-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'AUTOMATION_TASK_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'AUTOMATION_TASK_UNASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'AUTOMATION_TASK_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'AUTOMATION_TASK_MOVED';
ALTER TYPE "NotificationType" ADD VALUE 'AUTOMATION_TASK_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'AUTOMATION_TASK_REOPENED';
ALTER TYPE "NotificationType" ADD VALUE 'AUTOMATION_TASK_ASSIGNEES_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'AUTOMATION_TASK_DUE_DATE_CHANGED';
