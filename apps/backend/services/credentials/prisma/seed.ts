/**
 * Seed: Usuarios de prueba
 *
 * Crea cuatro usuarios con credenciales fijas para desarrollo y testing:
 *   - admin@praxis.dev  → SuperAdmin de la plataforma
 *   - sofia@praxis.dev  → Admin corriente
 *   - maria@praxis.dev  → Usuario normal
 *   - carlos@praxis.dev → Usuario normal
 *
 * Los roles se los asigna el seeder de **permissions**; aquí solo existen las
 * cuentas. Sofía existe para que la diferencia entre los dos niveles de
 * administración se pueda probar en el navegador: con un solo administrador no
 * hay forma de comprobar que un `Admin` no puede tocar a otro `Admin`, ni que
 * solo el `SuperAdmin` reparte el rol de administrador.
 *
 * Los UUIDs son fijos y compartidos con los seeders de permissions, projects
 * y tasks para que las referencias entre servicios sean consistentes sin
 * necesidad de cruzar schemas.
 *
 * ## ⚠️ El `4` y el `8` de cada id no son decorativos
 *
 * `11111111-1111-4111-8111-111111111111` es un **UUID v4 válido**: el `4` es el
 * nibble de versión y el `8` el de variante. Eran `1111-1111` en todas las
 * posiciones, y así **no son UUIDs** para `class-validator`, ni siquiera con
 * `@IsUUID()` sin versión.
 *
 * El efecto era el peor posible: `ParseUUIDPipe` los acepta —trae su propia
 * regex, más laxa— así que las rutas con el id en el **camino** funcionaban,
 * mientras que cualquier ruta que lo recibiera en el **cuerpo** respondía
 * `400 "must be a UUID"`. Y como Prisma genera v4 de verdad, el fallo solo
 * aparecía con las cuentas del seed: las de demostración, las que se usan para
 * probar. Se descubrió al montar `POST /permissions/assign`, la primera ruta que
 * recibe un id de usuario en el cuerpo.
 *
 * Si añades cuentas, respeta la forma: tercer grupo empezando por `4`, cuarto
 * empezando por `8`.
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

export const ADMIN_CREDENTIAL_ID = '11111111-1111-4111-8111-111111111112';
export const ADMIN_USER_ID       = '11111111-1111-4111-8111-111111111111';

export const MARIA_CREDENTIAL_ID = '22222222-2222-4222-8222-222222222222';
export const MARIA_USER_ID       = '22222222-2222-4222-8222-222222222221';

export const CARLOS_CREDENTIAL_ID = '33333333-3333-4333-8333-333333333332';
export const CARLOS_USER_ID       = '33333333-3333-4333-8333-333333333331';

export const SOFIA_CREDENTIAL_ID = '44444444-4444-4444-8444-444444444442';
export const SOFIA_USER_ID       = '44444444-4444-4444-8444-444444444441';

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
    /* Administradora corriente: administra usuarios normales y **no** puede
       tocar a admin@praxis.dev. Es la cuenta con la que se comprueba que la
       jerarquía no es decorativa. */
    credentialId: SOFIA_CREDENTIAL_ID,
    email:        'sofia@praxis.dev',
    password:     'Admin@12345!',
    userId:       SOFIA_USER_ID,
    firstName:    'Sofía',
    lastName:     'Ramírez',
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
