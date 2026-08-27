// Igual que el de los otros servicios con Prisma. `package.json#prisma` está
// deprecado y desaparece en Prisma 7; el aviso salía en cada `db seed`.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node -r tsconfig-paths/register prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
