-- Cuántas páginas tiene un PDF adjunto.
--
-- Decide si viaja nativo al modelo o solo como texto. Sin este dato no había
-- forma de saberlo, y un PDF de 500 páginas —que pesa menos de los 5 MB que sí
-- se topaban— entraba entero: del orden de 130 000 tokens en un solo turno,
-- contando como un mensaje de la cuota de quien lo subió.
--
-- Nullable: no es un PDF, o es anterior a esta columna. En los dos casos se
-- trata como corto, que es como se venía comportando.
ALTER TABLE "assistant"."assistant_attachments"
  ADD COLUMN IF NOT EXISTS "pages" INTEGER;
