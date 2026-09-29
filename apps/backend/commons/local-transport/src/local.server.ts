import {
  BaseRpcContext,
  type CustomTransportStrategy,
  Server,
  type WritePacket,
} from '@nestjs/microservices';
import { NO_MESSAGE_HANDLER } from '@nestjs/microservices/constants';
import { type Receptor, registrar, retirar } from './bus';
import { copiaJson } from './json';

export const LOCAL_TRANSPORT_ID = Symbol.for('praxis.local-transport');

/**
 * El lado que atiende: sustituye a `ServerTCP` cuando los servicios comparten
 * proceso.
 *
 * Imita `ServerTCP.handleMessage` paso a paso —el mismo mensaje para un patrón
 * sin manejador, los mismos ganchos de procesamiento y, sobre todo, el mismo
 * `Server.send()` para responder—. Es `send()` quien convierte el `Observable`
 * del manejador en la secuencia `{ response }… { isDisposed }` o `{ err }`, y
 * quien entrega cada paquete en otra vuelta del bucle (`process.nextTick`). Al
 * reutilizarlo, un error lanzado en un servicio llega al gateway con la misma
 * forma que por el socket, y el filtro de excepciones lo lee igual.
 */
export class LocalServer extends Server implements CustomTransportStrategy, Receptor {
  constructor(private readonly servicio: string) {
    super();
    this.transportId = LOCAL_TRANSPORT_ID;
  }

  listen(callback: (...optionalParams: unknown[]) => unknown): void {
    registrar(this.servicio, this);
    callback();
  }

  close(): void {
    retirar(this.servicio, this);
  }

  on(): void {
    // Sin conexión, no hay eventos de estado que escuchar.
  }

  unwrap<T>(): T {
    throw new Error('El transporte en proceso no envuelve ningún servidor.');
  }

  async atender(
    pattern: string,
    data: unknown,
    respond: (packet: WritePacket) => void,
  ): Promise<void> {
    const contexto = new BaseRpcContext([pattern]);
    const handler = this.getHandlerByPattern(pattern);
    if (!handler) {
      respond({ err: NO_MESSAGE_HANDLER, isDisposed: true });
      return;
    }

    const responder = (packet: WritePacket) => {
      this.onProcessingEndHook?.(LOCAL_TRANSPORT_ID, contexto);
      respond(copiaJson(packet));
    };

    return this.onProcessingStartHook(LOCAL_TRANSPORT_ID, contexto, async () => {
      try {
        const response$ = this.transformToObservable(await handler(data, contexto));
        if (response$) this.send(response$, responder);
      } catch (error) {
        /* El manejador envuelto por Nest ya convierte las excepciones en un
           `Observable` que falla; esto solo cubre un fallo antes de llegar ahí.
           Por TCP ese caso ni siquiera respondería: aquí al menos no se cuelga. */
        responder({
          err: { status: 'error', message: (error as Error)?.message ?? String(error) },
          isDisposed: true,
        });
      }
    });
  }
}
