/**
 * Seed: Global Admin User
 *
 * Ensures that at least one user with the global "admin" role exists.
 * If none is found, it creates:
 *   - A Credential + User record in the `credentials` schema
 *   - The `admin` Role (if it doesn't exist) in the `permissions` schema
 *   - A UserRole linking the new user to the admin role
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register prisma/seed.ts
 * Or via the package.json script:
 *   npm run prisma:seed
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma-client';
import { Client as PgClient } from 'pg';
import * as bcrypt from 'bcrypt';

// ─── Configuration ───────────────────────────────────────────────────────────

const ADMIN_EMAIL    = process.env.SEED_ADMIN_EMAIL    ?? 'admin@praxis.dev';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345!';
const ADMIN_ROLE     = 'Admin';
const SALT_ROUNDS    = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strips the `?schema=...` query param from the DATABASE_URL so that
 * the raw pg client can connect at the database level and access all schemas.
 */
function baseConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('schema');
    return parsed.toString();
  } catch {
    return url;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }

  // --- 1. Check permissions schema for an existing admin user ---------------

  const pg = new PgClient({ connectionString: baseConnectionString(databaseUrl) });
  await pg.connect();

  console.log('🔍  Checking for existing admin user in permissions schema…');

  const { rows: existingAdmins } = await pg.query<{ user_id: string }>(`
    SELECT ur."userId"
    FROM   permissions.user_roles ur
    JOIN   permissions.roles       r  ON r.id = ur."roleId"
    WHERE  r.name = $1
    LIMIT  1
  `, [ADMIN_ROLE]);

  if (existingAdmins.length > 0) {
    console.log(`✅  Admin user already exists (userId: ${existingAdmins[0]['userId']}). Skipping seed.`);
    await pg.end();
    return;
  }

  console.log('⚙️   No admin user found. Creating one…');

  // --- 2. Create Credential + User in credentials schema --------------------

  const prisma = new PrismaClient();
  await prisma.$connect();

  let userId: string;

  try {
    const existing = await prisma.credential.findUnique({
      where: { email: ADMIN_EMAIL },
      include: { user: true },
    });

    if (existing?.user) {
      // Credential exists but has no admin role yet — reuse the userId
      userId = existing.user.id;
      console.log(`ℹ️   Credential for ${ADMIN_EMAIL} already exists (userId: ${userId}).`);
    } else {
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);

      const credential = await prisma.credential.create({
        data: {
          email: ADMIN_EMAIL,
          passwordHash,
          user: {
            create: {
              firstName: 'Admin',
              lastName:  'Praxis',
            },
          },
        },
        include: { user: true },
      });

      if (!credential.user) {
        throw new Error('Failed to create user profile for admin credential.');
      }

      userId = credential.user.id;
      console.log(`✅  Admin credential + user created (userId: ${userId}).`);
    }
  } finally {
    await prisma.$disconnect();
  }

  // --- 3. Ensure the admin role exists in permissions schema ----------------

  const { rows: roles } = await pg.query<{ id: string }>(`
    SELECT id FROM permissions.roles WHERE name = $1 LIMIT 1
  `, [ADMIN_ROLE]);

  let roleId: string;

  if (roles.length > 0) {
    roleId = roles[0].id;
    console.log(`ℹ️   Role "${ADMIN_ROLE}" already exists (roleId: ${roleId}).`);
  } else {
    const { rows: newRole } = await pg.query<{ id: string }>(`
      INSERT INTO permissions.roles (id, name, description, "createdAt")
      VALUES (gen_random_uuid(), $1, $2, NOW())
      RETURNING id
    `, [ADMIN_ROLE, 'Global administrator with full system access']);

    roleId = newRole[0].id;
    console.log(`✅  Role "${ADMIN_ROLE}" created (roleId: ${roleId}).`);
  }

  // --- 4. Assign admin role to the user -------------------------------------

  await pg.query(`
    INSERT INTO permissions.user_roles (id, "userId", "roleId", "createdAt")
    VALUES (gen_random_uuid(), $1, $2, NOW())
    ON CONFLICT ("userId", "roleId") DO NOTHING
  `, [userId, roleId]);

  console.log(`✅  Admin role assigned to user ${userId}. Seed complete.`);

  await pg.end();
}

main().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
