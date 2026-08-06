import net from 'node:net';

/**
 * Estado de los puertos, que es lo que de verdad se quiere saber.
 *
 * «¿Arrancó?» no se responde mirando si el proceso sigue vivo: `nest start`
 * sigue vivo mientras compila, y también sigue vivo cuando ha fallado al
 * conectar con Postgres y está reintentando. Lo único que significa «ya puedes
 * usarlo» es que alguien acepta conexiones en su puerto.
 */

/** ¿Hay algo escuchando? Una conexión TCP que abre y se cierra. */
export function puertoOcupado(puerto, host = '127.0.0.1', timeout = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resuelto = false;

    const terminar = (valor) => {
      if (resuelto) return;
      resuelto = true;
      socket.destroy();
      resolve(valor);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => terminar(true));
    socket.once('timeout', () => terminar(false));
    socket.once('error', () => terminar(false));
    socket.connect(puerto, host);
  });
}

/** Varios a la vez. Devuelve un Map puerto → booleano. */
export async function estadoDePuertos(puertos) {
  const resultados = await Promise.all(puertos.map(async (p) => [p, await puertoOcupado(p)]));
  return new Map(resultados);
}

/**
 * Espera a que un puerto empiece a responder.
 *
 * Devuelve los milisegundos que tardó, o `null` si se agotó el plazo. El plazo
 * por defecto es generoso porque la primera compilación de Next con Turbopack
 * y la de ocho servicios de Nest a la vez tardan de verdad en una máquina
 * cargada; quedarse corto aquí sería declarar un fallo que no existe.
 */
export async function esperarPuerto(puerto, { timeoutMs = 90_000, intervaloMs = 400 } = {}) {
  const arranque = Date.now();

  while (Date.now() - arranque < timeoutMs) {
    if (await puertoOcupado(puerto, '127.0.0.1', 300)) return Date.now() - arranque;
    await new Promise((r) => setTimeout(r, intervaloMs));
  }

  return null;
}

/**
 * Quién ocupa un puerto, para poder decirlo en vez de solo constatar el choque.
 *
 * `lsof` solo existe en Unix y puede no estar; si no se puede averiguar se
 * devuelve `null` y quien llama se limita a avisar del choque. Preguntarlo es
 * un lujo, no un requisito.
 */
export async function quienOcupa(puerto) {
  const { execFile } = await import('node:child_process');

  return new Promise((resolve) => {
    execFile('lsof', ['-i', `tcp:${puerto}`, '-sTCP:LISTEN', '-Fcp'], (err, stdout) => {
      if (err || !stdout) return resolve(null);

      // Formato -F: líneas «p<pid>» y «c<comando>».
      const pid = stdout.match(/^p(\d+)/m)?.[1];
      const cmd = stdout.match(/^c(.+)$/m)?.[1];

      resolve(pid ? { pid, cmd: cmd ?? 'desconocido' } : null);
    });
  });
}
