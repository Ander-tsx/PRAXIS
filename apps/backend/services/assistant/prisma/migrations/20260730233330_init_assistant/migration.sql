-- CreateEnum
CREATE TYPE "AssistantPlan" AS ENUM ('FREE', 'PRO');

-- CreateTable
CREATE TABLE "assistant_subscriptions" (
    "userId" TEXT NOT NULL,
    "plan" "AssistantPlan" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_subscriptions_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "assistant_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assistant_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_usage_period_idx" ON "assistant_usage"("period");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_usage_userId_period_key" ON "assistant_usage"("userId", "period");
