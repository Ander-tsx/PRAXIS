-- Registro de coautoría: lo que hace un agente de IA por el MCP, a nombre de quién.
CREATE TABLE "credentials"."mcp_actions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "agentKind" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "entityId" TEXT,
    "taskId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mcp_actions_taskId_area_createdAt_idx" ON "credentials"."mcp_actions"("taskId", "area", "createdAt");
CREATE INDEX "mcp_actions_userId_createdAt_idx" ON "credentials"."mcp_actions"("userId", "createdAt");
