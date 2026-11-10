-- Coautoría de los agentes de IA: apagada por defecto, la enciende quien administra la organización.
ALTER TABLE "billing"."organizations" ADD COLUMN "agentAttribution" BOOLEAN NOT NULL DEFAULT false;
