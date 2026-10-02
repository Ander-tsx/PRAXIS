-- Tokens personales de acceso para el MCP (docs/PLAN-MCP.md, M1).
-- Solo el hash del token; el porqué de cada columna, en `schema.prisma`.

CREATE TABLE "credentials"."personal_access_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "personal_access_tokens_tokenHash_key" ON "credentials"."personal_access_tokens"("tokenHash");
CREATE INDEX "personal_access_tokens_userId_idx" ON "credentials"."personal_access_tokens"("userId");

ALTER TABLE "credentials"."personal_access_tokens"
  ADD CONSTRAINT "personal_access_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "credentials"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
