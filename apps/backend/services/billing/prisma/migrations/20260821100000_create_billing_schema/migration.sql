CREATE SCHEMA IF NOT EXISTS "billing";

CREATE TYPE "billing"."PlanTier" AS ENUM ('FREE', 'PLUS', 'PRO', 'TEAM', 'BUSINESS');
CREATE TYPE "billing"."OrganizationKind" AS ENUM ('PERSONAL', 'ENTERPRISE');
CREATE TYPE "billing"."OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "billing"."MembershipStatus" AS ENUM ('INVITED', 'ACTIVE');
CREATE TYPE "billing"."SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED');

CREATE TABLE "billing"."organizations" (
    "id" TEXT NOT NULL,
    "kind" "billing"."OrganizationKind" NOT NULL DEFAULT 'PERSONAL',
    "name" TEXT,
    "slug" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "billing"."organizations"("slug");
CREATE INDEX "organizations_ownerUserId_idx" ON "billing"."organizations"("ownerUserId");

-- ⚠️ Único **parcial**: una sola organización personal por cuenta, pero varias
-- de empresa del mismo dueño son legítimas. Prisma no sabe expresar un índice
-- con `WHERE`, así que va a mano — y no es opcional: sin él, dos peticiones
-- simultáneas de alguien que aún no tiene organización crean dos, y la segunda
-- se queda con las cuotas mientras la primera guarda la suscripción.
CREATE UNIQUE INDEX "organizations_personal_por_usuario"
    ON "billing"."organizations"("ownerUserId")
    WHERE "kind" = 'PERSONAL';

CREATE TABLE "billing"."organization_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "role" "billing"."OrganizationRole" NOT NULL DEFAULT 'MEMBER',
    "status" "billing"."MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_members_inviteTokenHash_key" ON "billing"."organization_members"("inviteTokenHash");
CREATE UNIQUE INDEX "organization_members_organizationId_email_key" ON "billing"."organization_members"("organizationId", "email");
CREATE UNIQUE INDEX "organization_members_organizationId_userId_key" ON "billing"."organization_members"("organizationId", "userId");
CREATE INDEX "organization_members_userId_idx" ON "billing"."organization_members"("userId");

CREATE TABLE "billing"."subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tier" "billing"."PlanTier" NOT NULL DEFAULT 'FREE',
    "status" "billing"."SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "seats" INTEGER NOT NULL DEFAULT 1,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "billing"."subscriptions"("organizationId");
CREATE UNIQUE INDEX "subscriptions_stripeCustomerId_key" ON "billing"."subscriptions"("stripeCustomerId");
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "billing"."subscriptions"("stripeSubscriptionId");

CREATE TABLE "billing"."billing_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "stripeEventId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_events_stripeEventId_key" ON "billing"."billing_events"("stripeEventId");
CREATE INDEX "billing_events_organizationId_occurredAt_idx" ON "billing"."billing_events"("organizationId", "occurredAt");

ALTER TABLE "billing"."organization_members"
    ADD CONSTRAINT "organization_members_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "billing"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing"."subscriptions"
    ADD CONSTRAINT "subscriptions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "billing"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing"."billing_events"
    ADD CONSTRAINT "billing_events_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "billing"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
