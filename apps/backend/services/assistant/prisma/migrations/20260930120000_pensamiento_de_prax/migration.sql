-- El pensamiento de PRAX: los pasos que dio en cada respuesta (qué leyó, qué
-- consultó, qué preparó), para poder desplegarlos al releer el hilo.
-- Aditiva y nula: las respuestas de antes simplemente no lo tienen.
ALTER TABLE "assistant"."assistant_messages" ADD COLUMN "pensamiento" JSONB;
