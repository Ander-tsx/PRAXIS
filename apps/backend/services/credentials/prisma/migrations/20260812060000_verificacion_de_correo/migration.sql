-- Confirmacion de correo y tokens de un solo uso.

CREATE TYPE "credentials"."AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

ALTER TABLE "credentials"."credentials" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- ⚠️ Las cuentas que ya existen se dan por verificadas.
--
-- No es indulgencia: la verificacion existe para frenar registros nuevos en
-- masa, y estas cuentas ya estan creadas. Dejarlas sin verificar habria dejado
-- fuera del sistema a todo el mundo de golpe, incluidas las de las pruebas y la
-- del propio administrador, sin ninguna forma de entrar a arreglarlo.
--
-- Se usa `createdAt` y no `now()` para no afirmar que se verificaron hoy.
UPDATE "credentials"."credentials" SET "emailVerifiedAt" = "createdAt";

CREATE TABLE "credentials"."auth_tokens" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "type" "credentials"."AuthTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "credentials"."auth_tokens"("tokenHash");
CREATE INDEX "auth_tokens_credentialId_type_idx" ON "credentials"."auth_tokens"("credentialId", "type");

ALTER TABLE "credentials"."auth_tokens"
  ADD CONSTRAINT "auth_tokens_credentialId_fkey"
  FOREIGN KEY ("credentialId") REFERENCES "credentials"."credentials"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
