/**
 * El servidor de producción de `web`: Next tal cual, más el WebSocket del
 * tiempo real de los documentos (docs/PLAN-DOCUMENTOS.md, E3).
 *
 * En Railway **el `api` no tiene dominio público**: solo `web` sale a internet
 * (usepraxis.space) y habla con el gateway por la red privada
 * (`GATEWAY_URL`). El proxy `/api/gateway` de Next no sirve para un
 * WebSocket —un route handler no puede hacer `upgrade`—, así que este servidor
 * lo reenvía él: `wss://<web>/api/collab` → gateway → collab. Mismo origen para
 * el navegador, y el `api` sigue sin abrirse a internet.
 *
 * Solo en producción (lo arranca `frontend.pm2.config.cjs`). En desarrollo el
 * navegador conecta directo al gateway (`ws://localhost:3000/api/collab`).
 */
import { createServer } from 'node:http';
import { connect } from 'node:net';
import next from 'next';

const puerto = Number(process.env.PORT ?? 4100);
const gateway = new URL(process.env.GATEWAY_URL ?? 'http://127.0.0.1:3000');
const RUTA_COLLAB = '/api/collab';

const app = next({ dev: false, hostname: '0.0.0.0', port: puerto });
const atender = app.getRequestHandler();
await app.prepare();

const servidor = createServer((peticion, respuesta) => atender(peticion, respuesta));

servidor.on('upgrade', (peticion, cliente, cabeza) => {
  /* En producción Next no usa WebSocket (el suyo es el del recargado en
     caliente, que solo existe en desarrollo): lo que no sea collab, fuera. */
  if (!peticion.url?.startsWith(RUTA_COLLAB)) {
    cliente.destroy();
    return;
  }
  const destino = connect(Number(gateway.port || 80), gateway.hostname, () => {
    const lineas = [`${peticion.method} ${peticion.url} HTTP/${peticion.httpVersion}`];
    for (let i = 0; i < peticion.rawHeaders.length; i += 2) {
      const nombre = peticion.rawHeaders[i];
      /* El `Host` del gateway, no el público: si no, el gateway ve un host
         que no es el suyo. */
      const valor = nombre.toLowerCase() === 'host' ? gateway.host : peticion.rawHeaders[i + 1];
      lineas.push(`${nombre}: ${valor}`);
    }
    destino.write(`${lineas.join('\r\n')}\r\n\r\n`);
    if (cabeza.length > 0) destino.write(cabeza);
    cliente.pipe(destino).pipe(cliente);
  });
  const cerrar = () => {
    cliente.destroy();
    destino.destroy();
  };
  destino.on('error', cerrar);
  cliente.on('error', cerrar);
  destino.on('close', () => cliente.destroy());
  cliente.on('close', () => destino.destroy());
});

servidor.listen(puerto, '0.0.0.0', () => {
  console.log(
    `> web en http://0.0.0.0:${puerto} (tiempo real en ${RUTA_COLLAB} → ${gateway.host})`,
  );
});
