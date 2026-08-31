-- El consumo del asistente pasa a contarse por organización.
--
-- Desde que el plan vale solo dentro de la organización que lo paga, un
-- contador con clave (persona, mes) no se puede aplicar: quien gastara 50
-- mensajes en la BUSINESS de su empresa entraría en su espacio personal
-- —tope 13— ya por encima del límite.
--
-- Las filas que ya existen se quedan con cadena vacía, que es «sin
-- organización». No se reparten entre organizaciones porque no hay forma de
-- saber dónde se gastaron, y repartirlas a ojo falsearía el histórico —que es
-- justo lo que esta tabla existe para conservar.

ALTER TABLE "assistant"."assistant_usage"
  ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "assistant"."assistant_usage_userId_period_key";

CREATE UNIQUE INDEX "assistant_usage_userId_organizationId_period_key"
  ON "assistant"."assistant_usage" ("userId", "organizationId", "period");
