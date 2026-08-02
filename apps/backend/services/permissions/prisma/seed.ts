/**
 * Seed: Roles globales y asignaciones
 *
 * Crea los roles globales del sistema y los asigna a los usuarios de prueba:
 *   - Admin: administrador global con acceso total
 *   - User:  usuario estándar con acceso básico
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
import { PrismaClient } from '../src/generated/prisma-client';

// ─── UUIDs fijos compartidos entre seeders ────────────────────────────────────

// Usuarios (definidos en credentials/seed.ts)
const ADMIN_USER_ID  = '11111111-1111-1111-1111-111111111111';
const MARIA_USER_ID  = '22222222-2222-2222-2222-222222222221';
const CARLOS_USER_ID = '33333333-3333-3333-3333-333333333331';

// ─── Datos de prueba ──────────────────────────────────────────────────────────

const SEED_ROLES = [
  {
    id:          'aaaa1111-1111-1111-1111-111111111111',
    name:        'Admin',
    description: 'Administrador global con acceso total al sistema',
  },
  {
    id:          'aaaa2222-2222-2222-2222-222222222222',
    name:        'User',
    description: 'Usuario estándar con acceso a funcionalidades básicas',
  },
] as const;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log('🌱  Iniciando seed de permissions…\n');

  try {
    // 1. Upsert roles — guardamos el ID REAL devuelto por la BD
    //    (puede diferir del hardcodeado si el rol ya existía con otro UUID)
    console.log('  📋  Creando roles globales…');
    const roleIdByName = new Map<string, string>();

    for (const role of SEED_ROLES) {
      const saved = await prisma.role.upsert({
        where:  { name: role.name },
        update: { description: role.description },
        create: {
          id:          role.id,
          name:        role.name,
          description: role.description,
        },
      });
      roleIdByName.set(saved.name, saved.id);
      console.log(`  ✅  Rol "${saved.name}"  →  roleId: ${saved.id}`);
    }

    // 2. Asignaciones — usamos los IDs reales, no las constantes
    const SEED_USER_ROLES = [
      { userId: ADMIN_USER_ID,  roleName: 'Admin' },
      { userId: MARIA_USER_ID,  roleName: 'User'  },
      { userId: CARLOS_USER_ID, roleName: 'User'  },
    ];

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
        console.log(`  ✅  userId: ${assignment.userId}  →  rol: "${assignment.roleName}" (${roleId})`);
      } else {
        console.log(`  ℹ️   userId: ${assignment.userId} ya tiene rol "${assignment.roleName}". Omitido.`);
      }
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
