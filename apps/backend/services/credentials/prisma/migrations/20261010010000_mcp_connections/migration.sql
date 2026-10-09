-- Conexiones de clientes de IA al MCP por OAuth (Kyloo Accounts).
-- Ver el modelo `McpConnection` en schema.prisma.

-- CreateTable
CREATE TABLE "credentials"."mcp_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "kylooSub" TEXT NOT NULL,
    "allowedOrgIds" TEXT[],
    "activeOrgId" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_connections_userId_clientId_key" ON "credentials"."mcp_connections"("userId", "clientId");

-- AddForeignKey
ALTER TABLE "credentials"."mcp_connections" ADD CONSTRAINT "mcp_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "credentials"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
