-- CreateEnum
CREATE TYPE "UserPresence" AS ENUM ('AVAILABLE', 'BUSY', 'IN_MEETING', 'EATING', 'AWAY', 'DO_NOT_DISTURB');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "presence" "UserPresence" NOT NULL DEFAULT 'AVAILABLE';

-- CreateTable
CREATE TABLE "user_avatars" (
    "userId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_avatars_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
