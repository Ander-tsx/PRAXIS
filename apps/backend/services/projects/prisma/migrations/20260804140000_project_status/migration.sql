-- El proyecto gana un estado administrativo: ACTIVE, SUSPENDED o DELETED.
--
-- SUSPENDED = solo lectura. El dueño y los miembros lo siguen viendo entero y
-- ninguna acción funciona. Se aplica en `ProjectPermissionGuard` del gateway, que
-- ya resuelve el proyecto de cada petición: una comprobación ahí cubre tareas,
-- columnas, comentarios, adjuntos, miembros, roles y etiquetas de golpe.
--
-- DELETED no es el `DELETE /projects/:id` que ya existe. Aquel cascadea, purga
-- tareas en otro microservicio y es irreversible; se queda con el dueño, y el
-- panel de administración no lo ofrece. Esto es un estado y se deshace.
--
-- `suspendedReason` vive en esta tabla y no solo en el registro de actividad
-- porque ese registro es admin-only: si el motivo estuviera solo allí, el dueño
-- vería un proyecto donde nada funciona sin una palabra que lo explique.

-- CreateEnum
CREATE TYPE "projects"."ProjectStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- AlterTable
ALTER TABLE "projects"."projects"
  ADD COLUMN "status"          "projects"."ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedAt"     TIMESTAMP(3),
  ADD COLUMN "suspendedBy"     TEXT,
  ADD COLUMN "suspendedReason" TEXT;

-- CreateIndex
-- El inventario del panel filtra por estado, y los listados normales excluyen los
-- archivados.
CREATE INDEX "projects_status_idx" ON "projects"."projects"("status");
