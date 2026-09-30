-- Imagen subida del proyecto, alternativa al icono. La ruta (con versión) vive en
-- el proyecto; los bytes, aparte. Las filas existentes quedan en NULL y siguen
-- enseñando su icono o monograma.
ALTER TABLE "projects"."projects" ADD COLUMN "imageUrl" TEXT;

CREATE TABLE "projects"."project_images" (
    "projectId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_images_pkey" PRIMARY KEY ("projectId")
);

ALTER TABLE "projects"."project_images"
  ADD CONSTRAINT "project_images_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"."projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
