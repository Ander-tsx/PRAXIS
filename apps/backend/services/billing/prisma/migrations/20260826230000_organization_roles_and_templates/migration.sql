-- Los papeles de una organización dejan de ser un enum de tres valores y pasan
-- a ser filas que cada organización define, igual que un proyecto define sus
-- roles. Y aparecen las plantillas: los roles con los que nace un proyecto.
--
-- ⚠️ Esta migración va aparte y no editando la inicial. La de O1 sí se editó en
-- su sitio, pero aquello era quitar dos valores de un enum; esto reestructura
-- tablas y merece su propio archivo con su propia explicación.

-- ─── Los papeles ────────────────────────────────────────────────────────────
CREATE TABLE "billing"."organization_roles" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "permissions"    JSONB NOT NULL,
    "isDefault"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organization_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_roles_organizationId_name_key"
    ON "billing"."organization_roles"("organizationId", "name");
CREATE INDEX "organization_roles_organizationId_idx"
    ON "billing"."organization_roles"("organizationId");

ALTER TABLE "billing"."organization_roles"
    ADD CONSTRAINT "organization_roles_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "billing"."organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ⚠️ Exactamente un papel por defecto y por organización. Sin ninguno, una
-- invitación que no diga el papel no se puede escribir; con dos, cuál se aplica
-- depende del orden en que la base los devuelva. Es un índice parcial, que es
-- justo lo que Prisma no sabe expresar — igual que el de la organización
-- personal en la migración inicial.
CREATE UNIQUE INDEX "organization_roles_uno_por_defecto"
    ON "billing"."organization_roles"("organizationId")
    WHERE "isDefault" = true;

-- ─── Las plantillas de rol de proyecto ──────────────────────────────────────
CREATE TABLE "billing"."project_role_templates" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "permissions"    JSONB NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_role_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_role_templates_organizationId_name_key"
    ON "billing"."project_role_templates"("organizationId", "name");
CREATE INDEX "project_role_templates_organizationId_idx"
    ON "billing"."project_role_templates"("organizationId");

ALTER TABLE "billing"."project_role_templates"
    ADD CONSTRAINT "project_role_templates_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "billing"."organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── La membresía pasa de enum a papel ──────────────────────────────────────
ALTER TABLE "billing"."organization_members" ADD COLUMN "roleId" TEXT;

-- El relleno: cada organización que ya existe estrena sus dos papeles de
-- arranque. `gen_random_uuid()` viene de pgcrypto, que Postgres 13+ trae de
-- serie.
--
-- ⚠️ Los nombres van en español porque se ven en pantalla, igual que los roles
-- de proyecto. Y `canManageBilling` NO entra en «Administración»: quien lleva el
-- equipo no toca la tarjeta de la empresa salvo que el dueño se lo dé.
INSERT INTO "billing"."organization_roles"
    ("id", "organizationId", "name", "permissions", "isDefault", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "id",
    'Administración',
    '{"canManageOrganization":true,"canCreateProject":true,"canViewAllProjects":true,"canManageAllProjects":true,"canInviteMembers":true,"canManageMembers":true,"canManageRoleTemplates":true,"canManageBilling":false,"canViewAuditLog":true}'::jsonb,
    false,
    CURRENT_TIMESTAMP
FROM "billing"."organizations";

INSERT INTO "billing"."organization_roles"
    ("id", "organizationId", "name", "permissions", "isDefault", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "id",
    'Miembro',
    '{"canManageOrganization":false,"canCreateProject":true,"canViewAllProjects":false,"canManageAllProjects":false,"canInviteMembers":false,"canManageMembers":false,"canManageRoleTemplates":false,"canManageBilling":false,"canViewAuditLog":false}'::jsonb,
    true,
    CURRENT_TIMESTAMP
FROM "billing"."organizations";

-- Quien era OWNER o ADMIN va a «Administración»; el resto, a «Miembro».
--
-- ⚠️ El OWNER conserva todo su poder igualmente: no sale de este papel, sale de
-- ser `organizations.ownerUserId`, que se resuelve antes de mirar ninguno. Aquí
-- solo se le pone uno para que la columna pueda ser NOT NULL en todas las filas.
UPDATE "billing"."organization_members" m
SET "roleId" = r."id"
FROM "billing"."organization_roles" r
WHERE r."organizationId" = m."organizationId"
  AND r."name" = CASE WHEN m."role" IN ('OWNER', 'ADMIN') THEN 'Administración' ELSE 'Miembro' END;

ALTER TABLE "billing"."organization_members" ALTER COLUMN "roleId" SET NOT NULL;

CREATE INDEX "organization_members_roleId_idx" ON "billing"."organization_members"("roleId");

-- ⚠️ `ON DELETE RESTRICT`: borrar un papel que todavía tiene gente falla, en vez
-- de dejarlos sin ninguno. Reasignar primero es lo honesto, y es la misma regla
-- de «nada se borra solo» que ya rige al bajar de plan.
ALTER TABLE "billing"."organization_members"
    ADD CONSTRAINT "organization_members_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "billing"."organization_roles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing"."organization_members" DROP COLUMN "role";
DROP TYPE "billing"."OrganizationRole";
