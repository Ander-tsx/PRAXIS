CREATE TYPE "automation"."InboundEventStatus" AS ENUM ('ACCEPTED');

CREATE TABLE "automation"."inbound_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "correlationId" TEXT NOT NULL,
    "causationId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "automation"."InboundEventStatus" NOT NULL DEFAULT 'ACCEPTED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inbound_events_eventId_key" ON "automation"."inbound_events"("eventId");
CREATE UNIQUE INDEX "inbound_events_dedupeKey_key" ON "automation"."inbound_events"("dedupeKey");
CREATE INDEX "inbound_events_projectId_receivedAt_idx" ON "automation"."inbound_events"("projectId", "receivedAt");
CREATE INDEX "inbound_events_status_receivedAt_idx" ON "automation"."inbound_events"("status", "receivedAt");
