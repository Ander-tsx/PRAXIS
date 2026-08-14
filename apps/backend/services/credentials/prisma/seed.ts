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
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma-client';

// ─── UUIDs fijos compartidos entre seeders ────────────────────────────────────

export const ADMIN_CREDENTIAL_ID = '11111111-1111-4111-8111-111111111112';
export const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';

export const MARIA_CREDENTIAL_ID = '22222222-2222-4222-8222-222222222222';
export const MARIA_USER_ID = '22222222-2222-4222-8222-222222222221';

export const CARLOS_CREDENTIAL_ID = '33333333-3333-4333-8333-333333333332';
export const CARLOS_USER_ID = '33333333-3333-4333-8333-333333333331';

export const SOFIA_CREDENTIAL_ID = '44444444-4444-4444-8444-444444444442';
export const SOFIA_USER_ID = '44444444-4444-4444-8444-444444444441';

// ─── Datos de prueba ──────────────────────────────────────────────────────────

const SALT_ROUNDS = 10;

const SEED_USERS = [
  {
    credentialId: ADMIN_CREDENTIAL_ID,
    email: 'admin@praxis.dev',
    password: 'Admin@12345!',
    userId: ADMIN_USER_ID,
    firstName: 'Admin',
    lastName: 'Praxis',
  },
  {
    /* Administradora corriente: administra usuarios normales y **no** puede
       tocar a admin@praxis.dev. Es la cuenta con la que se comprueba que la
       jerarquía no es decorativa. */
    credentialId: SOFIA_CREDENTIAL_ID,
    email: 'sofia@praxis.dev',
    password: 'Admin@12345!',
    userId: SOFIA_USER_ID,
    firstName: 'Sofía',
    lastName: 'Ramírez',
  },
  {
    credentialId: MARIA_CREDENTIAL_ID,
    email: 'maria@praxis.dev',
    password: 'User@12345!',
    userId: MARIA_USER_ID,
    firstName: 'María',
    lastName: 'García',
  },
  {
    credentialId: CARLOS_CREDENTIAL_ID,
    email: 'carlos@praxis.dev',
    password: 'User@12345!',
    userId: CARLOS_USER_ID,
    firstName: 'Carlos',
    lastName: 'López',
  },
] as const;

/**
 * Las cuentas que hay que sembrar en esta ejecución.
 *
 * Por defecto, las cuatro de desarrollo. Con `SEED_SOLO_SUPERADMIN=1` sale
 * **una sola**: la de administración, con el correo y la contraseña que llegan
 * por entorno.
 *
 * ## Por qué existe este modo
 *
 * Las contraseñas de las cuatro cuentas de desarrollo están escritas en este
 * archivo, y este archivo está en un repositorio público. Eso es correcto para
 * una base local de usar y tirar y es **inaceptable en una instalación
 * expuesta**: sembrar ahí `Admin@12345!` sobre la cuenta de SuperAdmin es
 * regalar el control de la plataforma a quien sepa leer el código.
 *
 * Reutiliza `ADMIN_USER_ID` a propósito: es el UUID que `permissions/seed.ts`
 * promueve a SuperAdmin y del que `tasks/seed-events.ts` hace dueño del
 * proyecto histórico. Cambiarlo obligaría a tocar los tres.
 */
interface CuentaSembrada {
  credentialId: string;
  email: string;
  password: string;
  userId: string;
  firstName: string;
  lastName: string;
}

/* ⚠️ El tipo se declara aparte y no como `(typeof SEED_USERS)[number]`. Ese
   array es `as const`, así que su tipo de elemento lleva los literales exactos
   («admin@praxis.dev», «Admin@12345!»…) y un objeto construido en tiempo de
   ejecución, con `string` corriente, no encaja: cuatro errores 2322 que además
   solo aparecen al ejecutar el seed, porque `prisma db seed` compila con
   ts-node y el `tsc` del servicio no mira la carpeta `prisma/`. */
function cuentasASembrar(): ReadonlyArray<CuentaSembrada> {
  if (process.env.SEED_SOLO_SUPERADMIN !== '1') return SEED_USERS;

  const email = process.env.SEED_SUPERADMIN_EMAIL;
  const password = process.env.SEED_SUPERADMIN_PASSWORD;

  /* Se falla aquí y no se cae a un valor por defecto: un defecto silencioso en
     este camino concreto significa sembrar la contraseña del repositorio en una
     instalación expuesta, que es justo lo que este modo existe para evitar. */
  if (!email) throw new Error('SEED_SOLO_SUPERADMIN=1 exige SEED_SUPERADMIN_EMAIL');
  if (!password || password.length < 12) {
    throw new Error('SEED_SOLO_SUPERADMIN=1 exige SEED_SUPERADMIN_PASSWORD de 12+ caracteres');
  }

  return [
    {
      credentialId: ADMIN_CREDENTIAL_ID,
      email,
      password,
      userId: ADMIN_USER_ID,
      firstName: process.env.SEED_SUPERADMIN_NOMBRE ?? 'Super',
      lastName: process.env.SEED_SUPERADMIN_APELLIDO ?? 'Admin',
    },
  ];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  const cuentas = cuentasASembrar();
  console.log(
    `🌱  Iniciando seed de credentials (${cuentas.length} ${
      cuentas.length === 1 ? 'cuenta' : 'cuentas'
    })…\n`,
  );

  try {
    for (const userData of cuentas) {
      const passwordHash = await bcrypt.hash(userData.password, SALT_ROUNDS);

      /**
       * ⚠️ **`emailVerifiedAt` va puesto, y sin él los seeds no sirven de nada.**
       *
       * Desde que existe la confirmación por correo, el login rechaza con
       * `EMAIL_NOT_VERIFIED` a quien no la tenga. Una cuenta sembrada no pasa por
       * un correo —no hay buzón al que escribir— así que sin esta línea
       * `prisma:reset` deja una base en la que **nadie puede entrar**, incluida
       * la cuenta de administración.
       *
       * No se notó al desplegar la v7 porque su migración rellenó las cuentas
       * que ya existían (`SET "emailVerifiedAt" = "createdAt"`). El agujero solo
       * aparece al sembrar de cero: en una máquina recién clonada y en CI.
       *
       * Va también en el `update` para reparar una base ya sembrada sin él.
       */
      const verificado = new Date();

      // Upsert credential
      const credential = await prisma.credential.upsert({
        where: { email: userData.email },
        update: { passwordHash, emailVerifiedAt: verificado },
        create: {
          id: userData.credentialId,
          email: userData.email,
          passwordHash,
          emailVerifiedAt: verificado,
        },
      });

      // Upsert user vinculado a la credential
      const user = await prisma.user.upsert({
        where: { credentialId: credential.id },
        update: { firstName: userData.firstName, lastName: userData.lastName },
        create: {
          id: userData.userId,
          credentialId: credential.id,
          firstName: userData.firstName,
          lastName: userData.lastName,
          status: 'ACTIVE',
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
