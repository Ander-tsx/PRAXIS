-- Tokens PRAX (PLAN-PRAX-SEMIAGENTICO, D8 y D9).
-- La cuota pasa de mensajes a tokens ponderados; `used` queda como estadística.
ALTER TABLE "assistant"."assistant_usage" ADD COLUMN "tokens" INTEGER NOT NULL DEFAULT 0;

-- Lo que costó cada respuesta del modelo, para enseñarlo en la conversación.
ALTER TABLE "assistant"."assistant_messages" ADD COLUMN "uso" JSONB;
