/**
 * Los 9 procesos del backend dentro del contenedor.
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
  /* Correo saliente. Solo lo usa credentials-service: confirmar la cuenta y
     recuperar la contraseña. Sin `MAIL_API_KEY` el servicio arranca igual y
     escribe los enlaces en el log en vez de mandarlos. */
  MAIL_API_KEY = '',
  /* Stripe. Vacías = facturación apagada, y el gateway lo detecta al arrancar:
     `GET /me/billing/estado` responde que no está disponible y la interfaz no
     ofrece comprar. Un despliegue sin claves tiene que seguir funcionando. */
  STRIPE_SECRET_KEY = '',
  STRIPE_PRICE_PRO = '',
  /* Los cuatro precios nuevos de la etapa Enterprise. Vacíos por defecto: sin
     ellos el plan correspondiente no se puede contratar y la pantalla no lo
     ofrece, en vez de ofrecer un botón que responde 503. */
  STRIPE_PRICE_PLUS = '',
  STRIPE_PRICE_TEAM = '',
  STRIPE_PRICE_BUSINESS = '',
  STRIPE_WEBHOOK_SECRET = '',
  MAIL_FROM = 'PRAXIS <no-reply@usepraxis.space>',
  /* ⚠️ La base de los enlaces de los correos. Con el valor por defecto de
     desarrollo, cada confirmación apuntaría a la máquina de quien la abre. */
  PUBLIC_APP_URL = 'http://localhost:4100',
  /* `wss://<dominio del api>/api/collab`. Ver el proceso `collab`. */
  COLLAB_PUBLIC_URL = '',
  /* Los adjuntos del chat. Solo los usa projects-service; el resto de
     procesos ni los recibe. "postgres" es el mismo valor por defecto que en
     desarrollo — sin bucket configurado, el driver de GCS ni se instancia. */
  STORAGE_DRIVER = 'postgres',
  GCS_PROJECT_ID = '',
  GCS_BUCKET = '',
  LOG_LEVEL = 'info',
  /* Ver la nota de `comun`. Se deja configurable para poder subirlo sin
     reconstruir la imagen si algún día la base de datos crece. */
  DATABASE_POOL_MAX = '5',
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
  /**
   * Cuántas conexiones a Postgres abre **cada** servicio con Prisma.
   *
   * ⚠️ Sin esto, cada uno abría hasta **diez** —el `max` por defecto de
   * `pg-pool`, que `PrismaPg` no toca—: sesenta por instancia del backend, y
   * hasta ciento ochenta con el grupo escalado a tres, contra un Cloud SQL
   * `db-f1-micro` que por defecto admite **veinticinco**. Pasado el techo,
   * Postgres rechaza y el pool encola: en la pantalla eso se ve como lentitud y
   * conexiones perdidas, nunca como un error de base de datos.
   *
   * Cinco por servicio son treinta por instancia. El otro extremo —subir
   * `max_connections` a 150— está en `infra/terraform/sql.tf`; hacen falta los
   * dos.
   *
   * Va en `comun` y no servicio por servicio a propósito: los que no tienen
   * Prisma (el gateway, reports) simplemente la ignoran, y así no hay forma de
   * añadir un servicio nuevo y olvidarse.
   */
  DATABASE_POOL_MAX,
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
  /* ⚠️ Sin esto el gateway levanta igual y responde 500 en las siete rutas de
     `/automations`: `ClientsModule` no falla al registrarse contra un host
     `undefined`, falla al primer `send`. */
  AUTOMATION_SERVICE_HOST: LOCAL,
  AUTOMATION_SERVICE_PORT: 3008,
  BILLING_SERVICE_HOST: LOCAL,
  BILLING_SERVICE_PORT: 3009,
};

/** Valores por defecto de pm2 comunes a los 9 procesos.
 *
 * ⚠️ **`--max-old-space-size` pone techo al heap de V8**, no un límite
 * artificial: sin él, cada proceso puede crecer sin que el GC actúe hasta
 * que Node lo decida, y los 9 arrancando a la vez (deploy) inflan la memoria
 * del contenedor de golpe — eso es lo que se ve como pico de 3-6 GB en las
 * métricas de Railway, y ahí se cobra por GB-minuto igual que en reposo.
 * 256 MB es holgado para un microservicio de este tamaño (el proceso más
 * pesado, credentials, ronda 150 MB en caliente).
 *
 * `max_memory_restart` es la red de seguridad: si algo tiene una fuga de
 * verdad, pm2 lo reinicia solo antes de que se coma el resto del contenedor,
 * en vez de dejarlo crecer indefinidamente. */
function proceso(name, cwd, env) {
  return {
    name,
    cwd,
    script: 'dist/main.js',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    node_args: '--max-old-space-size=256',
    max_memory_restart: '350M',
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
      /* Y solo este manda correo: es el dueño de las cuentas. */
      MAIL_API_KEY,
      MAIL_FROM,
      PUBLIC_APP_URL,
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
      STORAGE_DRIVER,
      GCS_PROJECT_ID,
      GCS_BUCKET,
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

    /* Automatización. Lee el flujo de hechos de dominio de Redis y habla con
       projects y tasks para evaluar y ejecutar las reglas.

       ⚠️ **Necesita Redis por partida doble**: el stream `praxis:domain-events`
       del que consume, y el mismo cliente para el grupo de consumo. Sin
       `REDIS_URL` arranca y no atiende ni un hecho — las reglas reactivas se
       quedan mudas y no hay ningún error que lo diga. */
    proceso('automation', '/app/apps/backend/services/automation', {
      ...comun,
      TCP_PORT: 3008,
      DATABASE_URL: databaseUrl('automation'),
      REDIS_URL,
      PROJECTS_SERVICE_HOST: rutas.PROJECTS_SERVICE_HOST,
      PROJECTS_SERVICE_PORT: rutas.PROJECTS_SERVICE_PORT,
      TASKS_SERVICE_HOST: rutas.TASKS_SERVICE_HOST,
      TASKS_SERVICE_PORT: rutas.TASKS_SERVICE_PORT,
    }),

    /* Planes, organizaciones y cuotas.

       ⚠️ **No habla con nadie**, y por eso su bloque de entorno es el más corto
       de los nueve: contesta qué plan tiene cada cual y qué da ese plan; quien
       cuenta proyectos y quien niega es el gateway. Si algún día aparece aquí un
       `*_SERVICE_HOST`, es que se ha invertido el reparto. */
    proceso('billing', '/app/apps/backend/services/billing', {
      ...comun,
      TCP_PORT: 3009,
      DATABASE_URL: databaseUrl('billing'),
    }),

    /* Lo único que escucha fuera del contenedor. El health check del
       balanceador pega en `/api` — con el prefijo global, no en `/`. */
    /* El tiempo real de los documentos (docs/PLAN-DOCUMENTOS.md, E3). Escucha
       en loopback: el navegador llega a él por el gateway, `wss://<api>/api/
       collab` (ver `collab-proxy.ts`), porque Railway publica un solo puerto
       por servicio. No tiene base propia: carga y guarda por projects-service. */
    proceso('collab', '/app/apps/backend/services/collab', {
      ...comun,
      COLLAB_PORT: 3010,
      JWT_SECRET,
      PROJECTS_SERVICE_HOST: rutas.PROJECTS_SERVICE_HOST,
      PROJECTS_SERVICE_PORT: rutas.PROJECTS_SERVICE_PORT,
    }),
    proceso('gateway', '/app/apps/backend/gateway', {
      ...comun,
      HTTP_PORT: 3000,
      JWT_SECRET,
      /* Adónde se conecta el navegador para el tiempo real: el dominio público
         del propio `api` con `/api/collab`. Sin ella, el billete apunta a
         localhost y el editor se queda «Conectando…» en producción. */
      COLLAB_PUBLIC_URL,
      COLLAB_SERVICE_HOST: '127.0.0.1',
      COLLAB_SERVICE_PORT: 3010,
      /* ⚠️ El gateway necesita Redis, y esto es fácil de pasar por alto porque
         durante mucho tiempo no lo necesitó: es el único que mantiene abiertas
         las conexiones SSE de los avisos en vivo, y se suscribe al canal donde
         projects-service publica.

         Sin esta línea cae al `redis://localhost:6379` por defecto, que dentro
         de este contenedor no es nadie —Redis vive en otra máquina—. No falla
         de forma visible: el gateway arranca, sirve todo lo demás y los avisos
         simplemente no llegan nunca. En desarrollo funcionaba porque allí el
         valor por defecto resulta ser el correcto. */
      REDIS_URL,
      /* El cobro del plan PRO vive entero en el gateway: el checkout, el portal
         y el webhook. Ningún microservicio habla con Stripe.

         ⚠️ `STRIPE_WEBHOOK_SECRET` es la **única** autenticación de
         `/api/webhooks/stripe`. Sin ella el gateway rechaza todos los eventos
         con 400 y, como el plan lo concede el webhook y solo el webhook, nadie
         llega nunca a PRO por bien que funcione el pago. */
      STRIPE_SECRET_KEY,
      STRIPE_PRICE_PRO,
      STRIPE_PRICE_PLUS,
      STRIPE_PRICE_TEAM,
      STRIPE_PRICE_BUSINESS,
      STRIPE_WEBHOOK_SECRET,
      ...rutas,
    }),
  ],
};
