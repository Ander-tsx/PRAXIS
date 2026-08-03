import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import inquirer from 'inquirer';
import {
  DOCKER_COMPOSE_FILE,
  ROOT,
  SENSITIVE_KEY_RE,
  SHARED_BUILD_PACKAGES,
} from '../config/index.mjs';
import { aviso, azul, gris, ok, paso } from './ui.mjs';

/** Ejecuta y deja que la salida fluya. Lanza si el comando falla. */
export function sh(cmd, opts = {}) {
  console.log(gris(`  $ ${cmd}`));
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

// ── Docker ──────────────────────────────────────────────────────────────────

export function docker(accion) {
  if (accion === 'skip') return;

  paso('Infraestructura (Postgres + Redis)');
  if (accion === 'restart') sh(`docker compose -f ${DOCKER_COMPOSE_FILE} down`);
  sh(`docker compose -f ${DOCKER_COMPOSE_FILE} up -d`);
  ok('Contenedores arriba');
}

/**
 * Espera a que Postgres acepte consultas, no solo a que el contenedor exista.
 *
 * `docker compose up -d` vuelve en cuanto el contenedor arranca, pero Postgres
 * tarda un par de segundos más en aceptar conexiones. Lanzar `prisma migrate`
 * en esa ventana falla con un error de conexión que parece de configuración y
 * no lo es.
 */
export function esperarPostgres({ intentos = 30 } = {}) {
  for (let i = 0; i < intentos; i++) {
    try {
      execSync('docker exec praxis_postgres pg_isready -U praxis', { stdio: 'ignore' });
      return true;
    } catch {
      execSync('sleep 1');
    }
  }
  return false;
}

// ── Paquetes compartidos ────────────────────────────────────────────────────

/**
 * Compila `contracts` y `observability`.
 *
 * ⚠️ Los **dos**. El CLI compilaba solo `contracts` y en un árbol limpio los
 * ocho servicios morían con `Cannot find module '@praxis/observability'`.
 */
export function compilarCompartidos() {
  paso('Paquetes compartidos del backend');
  for (const pkg of SHARED_BUILD_PACKAGES) sh(`pnpm --filter ${pkg} run build`);
  ok(`${SHARED_BUILD_PACKAGES.join(' y ')} compilados`);
}

// ── Prisma ──────────────────────────────────────────────────────────────────

/**
 * Genera el cliente de Prisma de cada servicio que tenga esquema.
 *
 * ⚠️ **Este paso no existía**, y es obligatorio en un árbol recién clonado: el
 * cliente se genera dentro de `src/generated/` y no está versionado, así que
 * sin esto el servicio arranca y muere con
 * `Cannot find module '../generated/prisma-client'`.
 *
 * Se recorre servicio a servicio y no con `pnpm --filter "@praxis/*-service"`
 * porque ese filtro incluye a reports-service, que no tiene Prisma, y el
 * comando aborta entero con `Command "prisma" not found`. Es el mismo motivo
 * por el que el `prisma:generate` de la raíz está marcado como roto.
 */
export function prismaGenerate(servicios) {
  const conPrisma = servicios.filter((s) => s.prisma);
  if (conPrisma.length === 0) return;

  paso('Clientes de Prisma');
  for (const svc of conPrisma) sh(`pnpm --filter ${svc.pkg} exec prisma generate`);
  ok(`${conPrisma.length} cliente(s) generado(s)`);
}

/**
 * Recrea las tablas.
 *
 * `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` va puesto porque Prisma bloquea
 * `migrate reset` cuando cree que lo pide un agente. Aquí lo ha pedido una
 * persona, por un menú que ya avisó de que borra los datos.
 */
export function prismaReset(servicios) {
  const conPrisma = servicios.filter((s) => s.prisma);
  if (conPrisma.length === 0) return;

  paso('Recreando las tablas');
  for (const svc of conPrisma) {
    sh(`pnpm --filter ${svc.pkg} exec prisma migrate reset --force --skip-seed`, {
      env: { ...process.env, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: '1' },
    });
  }
  ok(`${conPrisma.length} base(s) recreada(s)`);
}

/**
 * Siembra **en orden**.
 *
 * ⚠️ El orden no es un detalle: permissions antes que credentials, y projects
 * antes que tasks. La versión anterior sembraba en el orden en que estuvieran
 * los servicios en el menú, que es el orden en que el usuario marcó las
 * casillas. Con suerte funcionaba.
 */
export function prismaSeed(servicios) {
  const conSeed = servicios
    .filter((s) => s.seedOrder !== null && s.seedOrder !== undefined)
    .sort((a, b) => a.seedOrder - b.seedOrder);

  if (conSeed.length === 0) return;

  paso(`Seeds (${conSeed.map((s) => s.key).join(' → ')})`);
  for (const svc of conSeed) sh(`pnpm --filter ${svc.pkg} run prisma:seed`);
  ok(`${conSeed.length} seed(s) ejecutado(s)`);
}

// ── Archivos de entorno ─────────────────────────────────────────────────────

function leerEnv(contenido) {
  const mapa = new Map();

  for (const bruta of contenido.split('\n')) {
    const linea = bruta.trim();
    if (!linea || linea.startsWith('#')) continue;

    const igual = linea.indexOf('=');
    if (igual === -1) continue;

    mapa.set(linea.slice(0, igual).trim(), linea.slice(igual + 1).trim().replace(/^["']|["']$/g, ''));
  }

  return mapa;
}

const escribirEnv = (mapa) =>
  `${[...mapa.entries()].map(([k, v]) => `${k}=${v}`).join('\n')}\n`;

/**
 * Completa el archivo de entorno de un servicio desde su `.env.example`.
 *
 * ⚠️ El nombre del archivo sale de `svc.envFile`, que en el frontend es
 * **`.env.local`**. Next no lee `.env` en desarrollo, así que rellenar ese
 * archivo era escribir uno que nadie abre; el síntoma llegaba mucho después,
 * como un `GATEWAY_URL` undefined en la primera petición.
 *
 * Devuelve qué hizo, para poder resumirlo al final en vez de soltar una línea
 * por servicio en mitad del arranque.
 */
export async function completarEnv(svc) {
  const dir = path.join(ROOT, svc.dir);
  const ejemploPath = path.join(dir, '.env.example');
  const destino = path.join(dir, svc.envFile ?? '.env');

  if (!fs.existsSync(ejemploPath)) {
    return { key: svc.key, estado: fs.existsSync(destino) ? 'ok' : 'sin-plantilla' };
  }

  const ejemplo = leerEnv(fs.readFileSync(ejemploPath, 'utf8'));
  const actual = fs.existsSync(destino) ? leerEnv(fs.readFileSync(destino, 'utf8')) : new Map();

  const faltan = [...ejemplo.keys()].filter((k) => !actual.has(k));
  if (faltan.length === 0) return { key: svc.key, estado: 'ok' };

  console.log(`\n${azul(`  ${svc.key}`)} ${gris(`· faltan ${faltan.length} variable(s) en ${svc.envFile ?? '.env'}`)}`);

  for (const clave of faltan) {
    const porDefecto = ejemplo.get(clave);

    if (SENSITIVE_KEY_RE.test(clave)) {
      const { valor } = await inquirer.prompt([
        { type: 'input', name: 'valor', message: `    ${clave}`, default: porDefecto },
      ]);
      actual.set(clave, valor);
    } else {
      actual.set(clave, porDefecto);
    }
  }

  fs.writeFileSync(destino, escribirEnv(actual));
  return { key: svc.key, estado: 'completado', añadidas: faltan.length };
}

/**
 * Avisa si falta el archivo de entorno de algún servicio que se va a levantar.
 *
 * No lo crea ni pregunta: solo lo dice. Un servicio sin `.env` arranca y muere
 * con un error de conexión que no menciona el archivo que falta, y encontrarlo
 * desde ahí cuesta bastante más que leer esta línea.
 */
export function revisarEnvFaltantes(servicios) {
  const sinEnv = servicios.filter((svc) => {
    const destino = path.join(ROOT, svc.dir, svc.envFile ?? '.env');
    return !fs.existsSync(destino);
  });

  if (sinEnv.length > 0) {
    aviso(`Sin archivo de entorno: ${sinEnv.map((s) => s.key).join(', ')}`);
    console.log(gris('  Van a arrancar y morir. Responde que sí a «completar .env» o créalos a mano.'));
  }

  return sinEnv;
}
