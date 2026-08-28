-- AlterTable
ALTER TABLE "users" ADD COLUMN     "biography" TEXT,
ADD COLUMN     "coverUrl" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "professionalInfo" JSONB,
ALTER COLUMN "presence" SET DEFAULT 'AWAY';

-- CreateTable
CREATE TABLE "user_covers" (
    "userId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_covers_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "user_covers" ADD CONSTRAINT "user_covers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
