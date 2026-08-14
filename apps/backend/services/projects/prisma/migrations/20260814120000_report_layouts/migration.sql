-- El lienzo configurable de Análisis, uno por persona y proyecto.
--
-- Sin datos que migrar: hasta ahora la pantalla pintaba cinco informes fijos y
-- no había nada que guardar. Quien entre por primera vez tras esto se encuentra
-- el lienzo vacío, que es el punto de partida elegido y no un fallo.
CREATE TABLE "projects"."report_layouts" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "widgets" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_layouts_pkey" PRIMARY KEY ("userId","projectId")
);

-- Cascada de verdad, al revés que en `notifications`: un lienzo no significa
-- nada sin su proyecto, así que se va con él y nadie tiene que acordarse de
-- limpiarlo desde el código que borra.
ALTER TABLE "projects"."report_layouts"
    ADD CONSTRAINT "report_layouts_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"."projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
