-- CreateTable
CREATE TABLE "alexa_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "voice_token_hash" TEXT NOT NULL,
    "alexa_user_id" TEXT NOT NULL,
    "device_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,

    CONSTRAINT "alexa_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alexa_link_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phrase_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "redeemed_at" TIMESTAMP(3),

    CONSTRAINT "alexa_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_query_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "linkId" TEXT,
    "projectId" TEXT,
    "queryType" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_query_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alexa_sessions_voice_token_hash_key" ON "alexa_sessions"("voice_token_hash");

-- CreateIndex
CREATE INDEX "alexa_sessions_voice_token_hash_idx" ON "alexa_sessions"("voice_token_hash");

-- CreateIndex
CREATE INDEX "alexa_sessions_user_id_idx" ON "alexa_sessions"("user_id");

-- CreateIndex
CREATE INDEX "alexa_sessions_expires_at_idx" ON "alexa_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "alexa_link_codes_phrase_hash_key" ON "alexa_link_codes"("phrase_hash");

-- CreateIndex
CREATE INDEX "alexa_link_codes_phrase_hash_idx" ON "alexa_link_codes"("phrase_hash");

-- CreateIndex
CREATE INDEX "alexa_link_codes_user_id_idx" ON "alexa_link_codes"("user_id");

-- CreateIndex
CREATE INDEX "alexa_link_codes_expires_at_idx" ON "alexa_link_codes"("expires_at");

-- CreateIndex
CREATE INDEX "voice_query_logs_userId_createdAt_idx" ON "voice_query_logs"("userId", "createdAt");
