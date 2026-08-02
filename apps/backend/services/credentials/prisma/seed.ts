/**
 * Seed: Usuarios de prueba
 *
 * Crea tres usuarios con credenciales fijas para desarrollo y testing:
 *   - admin@praxis.dev  → Administrador global
 *   - maria@praxis.dev  → Usuario normal
 *   - carlos@praxis.dev → Usuario normal
 *
 * Los UUIDs son fijos y compartidos con los seeders de permissions, projects
 * y tasks para que las referencias entre servicios sean consistentes sin
 * necesidad de cruzar schemas.
 *
 * Es idempotente: re-ejecutar no duplica ni destruye datos.
 *
 * Run with:
 *   npm run prisma:seed
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma-client';
import * as bcrypt from 'bcrypt';

// ─── UUIDs fijos compartidos entre seeders ────────────────────────────────────

export const ADMIN_CREDENTIAL_ID = '11111111-1111-1111-1111-111111111112';
export const ADMIN_USER_ID       = '11111111-1111-1111-1111-111111111111';

export const MARIA_CREDENTIAL_ID = '22222222-2222-2222-2222-222222222222';
export const MARIA_USER_ID       = '22222222-2222-2222-2222-222222222221';

export const CARLOS_CREDENTIAL_ID = '33333333-3333-3333-3333-333333333332';
export const CARLOS_USER_ID       = '33333333-3333-3333-3333-333333333331';

// ─── Datos de prueba ──────────────────────────────────────────────────────────

const SALT_ROUNDS = 10;

const SEED_USERS = [
  {
    credentialId: ADMIN_CREDENTIAL_ID,
    email:        'admin@praxis.dev',
    password:     'Admin@12345!',
    userId:       ADMIN_USER_ID,
    firstName:    'Admin',
    lastName:     'Praxis',
  },
  {
    credentialId: MARIA_CREDENTIAL_ID,
    email:        'maria@praxis.dev',
    password:     'User@12345!',
    userId:       MARIA_USER_ID,
    firstName:    'María',
    lastName:     'García',
  },
  {
    credentialId: CARLOS_CREDENTIAL_ID,
    email:        'carlos@praxis.dev',
    password:     'User@12345!',
    userId:       CARLOS_USER_ID,
    firstName:    'Carlos',
    lastName:     'López',
  },
] as const;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log('🌱  Iniciando seed de credentials…\n');

  try {
    for (const userData of SEED_USERS) {
      const passwordHash = await bcrypt.hash(userData.password, SALT_ROUNDS);

      // Upsert credential
      const credential = await prisma.credential.upsert({
        where:  { email: userData.email },
        update: { passwordHash },
        create: {
          id:           userData.credentialId,
          email:        userData.email,
          passwordHash,
        },
      });

      // Upsert user vinculado a la credential
      const user = await prisma.user.upsert({
        where:  { credentialId: credential.id },
        update: { firstName: userData.firstName, lastName: userData.lastName },
        create: {
          id:           userData.userId,
          credentialId: credential.id,
          firstName:    userData.firstName,
          lastName:     userData.lastName,
          status:       'ACTIVE',
        },
      });

      console.log(`  ✅  ${userData.email}  →  userId: ${user.id}`);
    }

    console.log('\n✅  Seed de credentials completado.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌  Seed falló:', err);
  process.exit(1);
});
