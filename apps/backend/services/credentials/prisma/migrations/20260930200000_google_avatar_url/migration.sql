-- AlterTable
ALTER TABLE "users" ADD COLUMN     "googleAvatarUrl" TEXT;

-- Relleno: quien entró con Google y no ha cambiado su foto tiene la de Google en
-- `avatarUrl` (una URL absoluta). Se copia para poder volver a ella más tarde.
UPDATE "users" SET "googleAvatarUrl" = "avatarUrl" WHERE "avatarUrl" LIKE 'https://%';
