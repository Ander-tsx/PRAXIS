DROP TABLE IF EXISTS "automation"."action_attempts";
DROP TABLE IF EXISTS "automation"."action_executions";

ALTER TABLE "automation"."rule_executions"
  DROP CONSTRAINT IF EXISTS "rule_executions_scheduledOccurrenceId_fkey",
  DROP COLUMN IF EXISTS "scheduledOccurrenceId",
  ADD COLUMN IF NOT EXISTS "actionResults" JSONB;

DROP TABLE IF EXISTS "automation"."scheduled_occurrences";

ALTER TYPE "automation"."RuleExecutionStatus" RENAME TO "RuleExecutionStatus_old";
CREATE TYPE "automation"."RuleExecutionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'SKIPPED', 'FAILED');
ALTER TABLE "automation"."rule_executions"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "automation"."RuleExecutionStatus"
    USING (CASE WHEN "status"::text = 'PENDING' THEN 'RUNNING' ELSE "status"::text END)::"automation"."RuleExecutionStatus",
  ALTER COLUMN "status" SET DEFAULT 'RUNNING';
DROP TYPE "automation"."RuleExecutionStatus_old";

DROP TYPE IF EXISTS "automation"."ScheduledOccurrenceStatus";
DROP TYPE IF EXISTS "automation"."ActionExecutionStatus";
DROP TYPE IF EXISTS "automation"."ActionAttemptStatus";
