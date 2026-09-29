import { ClientProxy, type ReadPacket, type WritePacket } from '@nestjs/microservices';
import { marcarActividad } from './actividad';
import { buscar } from './bus';
import { copiaJson } from './json';

export interface LocalClientOptions {
  /** El nombre con el que se registró el `LocalServer` de destino. */
  servicio: string;
}

/**
 * El lado que pide: sustituye a `ClientTCP` cuando los servicios comparten
 * proceso.
 *
 * Tres cosas que tienen que ser como en TCP y no «mejor»:
 *
 * - **El paquete se copia por JSON antes de salir.** Si no, quien responde
 *   recibiría el mismo objeto que tiene quien pide, y cualquiera de los dos
 *   podría cambiárselo al otro.
 * - **El patrón llega como cadena JSON**, que es lo que ve `ServerTCP` tras
 *   deserializar, y es lo que sabe buscar `getHandlerByPattern`.
 * - **Nunca se entrega de forma síncrona.** Un `send()` que respondiera en el
 *   mismo tick cambiaría el orden de cosas que hoy dependen, sin saberlo, de
 *   que haya un salto de red en medio.
 */
export class LocalClient extends ClientProxy {
  private readonly servicio: string;

  constructor(options: LocalClientOptions) {
    super();
    this.servicio = options.servicio;
  }

  async connect(): Promise<void> {}

  close(): void {}

  unwrap<T>(): T {
    throw new Error('El transporte en proceso no envuelve ningún cliente.');
  }

  protected publish(packet: ReadPacket, callback: (packet: WritePacket) => void): () => void {
    /* Cada mensaje entre servicios es uso real del sistema: es lo que mantiene
       despiertas las tareas de fondo (ver actividad.ts). */
    marcarActividad();
    let cancelado = false;
    const alResponder = (respuesta: WritePacket) => {
      if (!cancelado) callback(respuesta);
    };

    let salida: ReadPacket;
    try {
      salida = copiaJson(packet);
    } catch (error) {
      /* Lo mismo que rompería el socket: un `BigInt` o una referencia circular. */
      setImmediate(() => alResponder({ err: error, isDisposed: true }));
      return () => {
        cancelado = true;
      };
    }

    const pattern =
      typeof salida.pattern === 'string' ? salida.pattern : JSON.stringify(salida.pattern);

    setImmediate(() => {
      if (cancelado) return;
      const receptor = buscar(this.servicio);
      if (!receptor) {
        alResponder({
          err: {
            status: 'error',
            message: `El servicio «${this.servicio}» no está registrado en este proceso.`,
          },
          isDisposed: true,
        });
        return;
      }
      void receptor.atender(pattern, salida.data, alResponder);
    });

    return () => {
      cancelado = true;
    };
  }

  /** Nadie emite eventos entre servicios (0 `@EventPattern`). Si alguien empieza, que falle alto. */
  protected dispatchEvent<T = unknown>(): Promise<T> {
    return Promise.reject(
      new Error('El transporte en proceso no admite eventos: usa send(), no emit().'),
    );
  }
}
