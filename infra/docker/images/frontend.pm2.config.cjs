/**
 * El frontend dentro del contenedor: **un solo proceso**.
 *
 * Fue un multi-zone de ocho apps —el shell y siete zonas, todas en esta misma
 * máquina y bajo este mismo pm2— hasta la fusión de F2 a F7
 * (`docs/PLAN-FUSION-ZONAS.md`). Ahí estaba el argumento entero: se pagaba el
 * coste de Multi-Zones —ocho procesos de Node, ocho compilaciones, un
 * `rewrites()` por zona— sin recibir su único beneficio, que es poder
 * desplegarlas por separado.
 *
 * Con una sola app se caen también las `*_FRONT_URL`: ya no hay a dónde
 * reescribir.
 *
 * ⚠️ `JWT_SECRET` tiene que ser EXACTAMENTE el mismo que el del gateway y el de
 * credentials-service. El guard verifica la firma de la cookie por su cuenta;
 * con un secreto distinto la sesión se ve como inválida y todo redirige al
 * login sin decir por qué.
 */

const {
  GATEWAY_URL = 'http://127.0.0.1:3000',
  JWT_SECRET = '',
  /* Afecta al atributo `Secure` de la cookie de sesión: en producción la cookie
     solo viaja por HTTPS. El balanceador termina TLS y habla HTTP con esta
     máquina, así que el valor se decide aquí y no por el protocolo que ve Next. */
  NODE_ENV = 'production',
} = process.env;

/**
 * `next start` se invoca por su binario y no por el script de pnpm: un proceso
 * menos, y pm2 supervisa a Next directamente en vez de a un envoltorio que se
 * traga las señales.
 */
module.exports = {
  apps: [
    {
      name: 'web',
      cwd: '/app/apps/frontend/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 4100',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      restart_delay: 4000,
      max_restarts: 50,
      kill_timeout: 10000,
      merge_logs: true,
      time: false,
      env: { NODE_ENV, GATEWAY_URL, JWT_SECRET },
    },
  ],
};
