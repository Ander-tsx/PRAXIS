-- Identidad visual de la organización: un icono (nombre de lucide-react) y un
-- color (#rrggbb). Anulables: sin ellos el frontend pinta el monograma de
-- siempre. Nada que rellenar — las filas existentes se quedan en NULL y caen al
-- monograma, que es lo que ya enseñaban.
ALTER TABLE "billing"."organizations"
  ADD COLUMN "iconKey" TEXT,
  ADD COLUMN "color" TEXT;
