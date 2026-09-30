-- Imagen subida de la organización, alternativa al icono. La ruta (con versión)
-- vive en la organización; los bytes, aparte. Nada que rellenar: las filas
-- existentes quedan en NULL y siguen enseñando su icono o monograma.
ALTER TABLE "billing"."organizations" ADD COLUMN "imageUrl" TEXT;

CREATE TABLE "billing"."organization_images" (
    "organizationId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_images_pkey" PRIMARY KEY ("organizationId")
);

ALTER TABLE "billing"."organization_images"
  ADD CONSTRAINT "organization_images_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "billing"."organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
