CREATE TYPE "automation"."ScheduledOccurrenceStatus" AS ENUM ('PENDING', 'ENQUEUED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "automation"."RuleExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'SKIPPED', 'FAILED');
CREATE TYPE "automation"."ActionExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'SKIPPED', 'FAILED');
CREATE TYPE "automation"."ActionAttemptStatus" AS ENUM ('SUCCEEDED', 'RETRYABLE_FAILURE', 'TERMINAL_FAILURE');

CREATE TABLE "automation"."scheduled_occurrences" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "automation"."ScheduledOccurrenceStatus" NOT NULL DEFAULT 'PENDING',
  "ruleVersion" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scheduled_occurrences_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "automation"."rule_executions" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "scheduledOccurrenceId" TEXT,
  "ruleVersion" INTEGER NOT NULL,
  "causeKey" TEXT NOT NULL,
  "ruleSnapshot" JSONB NOT NULL,
  "conditionResult" JSONB NOT NULL,
  "status" "automation"."RuleExecutionStatus" NOT NULL DEFAULT 'PENDING',
  "error" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rule_executions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "automation"."action_executions" (
  "id" TEXT NOT NULL,
  "ruleExecutionId" TEXT NOT NULL,
  "actionPosition" INTEGER NOT NULL,
  "targetKey" TEXT NOT NULL,
  "actionSnapshot" JSONB NOT NULL,
  "status" "automation"."ActionExecutionStatus" NOT NULL DEFAULT 'PENDING',
  "error" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "action_executions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "automation"."action_attempts" (
  "id" TEXT NOT NULL,
  "actionExecutionId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" "automation"."ActionAttemptStatus" NOT NULL,
  "error" JSONB,
  "response" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "action_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "scheduled_occurrences_idempotencyKey_key" ON "automation"."scheduled_occurrences"("idempotencyKey");
CREATE UNIQUE INDEX "rule_executions_ruleId_causeKey_key" ON "automation"."rule_executions"("ruleId", "causeKey");
CREATE UNIQUE INDEX "action_executions_ruleExecutionId_actionPosition_targetKey_key" ON "automation"."action_executions"("ruleExecutionId", "actionPosition", "targetKey");
CREATE UNIQUE INDEX "action_attempts_actionExecutionId_attemptNumber_key" ON "automation"."action_attempts"("actionExecutionId", "attemptNumber");
CREATE INDEX "scheduled_occurrences_status_scheduledFor_idx" ON "automation"."scheduled_occurrences"("status", "scheduledFor");
CREATE INDEX "scheduled_occurrences_ruleId_status_idx" ON "automation"."scheduled_occurrences"("ruleId", "status");
CREATE INDEX "rule_executions_ruleId_createdAt_idx" ON "automation"."rule_executions"("ruleId", "createdAt");
CREATE INDEX "rule_executions_status_createdAt_idx" ON "automation"."rule_executions"("status", "createdAt");
CREATE INDEX "action_executions_status_createdAt_idx" ON "automation"."action_executions"("status", "createdAt");
CREATE INDEX "action_attempts_actionExecutionId_startedAt_idx" ON "automation"."action_attempts"("actionExecutionId", "startedAt");
ALTER TABLE "automation"."scheduled_occurrences" ADD CONSTRAINT "scheduled_occurrences_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation"."automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation"."rule_executions" ADD CONSTRAINT "rule_executions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation"."automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation"."rule_executions" ADD CONSTRAINT "rule_executions_scheduledOccurrenceId_fkey" FOREIGN KEY ("scheduledOccurrenceId") REFERENCES "automation"."scheduled_occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "automation"."action_executions" ADD CONSTRAINT "action_executions_ruleExecutionId_fkey" FOREIGN KEY ("ruleExecutionId") REFERENCES "automation"."rule_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation"."action_attempts" ADD CONSTRAINT "action_attempts_actionExecutionId_fkey" FOREIGN KEY ("actionExecutionId") REFERENCES "automation"."action_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
