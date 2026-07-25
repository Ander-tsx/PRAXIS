/**
 * Seed: Credentials Service
 *
 * Creates the admin credential and user profile.
 * Does NOT touch the permissions schema — role assignment is handled
 * by the permissions seed.
 *
 * Idempotent: uses upsert — safe to run multiple times.
 *
 * Run via root:
 *   pnpm prisma:seed
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma-client';
import { SEED_IDS } from './seed-ids';
import * as bcrypt from 'bcrypt';

// ─── Configuration ──────────────────────────────────────────────────────────

const ADMIN_EMAIL    = process.env.SEED_ADMIN_EMAIL    ?? 'admin@praxis.dev';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345!';
const SALT_ROUNDS    = 10;

const prisma = new PrismaClient();

async function main() {
  console.log('🔑  Seeding credentials…');

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);

  // ── 1. Credential ─────────────────────────────────────────────────────────

  const credential = await prisma.credential.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      id:           SEED_IDS.ADMIN_CREDENTIAL_ID,
      email:        ADMIN_EMAIL,
      passwordHash,
    },
  });
  console.log(`  ✅  Credential "${credential.email}" ready (${credential.id})`);

  // ── 2. User profile ───────────────────────────────────────────────────────

  const user = await prisma.user.upsert({
    where: { credentialId: credential.id },
    update: {},
    create: {
      id:           SEED_IDS.ADMIN_USER_ID,
      credentialId: credential.id,
      firstName:    'Admin',
      lastName:     'Praxis',
    },
  });
  console.log(`  ✅  User "${user.firstName} ${user.lastName}" ready (${user.id})`);

  console.log('🔑  Credentials seed complete.\n');
}

main()
  .catch((err) => {
    console.error('❌  Credentials seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
