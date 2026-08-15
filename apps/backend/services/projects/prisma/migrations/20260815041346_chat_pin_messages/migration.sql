-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedById" TEXT;

-- CreateIndex
CREATE INDEX "chat_messages_channelId_pinnedAt_idx" ON "chat_messages"("channelId", "pinnedAt");
