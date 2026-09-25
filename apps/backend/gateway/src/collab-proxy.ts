import type { IncomingMessage, Server } from 'node:http';
import { connect } from 'node:net';
import type { Duplex } from 'node:stream';

/** Ruta pública del tiempo real de los documentos, bajo el prefijo `/api`. */
export const RUTA_COLLAB = '/api/collab';

/**
 * Reenvía los WebSocket de `/api/collab` a `collab-service` (E3 de
 * `docs/PLAN-DOCUMENTOS.md`).
 *
 * Collab escucha en `127.0.0.1:3010`, dentro del contenedor del backend, y
 * el único puerto que sale de él es el 3000 del gateway. En Railway el `api`
 * ni siquiera tiene dominio público: el navegador entra por `web`
 * (`wss://<web>/api/collab`, ver `apps/frontend/web/server.mjs`), que lo
 * reenvía aquí por la red privada. En local se conecta aquí directo.
 *
 * El reenvío es a nivel de socket —la petición de `upgrade` tal cual y luego
 * los bytes en las dos direcciones—, sin librería: no hay nada que entender del
 * protocolo, solo que pase. La autenticación la hace collab con su billete.
 */
export function montarProxyDeCollab(servidor: Server, host: string, puerto: number): void {
  servidor.on('upgrade', (peticion: IncomingMessage, cliente: Duplex, cabeza: Buffer) => {
    if (!peticion.url?.startsWith(RUTA_COLLAB)) return;

    const destino = connect(puerto, host, () => {
      const lineas = [`${peticion.method} ${peticion.url} HTTP/${peticion.httpVersion}`];
      for (let i = 0; i < peticion.rawHeaders.length; i += 2) {
        lineas.push(`${peticion.rawHeaders[i]}: ${peticion.rawHeaders[i + 1]}`);
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
}
