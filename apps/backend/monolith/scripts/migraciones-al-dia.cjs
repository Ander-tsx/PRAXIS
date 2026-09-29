/**
 * ¿Están aplicadas todas las migraciones que trae esta imagen?
 *
 * Sale con 0 si sí, y con cualquier otro código si falta alguna o no se pudo
 * comprobar. `start-backend.sh` solo llama a `migrar.sh` en el segundo caso.
 *
 * ## Por qué existe
 *
 * Railway duerme `praxis-api` cuando nadie lo usa (docs/PLAN-MONOLITO.md, M-K)
 * y lo despierta con la primera visita, arrancando un contenedor nuevo. Si en
 * cada arranque se corren los siete `prisma migrate deploy`, cada despertar
 * paga entre 8 s (medido en local) y el doble en la CPU compartida de Railway
 * **antes de servir nada**. La primera visita de la mañana superaría el plazo
 * de 15 s del frontend.
 *
 * Esto abre una sola conexión y compara las carpetas de `prisma/migrations` de
 * cada servicio con la tabla `_prisma_migrations` de su schema: unos cientos de
 * milisegundos. Solo tras un despliegue con migraciones nuevas falta alguna, y
 * entonces se aplica como siempre.
 *
 * ⚠️ Ante la duda, migrar: si algo falla aquí (conexión, tabla que no existe) se
 * sale con error y `migrar.sh` hace su trabajo. Esto solo puede ahorrar tiempo,
 * nunca saltarse una migración pendiente.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

/** Los servicios con Prisma, que son también los nombres de sus schemas. */
const SERVICIOS = [
  'permissions',
  'credentials',
  'projects',
  'tasks',
  'assistant',
  'automation',
  'billing',
];

const RAIZ = path.resolve(__dirname, '../../services');

function migracionesDe(servicio) {
  const dir = path.join(RAIZ, servicio, 'prisma', 'migrations');
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

async function main() {
  const cliente = new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    connectionTimeoutMillis: 5000,
  });
  await cliente.connect();
  try {
    for (const servicio of SERVICIOS) {
      const esperadas = migracionesDe(servicio);
      const { rows } = await cliente.query(
        `SELECT migration_name FROM "${servicio}"."_prisma_migrations"
          WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      );
      const aplicadas = new Set(rows.map((r) => r.migration_name));
      const faltan = esperadas.filter((m) => !aplicadas.has(m));
      if (faltan.length > 0) {
        console.log(`[migraciones] ${servicio}: faltan ${faltan.length} (${faltan.join(', ')})`);
        return 1;
      }
    }
    return 0;
  } finally {
    await cliente.end();
  }
}

main().then(
  (codigo) => process.exit(codigo),
  (error) => {
    console.log(`[migraciones] no se pudo comprobar (${error.message}); se migrará`);
    process.exit(2);
  },
);
