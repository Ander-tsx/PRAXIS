import {
  ORG_ROLE_ADMIN_NAME,
  ORG_ROLE_MEMBER_NAME,
  ProjectPermission,
  permisosDeAdministracion,
  permisosDeMiembro,
} from '@praxis/contracts';
import { PrismaClient } from '../src/generated/prisma-client';

/**
 * La semilla de facturación: las organizaciones de las cuentas sembradas.
 *
 * ## Por qué existe, y por qué va antes que la de proyectos
 *
 * 🔴 **Desde 2026-08-26 un proyecto pertenece a una organización**, y la columna
 * es obligatoria. Si esta semilla no corre antes, la de `projects` no tiene a
 * qué apuntar y falla — no con un mensaje claro, sino con una restricción de
 * columna en medio de un `create`. El orden está en `prisma:seed` del
 * `package.json` raíz y **no es alfabético**: permissions → credentials →
 * **billing** → projects → tasks.
 *
 * ## Los identificadores son fijos y compartidos
 *
 * Los mismos `ADMIN_USER_ID`, `MARIA_USER_ID` y `CARLOS_USER_ID` que usan las
 * otras cuatro semillas. No hay clave foránea entre servicios —cada uno tiene su
 * esquema— así que lo único que los ata es que estén escritos igual. Si se
 * cambia uno, se cambian los cinco.
 *
 * ## Idempotente
 *
 * Se puede correr dos veces sin duplicar nada: todo va por `upsert` o por una
 * comprobación previa. `prisma:seed` se ejecuta tras cada `prisma:reset`, pero
 * también a mano cuando alguien quiere volver a tener datos de demostración
 * encima de lo que ya hay.
 */
const prisma = new PrismaClient();

const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
const MARIA_USER_ID = '22222222-2222-4222-8222-222222222221';
const CARLOS_USER_ID = '33333333-3333-4333-8333-333333333331';

/**
 * La organización personal de cada uno, con identificador fijo.
 *
 * ⚠️ **Fijo y no aleatorio**, porque la semilla de `projects` necesita
 * escribirlo en `Project.organizationId` y no puede preguntárselo a este
 * servicio: son dos esquemas y dos procesos distintos. Es el mismo trato que ya
 * tienen los identificadores de usuario.
 */
const ORG_PERSONAL_ADMIN = '99999999-0000-4000-8000-000000000001';
const ORG_PERSONAL_MARIA = '99999999-0000-4000-8000-000000000002';
const ORG_PERSONAL_CARLOS = '99999999-0000-4000-8000-000000000003';

/** La de empresa, que es donde vive el proyecto de demostración. */
const ORG_DEMO = '99999999-0000-4000-8000-000000000010';

/** Los roles con los que nace un proyecto de una organización. */
function plantillas() {
  const todos = Object.values(ProjectPermission);
  const mapa = (concedidos: ProjectPermission[]) => {
    const dado = new Set<string>(concedidos);
    return Object.fromEntries(todos.map((clave) => [clave, dado.has(clave)]));
  };

  return [
    { name: 'Administrador', permissions: mapa(todos) },
    {
      name: 'Colaborador',
      permissions: mapa([
        ProjectPermission.CAN_VIEW_PROJECT,
        ProjectPermission.CAN_CREATE_TASK,
        ProjectPermission.CAN_MOVE_TASK,
        ProjectPermission.CAN_EDIT_TASK,
        ProjectPermission.CAN_COMMENT,
        ProjectPermission.CAN_MANAGE_LABELS,
        ProjectPermission.CAN_VIEW_REPORTS,
      ]),
    },
    {
      name: 'Lectura',
      permissions: mapa([
        ProjectPermission.CAN_VIEW_PROJECT,
        ProjectPermission.CAN_COMMENT,
        ProjectPermission.CAN_VIEW_REPORTS,
      ]),
    },
  ];
}

/**
 * Crea una organización con sus dos papeles, sus tres plantillas y su gente.
 *
 * ⚠️ Los papeles se crean **antes** que las membresías porque `roleId` es
 * obligatorio: es la misma razón por la que el servicio lo hace en una
 * transacción y no en un `create` anidado.
 */
async function organizacion(datos: {
  id: string;
  kind: 'PERSONAL' | 'ENTERPRISE';
  name: string;
  slug: string;
  ownerUserId: string;
  seats: number;
  miembros: { userId: string; email: string; papel: string }[];
}) {
  await prisma.organization.upsert({
    where: { id: datos.id },
    update: { name: datos.name },
    create: {
      id: datos.id,
      kind: datos.kind,
      name: datos.name,
      slug: datos.slug,
      ownerUserId: datos.ownerUserId,
      subscription: { create: { tier: 'FREE', status: 'ACTIVE', seats: datos.seats } },
    },
  });

  for (const papel of [
    { name: ORG_ROLE_ADMIN_NAME, permissions: permisosDeAdministracion(), isDefault: false },
    { name: ORG_ROLE_MEMBER_NAME, permissions: permisosDeMiembro(), isDefault: true },
  ]) {
    await prisma.organizationRole.upsert({
      where: { organizationId_name: { organizationId: datos.id, name: papel.name } },
      update: { permissions: papel.permissions as never },
      create: {
        organizationId: datos.id,
        name: papel.name,
        permissions: papel.permissions as never,
        isDefault: papel.isDefault,
      },
    });
  }

  for (const plantilla of plantillas()) {
    await prisma.projectRoleTemplate.upsert({
      where: { organizationId_name: { organizationId: datos.id, name: plantilla.name } },
      update: { permissions: plantilla.permissions as never },
      create: {
        organizationId: datos.id,
        name: plantilla.name,
        permissions: plantilla.permissions as never,
      },
    });
  }

  const papeles = await prisma.organizationRole.findMany({
    where: { organizationId: datos.id },
  });

  for (const miembro of datos.miembros) {
    const papel = papeles.find((rol) => rol.name === miembro.papel);
    if (!papel) continue;

    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: datos.id, userId: miembro.userId } },
      update: { roleId: papel.id },
      create: {
        organizationId: datos.id,
        userId: miembro.userId,
        email: miembro.email,
        roleId: papel.id,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
  }
}

async function main() {
  console.log('🌱 Sembrando facturación…');

  await organizacion({
    id: ORG_PERSONAL_ADMIN,
    kind: 'PERSONAL',
    name: 'Espacio de Admin',
    slug: 'espacio-de-admin',
    ownerUserId: ADMIN_USER_ID,
    seats: 1,
    miembros: [{ userId: ADMIN_USER_ID, email: 'admin@praxis.dev', papel: ORG_ROLE_ADMIN_NAME }],
  });

  await organizacion({
    id: ORG_PERSONAL_MARIA,
    kind: 'PERSONAL',
    name: 'Espacio de María',
    slug: 'espacio-de-maria',
    ownerUserId: MARIA_USER_ID,
    seats: 1,
    miembros: [{ userId: MARIA_USER_ID, email: 'maria@praxis.dev', papel: ORG_ROLE_ADMIN_NAME }],
  });

  await organizacion({
    id: ORG_PERSONAL_CARLOS,
    kind: 'PERSONAL',
    name: 'Espacio de Carlos',
    slug: 'espacio-de-carlos',
    ownerUserId: CARLOS_USER_ID,
    seats: 1,
    miembros: [{ userId: CARLOS_USER_ID, email: 'carlos@praxis.dev', papel: ORG_ROLE_ADMIN_NAME }],
  });

  /* La de empresa: tres asientos, que es justo lo que da el plan gratuito. Es
     donde vive el proyecto de demostración, para que al entrar se vea el caso
     que importa —un equipo compartiendo un tablero— y no tres espacios sueltos. */
  await organizacion({
    id: ORG_DEMO,
    kind: 'ENTERPRISE',
    name: 'Estudio Nordeste',
    slug: 'estudio-nordeste',
    ownerUserId: ADMIN_USER_ID,
    seats: 3,
    miembros: [
      { userId: ADMIN_USER_ID, email: 'admin@praxis.dev', papel: ORG_ROLE_ADMIN_NAME },
      { userId: MARIA_USER_ID, email: 'maria@praxis.dev', papel: ORG_ROLE_MEMBER_NAME },
      { userId: CARLOS_USER_ID, email: 'carlos@praxis.dev', papel: ORG_ROLE_MEMBER_NAME },
    ],
  });

  console.log('✅ Facturación sembrada: 3 espacios personales y 1 organización de equipo.');
}

main()
  .catch((error) => {
    console.error('❌ La semilla de facturación falló:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
