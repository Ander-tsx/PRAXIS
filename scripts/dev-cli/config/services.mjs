/**
 * El catálogo de lo que este CLI sabe levantar.
 *
 * ## Por qué está escrito a mano y no descubierto por glob
 *
 * Porque lo que hace falta saber de cada servicio no está en su `package.json`:
 * el puerto, si tiene esquema de Prisma, si tiene seed y —sobre todo— en qué
 * orden hay que sembrar. Descubrirlos por glob daría la lista, no el orden, y
 * el orden es la mitad del problema.
 *
 * ## El precio de escribirlo a mano, y cómo se paga
 *
 * Se pudre. De hecho estaba podrido: seis de las siete rutas apuntaban a
 * `apps/backend/<x>-service` cuando el layout real lleva tiempo siendo
 * `apps/backend/services/<x>`, faltaba `reports-service` entero y el frontend
 * declaraba una app `apps/frontend/web` que no existe.
 *
 * Y no daba error, que es lo peor: `ensureEnvFile` hacía `existsSync` sobre la
 * ruta mala, no encontraba `.env.example` y **volvía en silencio**; el arranque
 * caía a `pnpm --filter <pkg>`, que funciona desde la raíz sin tocar `dir`.
 * Todo parecía ir bien mientras la mitad de los pasos no hacía nada.
 *
 * Por eso `revisarCatalogo()` se ejecuta al arrancar (`index.mjs`) y devuelve la
 * lista de rutas que no existen o cuyo `package.json` se llama de otra forma. Si
 * alguien vuelve a mover una carpeta, el CLI lo dice en la primera línea en vez
 * de fingir.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './constants.mjs';

/**
 * Servicios del backend, en el orden en que se listan.
 *
 * `seedOrder` es lo que no se puede deducir: **permissions va antes que
 * credentials**, y projects antes que tasks. Sembrar en otro orden deja claves
 * colgando. Es el mismo orden del paso 6 del README.
 *
 * `prisma: false` en reports no es un olvido: ese servicio no tiene tablas
 * propias, lee de tasks y projects por TCP y cachea en Redis. Ofrecerle un
 * `migrate reset` sería ofrecer un comando que aborta con
 * `Command "prisma" not found` — que es exactamente por lo que el
 * `pnpm prisma:generate` de la raíz está roto y el README manda usar bucles.
 */
export const BACKEND_SERVICES = [
  {
    key: 'gateway',
    pkg: '@praxis/gateway',
    dir: 'apps/backend/gateway',
    port: 3000,
    protocolo: 'HTTP',
    prisma: false,
    seedOrder: null,
    color: 34,
    descripcion: 'API pública · Swagger en /api/docs',
  },
  {
    key: 'credentials',
    pkg: '@praxis/credentials-service',
    dir: 'apps/backend/services/credentials',
    port: 3001,
    protocolo: 'TCP',
    prisma: true,
    seedOrder: 2,
    color: 35,
    descripcion: 'Cuentas, sesiones y JWT',
  },
  {
    key: 'permissions',
    pkg: '@praxis/permissions-service',
    dir: 'apps/backend/services/permissions',
    port: 3002,
    protocolo: 'TCP',
    prisma: true,
    seedOrder: 1,
    color: 33,
    descripcion: 'Roles globales y de proyecto',
  },
  {
    key: 'projects',
    pkg: '@praxis/projects-service',
    dir: 'apps/backend/services/projects',
    port: 3003,
    protocolo: 'TCP',
    prisma: true,
    seedOrder: 3,
    color: 36,
    descripcion: 'Proyectos, espacios, tableros y avisos',
  },
  {
    key: 'tasks',
    pkg: '@praxis/tasks-service',
    dir: 'apps/backend/services/tasks',
    port: 3004,
    protocolo: 'TCP',
    prisma: true,
    seedOrder: 4,
    color: 32,
    descripcion: 'Tareas, checklists, adjuntos e historial',
  },
  {
    key: 'reports',
    pkg: '@praxis/reports-service',
    dir: 'apps/backend/services/reports',
    port: 3005,
    protocolo: 'TCP',
    prisma: false,
    seedOrder: null,
    color: 94,
    descripcion: 'Agregados de Análisis · sin tablas propias',
  },
  {
    key: 'assistant',
    pkg: '@praxis/assistant-service',
    dir: 'apps/backend/services/assistant',
    port: 3006,
    protocolo: 'TCP',
    prisma: true,
    seedOrder: null,
    color: 31,
    descripcion: 'Asistente de IA (Gemini)',
  },
  {
    key: 'alexa',
    pkg: '@praxis/alexa-service',
    dir: 'apps/backend/services/alexa',
    port: 3007,
    protocolo: 'TCP',
    prisma: true,
    seedOrder: null,
    color: 91,
    descripcion: 'Praxis Voice · vinculación y consultas',
  },
  {
    key: 'automation',
    pkg: '@praxis/automation-service',
    dir: 'apps/backend/services/automation',
    port: 3008,
    protocolo: 'TCP',
    prisma: true,
    seedOrder: null,
    color: 92,
    descripcion: 'Automatizaciones · base operativa sin reglas aún',
  },
  {
    key: 'billing',
    pkg: '@praxis/billing-service',
    dir: 'apps/backend/services/billing',
    port: 3009,
    protocolo: 'TCP',
    prisma: true,
    seedOrder: null,
    color: 36,
    descripcion: 'Planes, organizaciones y cuotas',
  },
];

/**
 * Las ocho zonas del frontend (el shell y las siete de negocio).
 *
 * ⚠️ Su archivo de entorno es **`.env.local`**, no `.env`. Next solo carga el
 * primero, así que rellenar `.env` aquí es escribir un archivo que nadie lee —
 * y el síntoma es un `GATEWAY_URL` undefined a la primera petición, ya en
 * runtime y lejos de aquí.
 */
export const FRONTEND_APPS = [
  {
    key: 'web-shell',
    pkg: '@praxis/web-shell',
    dir: 'apps/frontend/web-shell',
    port: 4100,
    envFile: '.env.local',
    color: 95,
    descripcion: 'Cáscara · landing y rewrites',
  },
  {
    key: 'auth-front',
    pkg: '@praxis/auth-front',
    dir: 'apps/frontend/auth-front',
    port: 4101,
    envFile: '.env.local',
    color: 96,
    descripcion: 'Login y registro',
  },
  {
    key: 'dashboard-front',
    pkg: '@praxis/dashboard-front',
    dir: 'apps/frontend/dashboard-front',
    port: 4102,
    envFile: '.env.local',
    color: 96,
    descripcion: 'Panel, avisos y ajustes',
  },
  {
    key: 'projects-front',
    pkg: '@praxis/projects-front',
    dir: 'apps/frontend/projects-front',
    port: 4103,
    envFile: '.env.local',
    color: 96,
    descripcion: 'Proyectos y tableros',
  },
  {
    key: 'reports-front',
    pkg: '@praxis/reports-front',
    dir: 'apps/frontend/reports-front',
    port: 4104,
    envFile: '.env.local',
    color: 96,
    descripcion: 'Análisis: lienzo de gráficos',
  },
  {
    key: 'admin-front',
    pkg: '@praxis/admin-front',
    dir: 'apps/frontend/admin-front',
    port: 4105,
    envFile: '.env.local',
    color: 96,
    descripcion: 'Administración de la plataforma',
  },
  {
    key: 'chat-front',
    pkg: '@praxis/chat-front',
    dir: 'apps/frontend/chat-front',
    port: 4106,
    envFile: '.env.local',
    color: 96,
    descripcion: 'Mensajes directos y de proyecto',
  },
  {
    key: 'assistant-front',
    pkg: '@praxis/assistant-front',
    dir: 'apps/frontend/assistant-front',
    port: 4107,
    envFile: '.env.local',
    color: 96,
    descripcion: 'PRAX, el asistente',
  },
];

/**
 * El frontend se arranca **de una pieza, con turbo**, no zona a zona.
 *
 * Siete `next dev` lanzados por separado funcionan, pero turbo ya sabe el orden
 * y comparte la caché; y sobre todo, la lista de zonas vive en un único filtro
 * en vez de repetida aquí. Las entradas de `FRONTEND_APPS` siguen haciendo
 * falta para los `.env.local` y para saber qué puertos vigilar.
 */
export const FRONTEND_TURBO_SERVICE = {
  key: 'frontend',
  pkg: 'frontend (turbo)',
  dir: '.',
  prisma: false,
  seedOrder: null,
  color: 96,
  descripcion: 'Las 8 zonas juntas',
  /**
   * ⚠️ Va por `pnpm run`, **no invocando `turbo` directamente**.
   *
   * Antes era `turbo run dev --filter="./apps/frontend/*"` a pelo, y moría con
   * `/bin/sh: turbo: command not found`: `turbo` es una dependencia de la raíz
   * y vive en `node_modules/.bin`, que no está en el PATH de un `spawn`. Los
   * servicios del backend se libraban por casualidad, porque van por
   * `pnpm --filter`, y pnpm sí añade esa carpeta al PATH.
   *
   * Además apunta al script `dev:frontend` que ya existe en la raíz, así que el
   * filtro de las zonas vive en un único sitio y esto hace exactamente lo mismo
   * que documenta el README.
   */
  startCommand: 'pnpm run dev:frontend',
  /** Para el chequeo de «ya está listo»: se da por arriba cuando responden todos. */
  puertosVigilados: FRONTEND_APPS.map((a) => a.port),
};

export const ALL_SERVICES = [...BACKEND_SERVICES, ...FRONTEND_APPS];

/**
 * Presets, porque nadie quiere marcar ocho casillas cada mañana.
 *
 * «Mínimo» es la respuesta a «solo quiero entrar y mirar un tablero»: sin
 * assistant (Gemini cuesta dinero), sin alexa y sin reports.
 */
export const PRESETS = [
  {
    key: 'todo',
    nombre: 'Todo — los 9 servicios y las 7 zonas',
    backend: BACKEND_SERVICES.map((s) => s.key),
    frontend: true,
  },
  {
    key: 'minimo',
    nombre: 'Mínimo — entrar y usar la app (sin IA, voz ni análisis)',
    backend: ['gateway', 'credentials', 'permissions', 'projects', 'tasks'],
    frontend: true,
  },
  {
    key: 'backend',
    nombre: 'Solo backend — los 9 servicios, sin frontend',
    backend: BACKEND_SERVICES.map((s) => s.key),
    frontend: false,
  },
  {
    key: 'frontend',
    nombre: 'Solo frontend — las 7 zonas (el backend ya está arriba)',
    backend: [],
    frontend: true,
  },
  { key: 'custom', nombre: 'Elegir a mano…', backend: null, frontend: null },
];

/**
 * Comprueba que cada ruta declarada existe de verdad.
 *
 * Es la red que faltaba: sin esto, mover una carpeta no rompe el CLI, lo deja
 * mintiendo. Devuelve la lista de problemas en vez de lanzar, para que quien
 * llama decida cómo enseñarlos.
 */
export function revisarCatalogo() {
  const problemas = [];

  for (const svc of [...BACKEND_SERVICES, ...FRONTEND_APPS]) {
    const dir = path.join(ROOT, svc.dir);

    if (!fs.existsSync(dir)) {
      problemas.push(`${svc.key}: no existe el directorio ${svc.dir}`);
      continue;
    }

    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      problemas.push(`${svc.key}: ${svc.dir} no tiene package.json`);
      continue;
    }

    const nombreReal = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).name;
    if (nombreReal !== svc.pkg) {
      problemas.push(
        `${svc.key}: el catálogo dice "${svc.pkg}" pero ${svc.dir} se llama "${nombreReal}"`,
      );
    }
  }

  return problemas;
}
