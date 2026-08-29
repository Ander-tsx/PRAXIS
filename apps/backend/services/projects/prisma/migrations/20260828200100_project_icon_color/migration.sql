-- Identidad visual del proyecto: un icono (nombre de lucide-react) y un color
-- (#rrggbb). Anulables: sin ellos el frontend pinta el monograma derivado del
-- id. Las filas existentes se quedan en NULL.
ALTER TABLE "projects"."projects"
  ADD COLUMN "iconKey" TEXT,
  ADD COLUMN "color" TEXT;
