/**
 * Los 8 procesos del backend dentro del contenedor.
 *
 * Este archivo es la traducción a producción de lo que en desarrollo hacen los
 * `.env` sueltos de cada servicio. La lista de puertos y de variables sale de
 * los `.env.example` y de los `validationSchema` de cada `app.module.ts`; si
 * allí cambia algo obligatorio, aquí hay que reflejarlo o el servicio arranca y
 * muere.
 *
 * Al contenedor se le pasan pocas variables y aquí se derivan las muchas:
 *
 *   POSTGRES_HOST · POSTGRES_PORT · POSTGRES_USER · POSTGRES_PASSWORD
 *   POSTGRES_DB   · REDIS_URL     · JWT_SECRET    · VOICE_JWT_SECRET
 *   GEMINI_API_KEY
 *
 * ⚠️ `permissions` es 3002 y `projects` es 3003. Invertirlos no da un error
 * claro: los servicios arrancan, el gateway le habla al que no es y las
 * respuestas salen vacías o con BAD_GATEWAY.
 */

const {
  POSTGRES_HOST = '127.0.0.1',
  POSTGRES_PORT = '5432',
  POSTGRES_USER = 'praxis',
  POSTGRES_PASSWORD = '',
  POSTGRES_DB = 'praxis',
  REDIS_URL = 'redis://127.0.0.1:6379',
  JWT_SECRET = '',
  JWT_EXPIRES_IN = '15m',
  REFRESH_TOKEN_EXPIRES_IN = '7d',
  VOICE_JWT_SECRET = '',
  GEMINI_API_KEY = '',
  GEMINI_MODEL = 'gemini-flash-latest',
  /* ID de cliente de OAuth. No es un secreto —viaja en el JavaScript del
     navegador— pero el backend lo necesita para comprobar que el `aud` del
     token de Google es el nuestro. Sin esa comprobación valdría cualquier ID
     token de Google, incluido el emitido para otra aplicación cualquiera. */
  GOOGLE_CLIENT_ID = '',
  LOG_LEVEL = 'info',
} = process.env;

/**
 * Un solo Postgres con un schema por servicio, igual que en desarrollo.
 *
 * La contraseña se codifica porque Cloud SQL admite caracteres que rompen una
 * URL (`@`, `/`, `#`). Sin esto, una contraseña con `@` parte la cadena de
 * conexión por el sitio equivocado y el error habla de un host que nadie
 * escribió.
 */
function databaseUrl(schema) {
  const user = encodeURIComponent(POSTGRES_USER);
  const password = encodeURIComponent(POSTGRES_PASSWORD);
  return `postgresql://${user}:${password}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}?schema=${schema}`;
}

/** Todos los servicios viven en este contenedor: se hablan por loopback. */
const LOCAL = '127.0.0.1';

const comun = {
  NODE_ENV: 'production',
  LOG_LEVEL,
};

/** Dónde encontrar a cada servicio. El gateway y varios servicios lo necesitan. */
const rutas = {
  CREDENTIALS_SERVICE_HOST: LOCAL,
  CREDENTIALS_SERVICE_PORT: 3001,
  PERMISSIONS_SERVICE_HOST: LOCAL,
  PERMISSIONS_SERVICE_PORT: 3002,
  PROJECTS_SERVICE_HOST: LOCAL,
  PROJECTS_SERVICE_PORT: 3003,
  TASKS_SERVICE_HOST: LOCAL,
  TASKS_SERVICE_PORT: 3004,
  REPORTS_SERVICE_HOST: LOCAL,
  REPORTS_SERVICE_PORT: 3005,
  ASSISTANT_SERVICE_HOST: LOCAL,
  ASSISTANT_SERVICE_PORT: 3006,
  ALEXA_SERVICE_HOST: LOCAL,
  ALEXA_SERVICE_PORT: 3007,
};

/** Valores por defecto de pm2 comunes a los 8 procesos. */
function proceso(name, cwd, env) {
  return {
    name,
    cwd,
    script: 'dist/main.js',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    /* Un servicio que no levanta suele ser una variable que falta. Reintentar
       cada 4 s en vez de en bucle cerrado deja el error legible en el log en
       lugar de ahogarlo en miles de líneas. */
    restart_delay: 4000,
    max_restarts: 50,
    kill_timeout: 10000,
    merge_logs: true,
    time: false,
    env,
  };
}

module.exports = {
  apps: [
    /* Los servicios primero: el gateway se reconecta solo si arranca antes,
       pero así el arranque en frío tiene menos ruido en el log. */
    proceso('credentials', '/app/apps/backend/services/credentials', {
      ...comun,
      TCP_PORT: 3001,
      DATABASE_URL: databaseUrl('credentials'),
      REDIS_URL,
      JWT_SECRET,
      JWT_EXPIRES_IN,
      REFRESH_TOKEN_EXPIRES_IN,
      /* Solo este servicio verifica tokens de Google. El gateway se limita a
         reenviar, así que no lo necesita. */
      GOOGLE_CLIENT_ID,
    }),

    proceso('permissions', '/app/apps/backend/services/permissions', {
      ...comun,
      TCP_PORT: 3002,
      DATABASE_URL: databaseUrl('permissions'),
      REDIS_URL,
    }),

    proceso('projects', '/app/apps/backend/services/projects', {
      ...comun,
      TCP_PORT: 3003,
      DATABASE_URL: databaseUrl('projects'),
      REDIS_URL,
    }),

    proceso('tasks', '/app/apps/backend/services/tasks', {
      ...comun,
      TCP_PORT: 3004,
      DATABASE_URL: databaseUrl('tasks'),
      REDIS_URL,
      PROJECTS_SERVICE_HOST: rutas.PROJECTS_SERVICE_HOST,
      PROJECTS_SERVICE_PORT: rutas.PROJECTS_SERVICE_PORT,
    }),

    /* Sin DATABASE_URL a propósito: no tiene tablas. Agrega lo que le sirven
       tasks y projects, y cachea en Redis. */
    proceso('reports', '/app/apps/backend/services/reports', {
      ...comun,
      TCP_PORT: 3005,
      REDIS_URL,
      TASKS_SERVICE_HOST: rutas.TASKS_SERVICE_HOST,
      TASKS_SERVICE_PORT: rutas.TASKS_SERVICE_PORT,
      PROJECTS_SERVICE_HOST: rutas.PROJECTS_SERVICE_HOST,
      PROJECTS_SERVICE_PORT: rutas.PROJECTS_SERVICE_PORT,
    }),

    /* ⚠️ `GEMINI_API_KEY` es obligatoria y sin ella este proceso NO arranca.
       Es una decisión del servicio: prefiere no levantar a responder 500 en la
       primera pregunta. Si se despliega sin clave, este es el único que queda
       en rojo — el resto de la plataforma funciona. */
    proceso('assistant', '/app/apps/backend/services/assistant', {
      ...comun,
      TCP_PORT: 3006,
      DATABASE_URL: databaseUrl('assistant'),
      REPORTS_SERVICE_HOST: rutas.REPORTS_SERVICE_HOST,
      REPORTS_SERVICE_PORT: rutas.REPORTS_SERVICE_PORT,
      GEMINI_API_KEY,
      GEMINI_MODEL,
    }),

    /* El token de voz lleva secreto propio: es de solo lectura y dura 90 días,
       así que no se reutiliza el JWT_SECRET de la plataforma. */
    proceso('alexa', '/app/apps/backend/services/alexa', {
      ...comun,
      TCP_PORT: 3007,
      DATABASE_URL: databaseUrl('alexa'),
      REDIS_URL,
      VOICE_JWT_SECRET,
      CREDENTIALS_SERVICE_HOST: rutas.CREDENTIALS_SERVICE_HOST,
      CREDENTIALS_SERVICE_PORT: rutas.CREDENTIALS_SERVICE_PORT,
      PROJECTS_SERVICE_HOST: rutas.PROJECTS_SERVICE_HOST,
      PROJECTS_SERVICE_PORT: rutas.PROJECTS_SERVICE_PORT,
      TASKS_SERVICE_HOST: rutas.TASKS_SERVICE_HOST,
      TASKS_SERVICE_PORT: rutas.TASKS_SERVICE_PORT,
    }),

    /* Lo único que escucha fuera del contenedor. El health check del
       balanceador pega en `/api` — con el prefijo global, no en `/`. */
    proceso('gateway', '/app/apps/backend/gateway', {
      ...comun,
      HTTP_PORT: 3000,
      JWT_SECRET,
      ...rutas,
    }),
  ],
};
