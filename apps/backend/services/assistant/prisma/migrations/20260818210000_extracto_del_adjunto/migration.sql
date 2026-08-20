-- El texto de un adjunto, para que sobreviva a su turno.
--
-- Los bytes viajan con la pregunta y no se reenvían nunca más —reenviarlos en
-- cada turno multiplicaría el coste por la longitud del hilo— así que dos
-- preguntas después PRAX hablaba de un documento que ya no tenía delante. Aquí
-- queda su texto, calculado una sola vez al subir, y el historial lo vuelve a
-- poner con un presupuesto (`ASSISTANT_EXTRACT_BUDGET_CHARS`).
--
-- Nullable y sin relleno: `null` significa «no hay contenido que reinyectar» —un
-- PDF escaneado, una imagen, o cualquier adjunto anterior a esta columna—. Esos
-- se nombran en el hilo y no se finge haberlos leído.
ALTER TABLE "assistant"."assistant_attachments"
  ADD COLUMN IF NOT EXISTS "extract" TEXT;
