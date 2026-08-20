-- El proyecto deja de definir la conversación y pasa a ser un foco cambiable.
--
-- Antes: una conversación nacía atada a un proyecto y el historial era «mis
-- conversaciones DE ESTE proyecto». Eso obligaba a elegir el proyecto fuera del
-- chat, antes de poder escribir, y partía el historial en tantas listas como
-- proyectos tuvieras.
--
-- Ahora la conversación es de la persona; el proyecto es el foco del momento y
-- puede cambiar a mitad. `Conversation.projectId` guarda el último —es lo que la
-- lista necesita para decir de qué iba— y cada `Message` guarda el suyo.
--
-- ⚠️ Sin pérdida de datos: las conversaciones que ya existen conservan su
-- proyecto, y sus mensajes lo heredan en el UPDATE de abajo. Una conversación
-- vieja sigue leyéndose exactamente igual.

ALTER TABLE "assistant"."assistant_conversations" ALTER COLUMN "projectId" DROP NOT NULL;

ALTER TABLE "assistant"."assistant_messages" ADD COLUMN "projectId" TEXT;

-- Los mensajes de siempre eran todos del proyecto de su conversación.
UPDATE "assistant"."assistant_messages" m
SET "projectId" = c."projectId"
FROM "assistant"."assistant_conversations" c
WHERE m."conversationId" = c."id" AND m."projectId" IS NULL;

-- El listado ya no filtra por proyecto: el índice se reemplaza en vez de sumarse,
-- porque uno que empieza por (userId, projectId) no sirve para ordenar «todas las
-- mías por fecha» y mantenerlo solo cuesta escrituras.
DROP INDEX IF EXISTS "assistant"."assistant_conversations_userId_projectId_updatedAt_idx";
CREATE INDEX "assistant_conversations_userId_updatedAt_idx"
  ON "assistant"."assistant_conversations" ("userId", "updatedAt");
