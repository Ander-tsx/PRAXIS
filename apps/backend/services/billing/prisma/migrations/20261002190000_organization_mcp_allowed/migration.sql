-- El interruptor del MCP por organización (docs/PLAN-MCP.md, M14). Encendido
-- por defecto: solo sirve con un plan que traiga integraciones, y eso ya lo
-- comprueba el plan. Apagarlo no borra tokens: el gateway lo mira en cada llamada.
ALTER TABLE "billing"."organizations" ADD COLUMN "mcpAllowed" BOOLEAN NOT NULL DEFAULT true;
