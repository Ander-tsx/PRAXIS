-- Identidades de Google en las credenciales.
--
-- Dos cambios, ambos compatibles con los datos que ya existen:
--
-- 1. `passwordHash` deja de ser obligatorio. Una cuenta que entra solo con
--    Google no tiene contraseña; guardar una cadena vacía o un hash inventado
--    convertiría «no tiene contraseña» en «tiene una que nadie conoce», y esas
--    dos cosas hay que poder distinguirlas al decidir si se permite vincular.
--
--    Relajar un NOT NULL no toca ninguna fila existente: las que ya tienen hash
--    lo conservan.
--
-- 2. `googleSub` guarda el identificador estable de la cuenta de Google.
--    Se indexa como único para que dos credenciales no puedan reclamar la misma
--    identidad. Nace NULL en todas las filas actuales, que es lo correcto:
--    ninguna se ha creado con Google.

-- AlterTable
ALTER TABLE "credentials"."credentials" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "credentials"."credentials" ADD COLUMN "googleSub" TEXT;

-- CreateIndex
-- Un índice único sobre una columna que admite NULL permite tantos NULL como
-- haga falta en PostgreSQL: las cuentas con contraseña no se estorban entre sí.
CREATE UNIQUE INDEX "credentials_googleSub_key" ON "credentials"."credentials"("googleSub");
