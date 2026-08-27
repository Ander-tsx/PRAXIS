import { randomBytes } from 'node:crypto';
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
 * Los **tres** paquetes de `apps/backend/commons` que publican su `main` como
 * `dist/index.js`.
 *
 * ⚠️ **Los tres, y la lista se ha quedado corta dos veces ya.** Primero estaba
 * solo `contracts`, y en un árbol recién clonado los ocho servicios morían con
 * `Cannot find module '@praxis/observability'`. Luego faltaba
 * `@praxis/domain-events`, que importan `tasks-service` y `projects-service`
 * para su outbox: los otros seis levantaban, esos dos morían, y el arranque
 * quedaba a medias sin que nada dijera que faltaba un paso de compilación.
 *
 * Es la misma lista que compila `pnpm build:shared` en la raíz, que el README
 * marca como imprescindible antes de arrancar el backend. **Si aparece un
 * cuarto paquete con `dist/`, va aquí y allí.**
 */
export const SHARED_BUILD_PACKAGES = [
  '@praxis/contracts',
  '@praxis/observability',
  '@praxis/domain-events',
];

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

/**
 * Claves que tienen que valer **exactamente lo mismo** en todos los archivos de
 * entorno que las declaran, y por tanto se preguntan **una sola vez**.
 *
 * `JWT_SECRET` está en diez sitios: el gateway, credentials-service y las ocho
 * zonas del frontend. Cada zona lo usa para verificar la cookie de sesión por su
 * cuenta, sin preguntarle al gateway, así que un valor distinto en una sola zona
 * no da ningún error: la firma no valida, la sesión se trata como anónima y esa
 * zona —solo esa— redirige al login para siempre. Desde fuera parece que la
 * sesión «se pierde al entrar en Análisis».
 *
 * El CLI las preguntaba una por una porque `SENSITIVE_KEY_RE` las casa. Diez
 * preguntas seguidas con el mismo enunciado y sin valor por defecto es una
 * invitación a teclear diez valores distintos.
 *
 * `generar` es cómo se propone un valor cuando no existe en ningún archivo
 * todavía. Solo lo tiene lo que de verdad es un secreto: nadie escribe 64
 * caracteres aleatorios a mano, y el que se escriba a mano en local acaba siendo
 * `secret` o `praxis123`. Lo que no es un secreto —el precio que se enseña en la
 * tarjeta de PRO— no se inventa: se pregunta con lo que diga su `.env.example`.
 */
export const SHARED_KEYS = [
  { clave: 'JWT_SECRET', generar: () => randomBytes(32).toString('hex') },
  { clave: 'NEXT_PUBLIC_PRECIO_PRO' },
];

/**
 * Claves que se preguntan aunque no parezcan un secreto.
 *
 * `SENSITIVE_KEY_RE` acierta con lo que lleva `SECRET`, `TOKEN` o `_KEY` en el
 * nombre, y estas tres no llevan ninguno — pero cada una **enciende o apaga una
 * función entera**, y su valor por defecto en el `.env.example` está vacío. Sin
 * esto se copiaban en silencio, y el resultado era una pantalla de pago que
 * responde 503 o un botón de Google que no se dibuja, sin que nada lo hubiera
 * mencionado durante el arranque.
 *
 * Se preguntan con el valor de la plantilla por defecto: pulsar Enter deja la
 * función apagada, que es una respuesta legítima y ahora es una **decisión**.
 */
export const ALWAYS_ASK_KEYS = new Set([
  'STRIPE_PRICE_PRO',
  'GOOGLE_CLIENT_ID',
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
]);

/**
 * Secretos de un solo servicio a los que se propone un valor **generado** en vez
 * de la cadena vacía de su plantilla.
 *
 * Es distinto de `SHARED_KEYS`: estos no se comparten con nadie, y precisamente
 * por eso ofrecerlos vacíos empuja al error. `VOICE_JWT_SECRET` firma un token
 * de voz de solo lectura y **90 días** de vida, y su propio `.env.example` avisa
 * en mayúsculas de que no se reutilice el `JWT_SECRET` de la plataforma. Cuando
 * la única sugerencia es «vacío», lo que se pega ahí es el que ya tienes a mano.
 * Ya pasó en este repositorio.
 */
export const GENERAR_SI_VACIO = new Map([
  ['VOICE_JWT_SECRET', () => randomBytes(32).toString('hex')],
]);
