CREATE TYPE "automation"."AutomationRuleStatus" AS ENUM ('ENABLED', 'DISABLED', 'PAUSED_SYSTEM', 'INVALID');

CREATE TABLE "automation"."automation_rules" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "automation"."AutomationRuleStatus" NOT NULL DEFAULT 'DISABLED',
    "pausedAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation"."automation_triggers" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    CONSTRAINT "automation_triggers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation"."automation_conditions" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "automation_conditions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation"."automation_actions" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "automation_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automation_triggers_ruleId_key" ON "automation"."automation_triggers"("ruleId");
CREATE UNIQUE INDEX "automation_conditions_ruleId_position_key" ON "automation"."automation_conditions"("ruleId", "position");
CREATE UNIQUE INDEX "automation_actions_ruleId_position_key" ON "automation"."automation_actions"("ruleId", "position");
CREATE INDEX "automation_rules_projectId_createdAt_idx" ON "automation"."automation_rules"("projectId", "createdAt");
CREATE INDEX "automation_rules_projectId_status_idx" ON "automation"."automation_rules"("projectId", "status");

ALTER TABLE "automation"."automation_triggers" ADD CONSTRAINT "automation_triggers_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation"."automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation"."automation_conditions" ADD CONSTRAINT "automation_conditions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation"."automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation"."automation_actions" ADD CONSTRAINT "automation_actions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation"."automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
