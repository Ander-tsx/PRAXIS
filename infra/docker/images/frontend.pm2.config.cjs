/**
 * El shell y las 7 zonas dentro del contenedor.
 *
 * Las tres variables que de verdad vienen de fuera son `GATEWAY_URL` (la
 * dirección interna del backend), `JWT_SECRET` (el mismo que el gateway) y
 * `NODE_ENV`. Las `*_FRONT_URL` se resuelven a loopback porque las ocho apps
 * comparten máquina.
 *
 * ⚠️ `JWT_SECRET` tiene que ser EXACTAMENTE el mismo que el del gateway y el de
 * credentials-service. Cada zona verifica la firma de la cookie por su cuenta
 * en el guard; con un secreto distinto la sesión se ve como inválida y todo
 * redirige al login sin decir por qué.
 */

const {
  GATEWAY_URL = 'http://127.0.0.1:3000',
  JWT_SECRET = '',
  /* Afecta al atributo `Secure` de la cookie de sesión: en producción la cookie
     solo viaja por HTTPS. El balanceador termina TLS y habla HTTP con esta
     máquina, así que el valor se decide aquí y no por el protocolo que ve Next. */
  NODE_ENV = 'production',
} = process.env;

const LOCAL = '127.0.0.1';

/**
 * Destino de los `rewrites()` del shell.
 *
 * ⚠️ `ADMIN_FRONT_URL` la lee `web-shell/next.config.ts` pero **no aparece** en
 * su `.env.example`, y `admin-front` no tiene `.env.example` ninguno. Aquí van
 * las seis explícitas para que el despliegue no dependa de un valor por
 * defecto que nadie documentó. `CHAT_FRONT_URL` está en el mismo caso desde
 * E3.
 */
const zonas = {
  AUTH_FRONT_URL: `http://${LOCAL}:4101`,
  DASHBOARD_FRONT_URL: `http://${LOCAL}:4102`,
  PROJECTS_FRONT_URL: `http://${LOCAL}:4103`,
  ADMIN_FRONT_URL: `http://${LOCAL}:4105`,
  CHAT_FRONT_URL: `http://${LOCAL}:4106`,
  ASSISTANT_FRONT_URL: `http://${LOCAL}:4107`,
};

const comun = {
  NODE_ENV,
  GATEWAY_URL,
  JWT_SECRET,
};

/**
 * `next start` se invoca por su binario y no por el script de pnpm: un proceso
 * menos por app, y pm2 supervisa a Next directamente en vez de a un envoltorio
 * que se traga las señales.
 */
function zona(name, dir, port, env = {}) {
  return {
    name,
    cwd: `/app/apps/frontend/${dir}`,
    script: 'node_modules/next/dist/bin/next',
    args: `start --port ${port}`,
    interpreter: 'node',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    restart_delay: 4000,
    max_restarts: 50,
    kill_timeout: 10000,
    merge_logs: true,
    time: false,
    env: { ...comun, ...env },
  };
}

module.exports = {
  apps: [
    /* Las zonas primero: el shell reescribe hacia ellas y así una petición
       temprana no llega antes de que exista el destino. */
    zona('auth-front', 'auth-front', 4101),
    zona('dashboard-front', 'dashboard-front', 4102),
    zona('projects-front', 'projects-front', 4103),
    zona('admin-front', 'admin-front', 4105),
    zona('chat-front', 'chat-front', 4106),
    zona('assistant-front', 'assistant-front', 4107),

    /* Lo único que ve el balanceador. Su `/` es la landing pública, que además
       sirve de health check: responde 200 sin sesión. */
    zona('web-shell', 'web-shell', 4100, zonas),
  ],
};
