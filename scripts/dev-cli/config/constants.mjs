import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * La raíz del monorepo.
 *
 * ⚠️ Se deriva de la posición de **este archivo**, no de `process.cwd()`.
 * Antes era `process.cwd()`, que solo acierta si lanzas el CLI desde la raíz:
 * llamarlo desde `apps/backend/gateway` resolvía todas las rutas contra ese
 * directorio y el catálogo entero apuntaba a la nada, con un error que no
 * mencionaba el directorio de trabajo por ninguna parte.
 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const DOCKER_COMPOSE_FILE = 'infra/docker/compose/docker-compose.yml';

/**
 * Los dos paquetes de `apps/backend/commons` que publican su `main` como
 * `dist/index.js`.
 *
 * ⚠️ **Los dos, no solo `contracts`.** El CLI compilaba únicamente ese, y en un
 * árbol recién clonado los ocho servicios morían con
 * `Cannot find module '@praxis/observability'`. Es el mismo paso que el README
 * marca como imprescindible antes de arrancar el backend.
 */
export const SHARED_BUILD_PACKAGES = ['@praxis/contracts', '@praxis/observability'];

/**
 * Qué claves de un `.env.example` se preguntan en vez de copiarse tal cual.
 *
 * El patrón anterior incluía `URL|URI|HOST|PORT`, y con eso preguntaba por
 * `TCP_PORT`, `REDIS_URL`, `PROJECTS_SERVICE_HOST`… una docena de veces por
 * servicio, todas con la respuesta correcta ya puesta como valor por defecto.
 * Preguntar lo que nadie va a cambiar entrena a pulsar Enter sin leer, que es
 * justo lo contrario de lo que se busca al preguntar por un secreto.
 *
 * Ahora solo lo que de verdad es un secreto y no tiene un valor por defecto
 * que sirva.
 */
export const SENSITIVE_KEY_RE = /(SECRET|PASSWORD|_KEY|TOKEN|CLIENT_SECRET)/i;

/** `@praxis/tasks-service` → `tasks-service`. Para las etiquetas. */
export const label = (svc) => svc.pkg.replace(/^@[^/]+\//, '');
