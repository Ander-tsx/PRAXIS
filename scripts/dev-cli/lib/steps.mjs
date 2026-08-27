import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import inquirer from 'inquirer';
import {
  ALWAYS_ASK_KEYS,
  DOCKER_COMPOSE_FILE,
  GENERAR_SI_VACIO,
  ROOT,
  SENSITIVE_KEY_RE,
  SHARED_BUILD_PACKAGES,
  SHARED_KEYS,
} from '../config/index.mjs';
import { aviso, azul, gris, ok, rojo, spinner } from './ui.mjs';

/** `DEBUG=1 pnpm dev:cli` enseña la salida de cada comando en vez de resumirla. */
const VERBOSO = Boolean(process.env.DEBUG);

/**
 * Ejecuta un comando y **captura** su salida.
 *
 * ⚠️ Es asíncrono a propósito, y no es un capricho: `execSync` bloquea el bucle
 * de eventos, así que el `setInterval` del spinner no llega a dispararse nunca
 * y lo que se ve es un spinner congelado en el primer fotograma durante los
 * cuarenta segundos que tarda un `prisma generate`. Peor que no ponerlo.
 *
 * La salida se guarda y solo se enseña si el comando falla. Un arranque que va
 * bien no necesita mostrar los avisos de deprecación de Prisma seis veces.
 */
function ejecutar(cmd, env) {
  return new Promise((resolve, reject) => {
    const hijo = spawn(cmd, {
      cwd: ROOT,
      shell: true,
      env: env ?? process.env,
      stdio: VERBOSO ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });

    let salida = '';
    hijo.stdout?.on('data', (c) => {
      salida += c.toString();
    });
    hijo.stderr?.on('data', (c) => {
      salida += c.toString();
    });

    hijo.on('error', reject);
    hijo.on('exit', (code) => {
      if (code === 0) return resolve(salida);

      const err = new Error(`«${cmd}» falló con código ${code}`);
      err.salida = salida;
      reject(err);
    });
  });
}

/**
 * Un paso con spinner. Si falla, vuelca lo que el comando había escrito.
 *
 * Sin ese volcado el resumen sería una trampa: verías «✖ Clientes de Prisma» y
 * ni una pista de por qué, que es exactamente el problema que tenía la versión
 * anterior al tragarse los errores de las rutas mal.
 */
async function paso(cmd, etiqueta, { env } = {}) {
  if (VERBOSO) {
    console.log(gris(`  $ ${cmd}`));
    return ejecutar(cmd, env);
  }

  const sp = spinner(etiqueta);

  try {
    const salida = await ejecutar(cmd, env);
    sp.exito();
    return salida;
  } catch (err) {
    sp.fallo();
    console.log(gris(`    $ ${cmd}`));
    for (const linea of (err.salida ?? '').trimEnd().split('\n').slice(-15)) {
      console.log(rojo(`    ${linea}`));
    }
    throw err;
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Docker ──────────────────────────────────────────────────────────────────

export async function docker(accion) {
  if (accion === 'skip') return;

  if (accion === 'restart') {
    await paso(`docker compose -f ${DOCKER_COMPOSE_FILE} down`, 'Parando contenedores');
  }
  await paso(`docker compose -f ${DOCKER_COMPOSE_FILE} up -d`, 'Postgres y Redis');
}

/**
 * Espera a que Postgres acepte consultas, no solo a que el contenedor exista.
 *
 * `docker compose up -d` vuelve en cuanto el contenedor arranca, pero Postgres
 * tarda un par de segundos más en aceptar conexiones. Lanzar `prisma migrate`
 * en esa ventana falla con un error de conexión que parece de configuración y
 * no lo es.
 */
export async function esperarPostgres({ intentos = 30 } = {}) {
  const sp = spinner('Esperando a que Postgres acepte conexiones');

  for (let i = 0; i < intentos; i++) {
    try {
      await ejecutar('docker exec praxis_postgres pg_isready -U praxis');
      sp.exito('Postgres acepta conexiones');
      return true;
    } catch {
      await dormir(1000);
    }
  }

  sp.fallo('Postgres no respondió');
  return false;
}

// ── Paquetes compartidos ────────────────────────────────────────────────────

/**
 * Compila `contracts` y `observability`.
 *
 * ⚠️ Los **dos**. El CLI compilaba solo `contracts` y en un árbol limpio los
 * ocho servicios morían con `Cannot find module '@praxis/observability'`.
 */
export async function compilarCompartidos() {
  for (const pkg of SHARED_BUILD_PACKAGES) {
    await paso(`pnpm --filter ${pkg} run build`, `Compilando ${pkg.replace('@praxis/', '')}`);
  }
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
export async function prismaGenerate(servicios) {
  const conPrisma = servicios.filter((s) => s.prisma);

  for (const svc of conPrisma) {
    await paso(`pnpm --filter ${svc.pkg} exec prisma generate`, `Cliente Prisma · ${svc.key}`);
  }
}

/**
 * Recrea las tablas.
 *
 * `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` va puesto porque Prisma bloquea
 * `migrate reset` cuando cree que lo pide un agente. Aquí lo ha pedido una
 * persona, por un menú que ya avisó de que borra los datos.
 */
export async function prismaReset(servicios) {
  const conPrisma = servicios.filter((s) => s.prisma);
  const env = { ...process.env, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: '1' };

  for (const svc of conPrisma) {
    await paso(
      `pnpm --filter ${svc.pkg} exec prisma migrate reset --force --skip-seed`,
      `Recreando tablas · ${svc.key}`,
      { env },
    );
  }
}

/**
 * Siembra **en orden**.
 *
 * ⚠️ El orden no es un detalle: permissions antes que credentials, y projects
 * antes que tasks. La versión anterior sembraba en el orden en que estuvieran
 * los servicios en el menú, que es el orden en que el usuario marcó las
 * casillas. Con suerte funcionaba.
 */
export async function prismaSeed(servicios) {
  const conSeed = servicios
    .filter((s) => s.seedOrder !== null && s.seedOrder !== undefined)
    .sort((a, b) => a.seedOrder - b.seedOrder);

  if (conSeed.length === 0) return;

  console.log(gris(`  Orden: ${conSeed.map((s) => s.key).join(' → ')}`));
  for (const svc of conSeed) {
    await paso(`pnpm --filter ${svc.pkg} run prisma:seed`, `Sembrando · ${svc.key}`);
  }
}

// ── Archivos de entorno ─────────────────────────────────────────────────────

function leerEnv(contenido) {
  const mapa = new Map();

  for (const bruta of contenido.split('\n')) {
    const linea = bruta.trim();
    if (!linea || linea.startsWith('#')) continue;

    const igual = linea.indexOf('=');
    if (igual === -1) continue;

    mapa.set(
      linea.slice(0, igual).trim(),
      linea
        .slice(igual + 1)
        .trim()
        .replace(/^["']|["']$/g, ''),
    );
  }

  return mapa;
}

const escribirEnv = (mapa) => `${[...mapa.entries()].map(([k, v]) => `${k}=${v}`).join('\n')}\n`;

/**
 * Lee de un `.env.example` y de su destino qué servicios declaran una clave y
 * qué valor tienen puesto ahora mismo.
 */
function declarantesDe(clave, servicios) {
  const encontrados = [];

  for (const svc of servicios) {
    const dir = path.join(ROOT, svc.dir);
    const ejemploPath = path.join(dir, '.env.example');
    if (!fs.existsSync(ejemploPath)) continue;

    const ejemplo = leerEnv(fs.readFileSync(ejemploPath, 'utf8'));
    if (!ejemplo.has(clave)) continue;

    const destino = path.join(dir, svc.envFile ?? '.env');
    const actual = fs.existsSync(destino) ? leerEnv(fs.readFileSync(destino, 'utf8')) : new Map();

    encontrados.push({ svc, destino, valor: actual.get(clave) || null });
  }

  return encontrados;
}

/** El valor que propone el `.env.example` del primero que declare la clave. */
function plantillaDe(clave, declarantes) {
  for (const { svc } of declarantes) {
    const ejemploPath = path.join(ROOT, svc.dir, '.env.example');
    if (!fs.existsSync(ejemploPath)) continue;
    const ejemplo = leerEnv(fs.readFileSync(ejemploPath, 'utf8'));
    if (ejemplo.has(clave)) return ejemplo.get(clave);
  }
  return '';
}

/** `a1b2c3d4…` — lo justo para distinguir dos secretos sin escupirlos enteros. */
const resumir = (valor) => (valor.length > 12 ? `${valor.slice(0, 8)}…(${valor.length})` : valor);

/**
 * Resuelve **una sola vez** cada clave que tiene que valer lo mismo en todos los
 * servicios, antes de tocar ningún archivo.
 *
 * ## Qué arreglaba esto
 *
 * `JWT_SECRET` está declarado en diez archivos de entorno —gateway, credentials
 * y las ocho zonas— y `SENSITIVE_KEY_RE` lo casa, así que el asistente lo
 * preguntaba **diez veces seguidas**, con el mismo enunciado, sin valor por
 * defecto y sin decir en ningún momento que las diez respuestas tenían que
 * coincidir. Teclear uno distinto en una sola zona no da ningún error: esa zona
 * no puede verificar la cookie, trata la sesión como anónima y redirige al login
 * para siempre. Se diagnostica comparando diez archivos a mano.
 *
 * ## Los tres casos
 *
 * 1. **Nadie lo tiene** — clon nuevo. Se pregunta una vez, con un secreto
 *    generado como valor por defecto: pulsar Enter es la respuesta correcta.
 * 2. **Todos coinciden** — se reutiliza en silencio para los que falten. No hay
 *    nada que preguntar, y preguntarlo invitaría a romperlo.
 * 3. **Divergen** — es el fallo, y ya está puesto. Se dice quién tiene qué y se
 *    ofrece unificar; es el único caso en el que este paso **reescribe** un
 *    valor que ya existía, y por eso se confirma.
 */
export async function resolverClavesCompartidas(servicios) {
  const resueltos = new Map();

  for (const { clave, generar } of SHARED_KEYS) {
    const declarantes = declarantesDe(clave, servicios);
    if (declarantes.length === 0) continue;

    const distintos = [...new Set(declarantes.map((d) => d.valor).filter(Boolean))];
    const sinValor = declarantes.filter((d) => !d.valor);

    // ── 1. Clon nuevo: nadie lo tiene ───────────────────────────────────────
    if (distintos.length === 0) {
      console.log(
        `\n  ${azul(clave)} ${gris(`· lo comparten ${declarantes.length} servicios y debe ser el mismo en todos`)}`,
      );
      /* Un secreto se propone generado —pulsar Enter es la respuesta correcta—.
         Lo que no lo es se propone con lo que diga la plantilla, y puede quedar
         vacío a propósito: es lo que apaga esa función. */
      const porDefecto = generar ? generar() : plantillaDe(clave, declarantes);

      const { valor } = await inquirer.prompt([
        {
          type: 'input',
          name: 'valor',
          message: `    ${clave}${generar ? gris(' (Enter = generado)') : ''}`,
          default: porDefecto,
          validate: (v) => (!generar || v.trim().length > 0 ? true : 'No puede quedar vacío'),
        },
      ]);
      resueltos.set(clave, valor.trim());
      continue;
    }

    // ── 2. Ya está y todos coinciden ────────────────────────────────────────
    if (distintos.length === 1) {
      resueltos.set(clave, distintos[0]);
      if (sinValor.length > 0) {
        ok(
          `${clave} · reutilizando el valor que ya existe para ${sinValor.length} servicio(s) que no lo tenían`,
        );
      }
      continue;
    }

    // ── 3. Divergen: el fallo silencioso, ya presente ───────────────────────
    aviso(`${clave} NO coincide entre servicios — la sesión no funcionará en todas las zonas`);
    for (const valor of distintos) {
      const quienes = declarantes.filter((d) => d.valor === valor).map((d) => d.svc.key);
      console.log(gris(`    ${resumir(valor)}  →  ${quienes.join(', ')}`));
    }

    const { elegido } = await inquirer.prompt([
      {
        type: 'select',
        name: 'elegido',
        message: `    ¿Con cuál se quedan todos?`,
        choices: [
          ...distintos.map((valor) => ({
            name: `${resumir(valor)} ${gris(`(${declarantes.filter((d) => d.valor === valor).length} servicios)`)}`,
            value: valor,
          })),
          { name: gris('generar uno nuevo'), value: '__nuevo__' },
          { name: gris('dejarlo como está — sé lo que hago'), value: '__nada__' },
        ],
      },
    ]);

    if (elegido === '__nada__') continue;

    const valor = elegido === '__nuevo__' ? generarSecreto() : elegido;
    resueltos.set(clave, valor);

    /* Reescribir un valor que ya existía es lo único destructivo de todo este
       paso: solo se hace tras responder a la pregunta de arriba, y solo sobre
       los archivos que discrepan. */
    for (const { destino, valor: actualValor } of declarantes) {
      if (actualValor === valor || !fs.existsSync(destino)) continue;
      const contenido = leerEnv(fs.readFileSync(destino, 'utf8'));
      contenido.set(clave, valor);
      fs.writeFileSync(destino, escribirEnv(contenido));
    }

    ok(`${clave} unificado en ${declarantes.length} servicios`);
  }

  return resueltos;
}

/**
 * Completa el archivo de entorno de un servicio desde su `.env.example`.
 *
 * ⚠️ El nombre del archivo sale de `svc.envFile`, que en el frontend es
 * **`.env.local`**. Next no lee `.env` en desarrollo, así que rellenar ese
 * archivo era escribir uno que nadie abre; el síntoma llegaba mucho después,
 * como un `GATEWAY_URL` undefined en la primera petición.
 */
export async function completarEnv(svc, compartidas = new Map()) {
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

  console.log(
    `\n  ${azul(svc.key)} ${gris(`· faltan ${faltan.length} variable(s) en ${svc.envFile ?? '.env'}`)}`,
  );

  for (const clave of faltan) {
    const porDefecto = ejemplo.get(clave);

    /* Ya se preguntó una sola vez para todos, arriba. Volver a preguntarla aquí
       es lo que dejaba diez JWT_SECRET distintos. */
    if (compartidas.has(clave)) {
      actual.set(clave, compartidas.get(clave));
    } else if (SENSITIVE_KEY_RE.test(clave) || ALWAYS_ASK_KEYS.has(clave)) {
      /* Un secreto propio se propone generado. Ofrecerlo vacío es lo que empuja
         a pegar el que ya tienes a mano — ver `GENERAR_SI_VACIO`. */
      const generar = !porDefecto && GENERAR_SI_VACIO.get(clave);
      const sugerido = generar ? generar() : porDefecto;

      const { valor } = await inquirer.prompt([
        {
          type: 'input',
          name: 'valor',
          message: `    ${clave}${generar ? gris(' (Enter = generado)') : ''}`,
          default: sugerido,
        },
      ]);
      actual.set(clave, valor);
    } else {
      actual.set(clave, porDefecto);
    }
  }

  fs.writeFileSync(destino, escribirEnv(actual));
  return { key: svc.key, estado: 'completado', anadidas: faltan.length };
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
    console.log(
      gris('  Van a arrancar y morir. Responde que sí a «completar .env» o créalos a mano.'),
    );
  }

  return sinEnv;
}
