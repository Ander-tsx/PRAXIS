-- El registro de lo que hacen los administradores.
--
-- Vive en el schema `permissions` porque describe acciones sobre usuarios y
-- proyectos a la vez, y ninguno de esos dos servicios es dueño de las dos cosas.
-- permissions-service ya es la autoridad de plataforma, así que es el sitio
-- neutral.
--
-- SOLO-AÑADIR: no hay ninguna ruta ni comando que actualice o borre estas filas,
-- tampoco para un SuperAdmin. Un registro que se puede reescribir no es
-- auditoría.
--
-- SIN CLAVES FORÁNEAS, igual que `notifications` en projects: describe un hecho
-- del pasado y tiene que sobrevivir a lo que describe. De ahí las copias
-- `actorLabel` y `targetLabel`, que guardan el nombre del momento en vez de una
-- referencia que habría que resolver cruzando cuatro servicios.

-- CreateEnum
CREATE TYPE "permissions"."AdminActionType" AS ENUM (
  'USER_SUSPENDED',
  'USER_REACTIVATED',
  'USER_DEACTIVATED',
  'ROLE_GRANTED',
  'ROLE_REVOKED',
  'PROJECT_SUSPENDED',
  'PROJECT_REACTIVATED',
  'PROJECT_ARCHIVED',
  'PROJECT_RESTORED'
);

-- CreateEnum
CREATE TYPE "permissions"."AdminTargetType" AS ENUM ('USER', 'PROJECT');

-- CreateTable
CREATE TABLE "permissions"."admin_actions" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorLabel" TEXT,
    "action" "permissions"."AdminActionType" NOT NULL,
    "targetType" "permissions"."AdminTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Los cuatro accesos del panel. Los tres filtros van compuestos con `createdAt`
-- porque el orden es siempre cronológico descendente: sin la segunda columna,
-- filtrar por actor obligaría a ordenar el resultado en memoria.
CREATE INDEX "admin_actions_createdAt_idx" ON "permissions"."admin_actions"("createdAt");
CREATE INDEX "admin_actions_actorId_createdAt_idx" ON "permissions"."admin_actions"("actorId", "createdAt");
CREATE INDEX "admin_actions_targetId_createdAt_idx" ON "permissions"."admin_actions"("targetId", "createdAt");
CREATE INDEX "admin_actions_action_createdAt_idx" ON "permissions"."admin_actions"("action", "createdAt");
