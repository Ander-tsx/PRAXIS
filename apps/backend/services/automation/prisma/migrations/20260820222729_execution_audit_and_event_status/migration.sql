/*
  Warnings:

  - Made the column `startedAt` on table `rule_executions` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InboundEventStatus" ADD VALUE 'PROCESSED';
ALTER TYPE "InboundEventStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "inbound_events" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rule_executions" ADD COLUMN     "subjectId" TEXT,
ADD COLUMN     "subjectTitle" TEXT,
ADD COLUMN     "triggerType" TEXT,
ALTER COLUMN "startedAt" SET NOT NULL,
ALTER COLUMN "startedAt" SET DEFAULT CURRENT_TIMESTAMP;
