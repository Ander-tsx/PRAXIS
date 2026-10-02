-- Un plan concedido desde administración, sin Stripe. Nulo = lo decide Stripe.
-- Mientras haya concesión, el webhook no toca la fila (ver schema.prisma).
ALTER TABLE "billing"."subscriptions" ADD COLUMN "grantedBy" TEXT;
ALTER TABLE "billing"."subscriptions" ADD COLUMN "grantedAt" TIMESTAMP(3);
