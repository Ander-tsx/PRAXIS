/**
 * Seed: Permissions Service
 *
 * Creates the global roles (Admin, User) and assigns the Admin role
 * to the seed admin user.
 *
 * Idempotent: uses upsert — safe to run multiple times.
 *
 * Run via root:
 *   pnpm prisma:seed
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma-client';
import { SEED_IDS } from './seed-ids';

const prisma = new PrismaClient();

async function main() {
  console.log('🔐  Seeding permissions…');

  // ── 1. Global Roles ──────────────────────────────────────────────────────

  const adminRole = await prisma.role.upsert({
    where:  { name: 'Admin' },
    update: {},
    create: {
      id:          SEED_IDS.ADMIN_ROLE_ID,
      name:        'Admin',
      description: 'Acceso de administración sobre toda la plataforma',
    },
  });
  console.log(`  ✅  Role "${adminRole.name}" ready (${adminRole.id})`);

  const userRole = await prisma.role.upsert({
    where:  { name: 'User' },
    update: {},
    create: {
      id:          SEED_IDS.USER_ROLE_ID,
      name:        'User',
      description: 'Miembro normal del sistema',
    },
  });
  console.log(`  ✅  Role "${userRole.name}" ready (${userRole.id})`);

  // ── 2. Assign Admin role to admin user ────────────────────────────────────

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: SEED_IDS.ADMIN_USER_ID,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      id:     SEED_IDS.ADMIN_USER_ROLE_ID,
      userId: SEED_IDS.ADMIN_USER_ID,
      roleId: adminRole.id,
    },
  });
  console.log(`  ✅  Admin role assigned to user ${SEED_IDS.ADMIN_USER_ID}`);

  console.log('🔐  Permissions seed complete.\n');
}

main()
  .catch((err) => {
    console.error('❌  Permissions seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
