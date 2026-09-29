/**
 * El entorno del monolito: se compone **antes** de cargar ningún servicio.
 *
 * Es la traducción de lo que hacía `backend.pm2.config.cjs`, que derivaba de
 * pocas variables (`POSTGRES_*`) las muchas que pide cada servicio. Con once
 * procesos cada uno tenía su `process.env`; con uno solo lo comparten todos, y
 * eso obliga a dos cosas que aquí se resuelven y en ningún otro sitio.
 */

/** Los servicios con Prisma, con el schema de Postgres de cada uno. */
export const SCHEMAS = {
  CREDENTIALS: 'credentials',
  PERMISSIONS: 'permissions',
  PROJECTS: 'projects',
  TASKS: 'tasks',
  ASSISTANT: 'assistant',
  AUTOMATION: 'automation',
  BILLING: 'billing',
} as const;

/**
 * Una URL a la que no se puede conectar.
 *
 * Todos los servicios exigen `DATABASE_URL` en su validación, pero en el
 * monolito **ninguno debe usarla**: cada uno lee `<SERVICIO>_DATABASE_URL`. Si a
 * alguno le faltara la suya y cayera a esta, tiene que fallar al arrancar y no
 * escribir en el schema de otro sin decir nada.
 */
const URL_QUE_NO_CONECTA = 'postgresql://sin-uso@monolito.invalid:1/usa-la-url-de-tu-servicio';

function urlBase(env: NodeJS.ProcessEnv): URL | null {
  if (env.POSTGRES_HOST) {
    const user = encodeURIComponent(env.POSTGRES_USER ?? 'praxis');
    const password = encodeURIComponent(env.POSTGRES_PASSWORD ?? '');
    const puerto = env.POSTGRES_PORT ?? '5432';
    const db = env.POSTGRES_DB ?? 'praxis';
    return new URL(`postgresql://${user}:${password}@${env.POSTGRES_HOST}:${puerto}/${db}`);
  }
  if (env.DATABASE_URL && env.DATABASE_URL !== URL_QUE_NO_CONECTA) {
    return new URL(env.DATABASE_URL);
  }
  return null;
}

export function componerEntorno(env: NodeJS.ProcessEnv = process.env): void {
  /* Primero, antes de que nada lea `opcionesDeCliente`. */
  env.PRAXIS_TRANSPORT = 'local';

  const base = urlBase(env);
  for (const [servicio, schema] of Object.entries(SCHEMAS)) {
    const clave = `${servicio}_DATABASE_URL`;
    if (env[clave]) continue;
    if (!base) {
      throw new Error(`Falta ${clave}, y no hay POSTGRES_HOST ni DATABASE_URL de los que sacarla.`);
    }
    const url = new URL(base);
    url.searchParams.set('schema', schema);
    env[clave] = url.toString();
  }
  env.DATABASE_URL = URL_QUE_NO_CONECTA;

  /* collab escucha dentro de este proceso; el gateway le reenvía el WebSocket. */
  env.COLLAB_SERVICE_HOST = '127.0.0.1';
  env.COLLAB_SERVICE_PORT = env.COLLAB_PORT ?? '3010';
  env.HTTP_PORT ??= '3000';
}

/** El schema al que apunta cada servicio, para dejarlo escrito en el log al arrancar (I3). */
export function schemasEnUso(env: NodeJS.ProcessEnv = process.env): string {
  return Object.keys(SCHEMAS)
    .map((servicio) => {
      const url = env[`${servicio}_DATABASE_URL`];
      const schema = url ? new URL(url).searchParams.get('schema') : null;
      return `${servicio.toLowerCase()}→${schema ?? '¿?'}`;
    })
    .join(' ');
}
