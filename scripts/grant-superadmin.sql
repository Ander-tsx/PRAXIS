-- ============================================================================
-- Da a una persona el rol «Administrador» con TODOS los permisos en TODOS los
-- proyectos que existan ahora mismo en la base.
--
-- Uso:
--   docker exec -i praxis_postgres psql -U praxis -d praxis \
--     -v correo="'andres.one.dev@gmail.com'" -f - < scripts/grant-superadmin.sql
--
-- O, si prefieres pasarlo desde fuera del contenedor:
--   psql "$DATABASE_URL" -v correo="'alguien@ejemplo.com'" -f scripts/grant-superadmin.sql
--
-- ## Es idempotente
--
-- Se puede ejecutar tantas veces como haga falta: no duplica membresías ni
-- roles. Después de un `prisma:reset` hay que volver a lanzarlo, porque los
-- proyectos son otros.
--
-- ## Qué toca y qué no
--
-- 1. **Normaliza el rol «Administrador» de cada proyecto a los 18 permisos.**
--    El que crea la API al abrir un proyecto trae 16 explícitos: le faltan
--    `canEditProject` y `canViewReports`. En la práctica ya los tenía —la
--    jerarquía los implica desde `canManageMembers`— así que esto no cambia lo
--    que nadie puede hacer, solo deja de depender de la expansión para leerlo.
--    Importa para Análisis, que exige `canViewReports` en sus siete rutas.
--
-- 2. **Crea el rol si el proyecto no tiene ninguno llamado «Administrador».**
--    Con `gen_random_uuid()`, que es UUID v4 — y eso no es un detalle: el DTO
--    de cambio de rol valida `@IsUUID('4')`, así que un id que no lo sea deja
--    el desplegable de la pestaña Equipo devolviendo 400 para siempre.
--
-- 3. **No toca ningún otro rol** ni echa a nadie. Si la persona ya era miembro
--    con otro rol, se le sube a «Administrador».
-- ============================================================================

\set ON_ERROR_STOP on

-- Todos los permisos del enum `ProjectPermission` en `@praxis/contracts`.
-- Si el enum crece, esta lista tiene que crecer con él.
\set permisos_completos '''{"canViewProject":true,"canCreateTask":true,"canMoveTask":true,"canEditTask":true,"canDeleteTask":true,"canCreateBoard":true,"canEditBoard":true,"canDeleteBoard":true,"canCreateColumn":true,"canEditColumn":true,"canDeleteColumn":true,"canComment":true,"canManageLabels":true,"canManageMembers":true,"canManageRoles":true,"canEditProject":true,"canViewReports":true,"canDeleteProject":true}'''

BEGIN;

-- Quién. Se resuelve por correo para no tener que pegar UUID a mano.
CREATE TEMP TABLE destinatario ON COMMIT DROP AS
SELECT u.id AS user_id, c.email
  FROM credentials.credentials c
  JOIN credentials.users u ON u."credentialId" = c.id
 WHERE c.email = :correo;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM destinatario) THEN
    RAISE EXCEPTION 'No hay ninguna cuenta con ese correo. ¿Está registrada?';
  END IF;
END $$;

-- 1. Los proyectos que ya tienen «Administrador»: se le ponen los 18 permisos.
UPDATE projects.project_roles
   SET permissions = :permisos_completos::jsonb
 WHERE name = 'Administrador';

-- 2. Los que no lo tienen: se les crea.
INSERT INTO projects.project_roles (id, name, "projectId", permissions)
SELECT gen_random_uuid(), 'Administrador', p.id, :permisos_completos::jsonb
  FROM projects.projects p
 WHERE NOT EXISTS (
   SELECT 1 FROM projects.project_roles r
    WHERE r."projectId" = p.id AND r.name = 'Administrador'
 );

-- 3. Alta como miembro donde todavía no lo sea.
INSERT INTO projects.project_members (id, "projectId", "userId", "projectRoleId", "joinedAt")
SELECT gen_random_uuid(), p.id, d.user_id, r.id, now()
  FROM projects.projects p
  JOIN projects.project_roles r ON r."projectId" = p.id AND r.name = 'Administrador'
 CROSS JOIN destinatario d
 WHERE NOT EXISTS (
   SELECT 1 FROM projects.project_members m
    WHERE m."projectId" = p.id AND m."userId" = d.user_id
 );

-- 4. Y donde ya lo era con otro rol, se le sube.
UPDATE projects.project_members m
   SET "projectRoleId" = r.id
  FROM projects.project_roles r, destinatario d
 WHERE r."projectId" = m."projectId"
   AND r.name = 'Administrador'
   AND m."userId" = d.user_id
   AND m."projectRoleId" <> r.id;

COMMIT;

-- Resumen de cómo quedó.
SELECT p.name AS proyecto,
       r.name AS rol,
       (SELECT count(*) FROM jsonb_each(r.permissions) e WHERE e.value = 'true'::jsonb) AS permisos
  FROM projects.project_members m
  JOIN projects.projects p      ON p.id = m."projectId"
  JOIN projects.project_roles r ON r.id = m."projectRoleId"
  JOIN credentials.users u      ON u.id = m."userId"
  JOIN credentials.credentials c ON c.id = u."credentialId"
 WHERE c.email = :correo
 ORDER BY p.name;
