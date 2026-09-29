-- De dónde vino un mensaje de chat (D13 de docs/PLAN-PRAX-SEMIAGENTICO.md).
-- Todos los que ya existen son de personas: el valor por defecto lo dice.
-- CreateEnum
CREATE TYPE "ChatMessageOrigin" AS ENUM ('USER', 'AUTOMATION', 'ASSISTANT');

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "origin" "ChatMessageOrigin" NOT NULL DEFAULT 'USER',
ADD COLUMN     "originMeta" JSONB;
