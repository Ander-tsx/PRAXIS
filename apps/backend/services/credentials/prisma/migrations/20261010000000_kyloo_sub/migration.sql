-- Identidad de Kyloo Accounts en las credenciales.
--
-- `kylooSub` es el `sub` del id_token que emite Kyloo Accounts: el identificador estable de la
-- persona en todo el ecosistema Kyloo, igual que `googleSub` lo es para Google. Nace NULL en todas
-- las filas actuales (ninguna entró con Kyloo) y es único para que dos credenciales no puedan
-- reclamar la misma identidad.

-- AlterTable
ALTER TABLE "credentials"."credentials" ADD COLUMN "kylooSub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "credentials_kylooSub_key" ON "credentials"."credentials"("kylooSub");
