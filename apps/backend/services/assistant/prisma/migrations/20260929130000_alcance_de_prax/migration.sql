-- «Recursos»: qué proyectos puede consultar PRAX, por persona y organización
-- (PLAN-PRAX-SEMIAGENTICO, D5). Sin fila, ALL.
CREATE TYPE "assistant"."AssistantScopeMode" AS ENUM ('ALL', 'SELECTED');

CREATE TABLE "assistant"."assistant_scopes" (
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mode" "assistant"."AssistantScopeMode" NOT NULL DEFAULT 'ALL',
    "projectIds" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_scopes_pkey" PRIMARY KEY ("userId","organizationId")
);
