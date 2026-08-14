-- Los dos identificadores que Stripe devuelve al cobrar.
--
-- No son secretos y no sirven para cobrar nada: son referencias al cliente y a
-- la suscripción dentro de Stripe. Los datos de tarjeta nunca pasan por aquí —
-- la página de pago la sirve Stripe (Checkout alojado).
--
-- `stripeSubscriptionId` es la clave por la que se busca al cancelar: el webhook
-- de baja no trae nuestro `userId`, solo lo que es de Stripe.
--
-- Aditivo y con las dos columnas anulables, así que la versión anterior sigue
-- funcionando contra este esquema y se puede aplicar antes de desplegar.

-- AlterTable
ALTER TABLE "assistant"."assistant_subscriptions"
  ADD COLUMN "stripeCustomerId"     TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT;

-- CreateIndex
-- Únicos: dos cuentas nuestras no pueden apuntar al mismo cliente ni a la misma
-- suscripción de Stripe. En Postgres un índice único deja pasar varios NULL, que
-- es justo lo que hace falta mientras casi nadie ha pagado.
CREATE UNIQUE INDEX "assistant_subscriptions_stripeCustomerId_key"
  ON "assistant"."assistant_subscriptions"("stripeCustomerId");

CREATE UNIQUE INDEX "assistant_subscriptions_stripeSubscriptionId_key"
  ON "assistant"."assistant_subscriptions"("stripeSubscriptionId");
