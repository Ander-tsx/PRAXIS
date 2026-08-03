import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config/index.mjs';
import { color, gris, pad, sinBorradoDePantalla } from './ui.mjs';

/** @type {Map<string, {child: import('node:child_process').ChildProcess, svc: object, detenidoAdrede: boolean}>} */
const procesos = new Map();

/**
 * Por dónde sale lo que escriben los servicios.
 *
 * Es inyectable porque **mientras el REPL está activo no se puede escribir a
 * `process.stdout` a pelo**: readline tiene una línea de prompt viva y cualquier
 * escritura por debajo la parte por la mitad, dejando el cursor y lo que
 * llevaras tecleado en sitios distintos. Con nueve servicios logueando, el
 * prompt se vuelve inusable.
 *
 * Antes del REPL basta con escribir directo; en cuanto arranca, `index.mjs`
 * instala aquí un escritor que limpia la línea, escribe y repinta el prompt.
 */
let escritor = (texto) => process.stdout.write(texto);

export const usarEscritor = (fn) => {
  escritor = fn;
};

export const estaCorriendo = (key) => procesos.has(key);

/**
 * El comando con el que se arranca cada cosa.
 *
 * ⚠️ **No se le quita el `--watch`.** La versión anterior lo recortaba para que
 * los reinicios los llevara el REPL, y el efecto era que editar un archivo no
 * recargaba nada: había que escribir `rs` a mano cada vez. El flujo normal del
 * repo (`turbo run dev`) sí recarga, así que quitarlo aquí convertía al CLI en
 * la opción peor. `rs` sigue existiendo para forzar un reinicio completo, que
 * es lo que hace falta después de recompilar `contracts`.
 */
export function comandoDeArranque(svc) {
  if (svc.startCommand) {
    return { cmd: svc.startCommand, cwd: path.join(ROOT, svc.dir) };
  }

  const pkgPath = path.join(ROOT, svc.dir, 'package.json');
  const tieneDev =
    fs.existsSync(pkgPath) && Boolean(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts?.dev);

  /* Se invoca por nombre de paquete y desde la raíz, no entrando al directorio:
     así pnpm resuelve los binarios del workspace igual que en el resto de
     comandos del README, y `nest` no acaba en «command not found». */
  if (!tieneDev) return { cmd: `pnpm --filter ${svc.pkg} run start`, cwd: ROOT };

  return { cmd: `pnpm --filter ${svc.pkg} run dev`, cwd: ROOT };
}

const etiqueta = (svc) => color(svc.color, pad(`[${svc.key}]`, 18));

/**
 * Reparte la salida del hijo línea a línea, con su etiqueta delante.
 *
 * El buffer es necesario porque un `chunk` no viene partido por líneas: sin
 * esto, media línea de un servicio y media de otro acaban en el mismo renglón
 * con la etiqueta equivocada.
 */
function conectarSalida(stream, svc) {
  let buffer = '';

  stream.on('data', (chunk) => {
    buffer += sinBorradoDePantalla(chunk.toString());
    const lineas = buffer.split('\n');
    buffer = lineas.pop() ?? '';
    for (const linea of lineas) escritor(`${etiqueta(svc)}${linea}\n`);
  });

  /* Lo que quede sin salto final se escribe al cerrar, o se pierde: los errores
     de arranque de Nest a veces no acaban en '\n'. */
  stream.on('end', () => {
    if (buffer.trim()) escritor(`${etiqueta(svc)}${buffer}\n`);
    buffer = '';
  });
}

export function arrancar(svc, { onExit } = {}) {
  if (procesos.has(svc.key)) return;

  const { cmd, cwd } = comandoDeArranque(svc);

  const child = spawn(cmd, {
    cwd,
    shell: true,
    env: process.env,
    /* Grupo de procesos propio: `nest start` y `next dev` lanzan hijos, y
       matar solo al padre deja el puerto ocupado por un huérfano. Con esto se
       puede señalizar al grupo entero. */
    detached: true,
  });

  const registro = { child, svc, detenidoAdrede: false };
  procesos.set(svc.key, registro);

  conectarSalida(child.stdout, svc);
  conectarSalida(child.stderr, svc);

  child.on('exit', (code, signal) => {
    procesos.delete(svc.key);

    if (!registro.detenidoAdrede) {
      const motivo = signal ? `señal ${signal}` : `código ${code}`;
      escritor(`${etiqueta(svc)}${gris(`el proceso terminó (${motivo})`)}\n`);
    }

    onExit?.(code, signal);
  });

  child.on('error', (err) => {
    escritor(`${etiqueta(svc)}${color(31, `no se pudo arrancar: ${err.message}`)}\n`);
    procesos.delete(svc.key);
  });

  return child;
}

/**
 * Manda una señal al **grupo** del proceso, no solo al proceso.
 *
 * El negativo del pid es el grupo entero. Sin esto, `nest start` muere pero el
 * `node` que ha lanzado sigue con el puerto cogido, y el siguiente arranque
 * falla con EADDRINUSE señalando a un proceso que ya no aparece en la lista.
 */
function señalarGrupo(child, señal) {
  try {
    process.kill(-child.pid, señal);
  } catch {
    /* El grupo ya no existe, o la plataforma no lo permite: al proceso suelto. */
    try {
      child.kill(señal);
    } catch {
      /* Ya estaba muerto. */
    }
  }
}

/** Detiene un servicio y **espera** a que muera de verdad. */
export function detener(svc, { timeoutMs = 5000 } = {}) {
  const registro = procesos.get(svc.key);
  if (!registro) return Promise.resolve();

  registro.detenidoAdrede = true;

  return new Promise((resolve) => {
    /* Plan B: si no se ha ido por las buenas, SIGKILL. Sin esto, un servicio
       colgado deja el CLI esperando para siempre al salir. */
    const forzar = setTimeout(() => {
      señalarGrupo(registro.child, 'SIGKILL');
    }, timeoutMs);

    registro.child.once('exit', () => {
      clearTimeout(forzar);
      resolve();
    });

    señalarGrupo(registro.child, 'SIGTERM');
  });
}

/**
 * Reinicia esperando a que el anterior muera.
 *
 * ⚠️ La versión anterior hacía `child.kill()` y borraba la entrada del mapa en
 * el acto, así que `arrancar` encontraba el hueco libre y lanzaba el nuevo
 * proceso **mientras el viejo aún tenía el puerto**. El segundo moría con
 * EADDRINUSE y el REPL decía que estaba corriendo.
 */
export async function reiniciar(svc) {
  await detener(svc);
  arrancar(svc);
}

export async function detenerTodo() {
  await Promise.all([...procesos.values()].map((r) => detener(r.svc)));
}
