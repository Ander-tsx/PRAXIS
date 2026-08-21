CREATE TABLE "projects"."domain_outbox" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
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
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "domain_outbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "domain_outbox_eventId_key" ON "projects"."domain_outbox"("eventId");
CREATE INDEX "domain_outbox_publishedAt_createdAt_idx" ON "projects"."domain_outbox"("publishedAt", "createdAt");
CREATE INDEX "domain_outbox_projectId_createdAt_idx" ON "projects"."domain_outbox"("projectId", "createdAt");
