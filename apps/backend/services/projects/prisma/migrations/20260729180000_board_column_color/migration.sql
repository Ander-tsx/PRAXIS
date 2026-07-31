-- AlterTable
ALTER TABLE "board_columns" ADD COLUMN     "color" TEXT NOT NULL DEFAULT 'primary';

-- Reparte el color de las columnas que ya existían igual que lo hacía la
-- interfaz: por posición, rotando entre los cinco primeros tokens. Sin esto
-- todas nacerían violetas y un tablero ya montado perdería la distinción visual
-- que tenía antes de guardarse el color en la base.
UPDATE "board_columns"
SET "color" = (ARRAY['primary', 'accent', 'info', 'success', 'warning'])[("order" % 5) + 1]
WHERE "order" >= 0;
