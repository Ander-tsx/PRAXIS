-- Quién ya usó el mes gratis (docs/PLAN-PRO-INTEGRACIONES.md, D9).
--
-- El mes gratis es uno por persona y uno por organización. Antes no lo
-- comprobaba nadie: suscribirse, cancelar antes del cobro y repetir daba el
-- plan gratis para siempre. El porqué de cada índice, en `schema.prisma`.

CREATE TABLE "billing"."trial_redemptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "tier" "billing"."PlanTier" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trial_redemptions_userId_key" ON "billing"."trial_redemptions"("userId");
CREATE UNIQUE INDEX "trial_redemptions_stripeSubscriptionId_key" ON "billing"."trial_redemptions"("stripeSubscriptionId");
CREATE INDEX "trial_redemptions_organizationId_idx" ON "billing"."trial_redemptions"("organizationId");

-- ⚠️ Las pruebas que ya se dieron (las de Equipo) cuentan. Sin esto, quien
-- disfrutó del mes gratis de Equipo tendría otro en Pro. Se atribuye al dueño
-- de la organización, que es quien abre el checkout; una fila por persona.
INSERT INTO "billing"."trial_redemptions" ("id", "userId", "organizationId", "stripeSubscriptionId", "tier", "createdAt")
SELECT DISTINCT ON (o."ownerUserId")
       gen_random_uuid()::text, o."ownerUserId", s."organizationId", s."stripeSubscriptionId", s."tier", s."createdAt"
  FROM "billing"."subscriptions" s
  JOIN "billing"."organizations" o ON o."id" = s."organizationId"
 WHERE s."trialEndsAt" IS NOT NULL
 ORDER BY o."ownerUserId", s."createdAt";
