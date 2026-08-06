/**
 * Seed: Roles globales y asignaciones
 *
 * Crea los tres roles globales del sistema y los reparte entre los usuarios de
 * prueba:
 *   - SuperAdmin → admin@praxis.dev. Administra también a los administradores
 *   - Admin      → sofia@praxis.dev. Administra la plataforma, no a los admins
 *   - User       → maría y carlos
 *
 * ## Por qué el SuperAdmin sale de aquí y no de la interfaz
 *
 * Porque **ninguna ruta concede ese nivel**: `canGrantGlobalRole` exige estar
 * estrictamente por encima del rol que se reparte, y por encima de `SuperAdmin`
 * no hay nada. Es deliberado —el primero no lo crea nadie desde dentro— y tiene
 * como consecuencia que este seeder es el único origen del rol. Si esta línea
 * desaparece, el sistema arranca sin nadie capaz de nombrar administradores.
 *
 * La lista de roles vive en `@praxis/contracts` (`GLOBAL_ROLE_SEED`), compartida
 * con el `onModuleInit` del servicio: los nombres se comparan con distinción de
 * mayúsculas contra `roles.name`, y tenerlos escritos dos veces es tenerlos
 * escritos mal una vez.
 *
 * Los seeders son autónomos y solo operan en su propio schema.
 * Es idempotente: re-ejecutar no duplica ni destruye datos.
 *
 * Orden recomendado: 1) credentials → 2) permissions → 3) projects → 4) tasks
 *
 * Run with:
 *   npm run prisma:seed
 */

import 'dotenv/config';
import { GLOBAL_ROLES, GLOBAL_ROLE_SEED, type GlobalRole } from '@praxis/contracts';
import { PrismaClient } from '../src/generated/prisma-client';

// ─── UUIDs fijos compartidos entre seeders ────────────────────────────────────

// Usuarios (definidos en credentials/seed.ts)
const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
const MARIA_USER_ID = '22222222-2222-4222-8222-222222222221';
const CARLOS_USER_ID = '33333333-3333-4333-8333-333333333331';
const SOFIA_USER_ID = '44444444-4444-4444-8444-444444444441';

// ─── Datos de prueba ──────────────────────────────────────────────────────────

/**
 * ⚠️ Los ids de los roles ya no se fijan aquí.
 *
 * Estaban a fuego (`aaaa1111-…`) y el propio código admitía en un comentario que
 * podían no coincidir con los de la base, así que había que quedarse con el id
 * devuelto por el upsert de todas formas. Nadie los referencia desde otro
 * seeder —lo verifiqué— y con `name` siendo `@unique` el upsert ya es
 * idempotente por sí solo.
 */
const SEED_USER_ROLES: ReadonlyArray<{ userId: string; roleName: GlobalRole }> = [
  { userId: ADMIN_USER_ID, roleName: GLOBAL_ROLES.SUPER_ADMIN },
  { userId: SOFIA_USER_ID, roleName: GLOBAL_ROLES.ADMIN },
  { userId: MARIA_USER_ID, roleName: GLOBAL_ROLES.USER },
  { userId: CARLOS_USER_ID, roleName: GLOBAL_ROLES.USER },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log('🌱  Iniciando seed de permissions…\n');

  try {
    // 1. Upsert roles — guardamos el ID REAL devuelto por la BD
    console.log('  📋  Creando roles globales…');
    const roleIdByName = new Map<string, string>();

    for (const role of GLOBAL_ROLE_SEED) {
      const saved = await prisma.role.upsert({
        where: { name: role.name },
        update: { description: role.description },
        create: { name: role.name, description: role.description },
      });
      roleIdByName.set(saved.name, saved.id);
      console.log(`  ✅  Rol "${saved.name}"  →  roleId: ${saved.id}`);
    }

    // 2. Asignaciones — usamos los IDs reales, no las constantes
    console.log('\n  👤  Asignando roles a usuarios…');
    for (const assignment of SEED_USER_ROLES) {
      const roleId = roleIdByName.get(assignment.roleName)!;

      // @@unique([userId, roleId]) — findFirst + create para idempotencia
      const existing = await prisma.userRole.findFirst({
        where: { userId: assignment.userId, roleId },
      });

      if (!existing) {
        await prisma.userRole.create({
          data: { userId: assignment.userId, roleId },
        });
        console.log(
          `  ✅  userId: ${assignment.userId}  →  rol: "${assignment.roleName}" (${roleId})`,
        );
      } else {
        console.log(
          `  ℹ️   userId: ${assignment.userId} ya tiene rol "${assignment.roleName}". Omitido.`,
        );
      }
    }

    /**
     * 3. La fila `Admin` que admin@praxis.dev tenía de antes.
     *
     * Este seeder le daba `Admin` y ahora le da `SuperAdmin`. En una base ya
     * sembrada las dos filas convivirían, y aunque el nivel efectivo sería el
     * mismo —se toma el más alto— dejaría al SuperAdmin apareciendo como
     * administrador corriente en cualquier listado que enseñe los roles tal
     * cual. Se limpia aquí para que sembrar sobre una base vieja dé el mismo
     * resultado que sembrar sobre una nueva.
     */
    const adminRoleId = roleIdByName.get(GLOBAL_ROLES.ADMIN)!;
    const { count } = await prisma.userRole.deleteMany({
      where: { userId: ADMIN_USER_ID, roleId: adminRoleId },
    });
    if (count > 0) {
      console.log(
        `\n  🧹  Retirada la fila "Admin" heredada de ${ADMIN_USER_ID} (ahora es SuperAdmin).`,
      );
    }

    console.log('\n✅  Seed de permissions completado.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌  Seed falló:', err);
  process.exit(1);
});
