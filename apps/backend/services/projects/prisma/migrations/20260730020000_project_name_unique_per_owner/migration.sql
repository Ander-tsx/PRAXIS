-- El nombre de un proyecto pasa a ser único **por dueño**, no globalmente.
--
-- Con la restricción global, dos equipos que no se conocen no podían tener cada
-- uno su "Sprint 1": el segundo recibía un conflicto sobre una fila que no puede
-- ver, así que el mensaje era imposible de entender.

-- DropIndex
DROP INDEX IF EXISTS "projects_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "projects_ownerId_name_key" ON "projects"("ownerId", "name");
