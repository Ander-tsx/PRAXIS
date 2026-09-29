import type { WritePacket } from '@nestjs/microservices';

/** Lo que el bus necesita de un servidor: atender un mensaje y responder. */
export interface Receptor {
  atender(pattern: string, data: unknown, respond: (packet: WritePacket) => void): Promise<void>;
}

/**
 * El registro de servidores del proceso, por nombre de servicio.
 *
 * Vive en `globalThis` y no en una variable del módulo: si pnpm llegara a
 * resolver dos copias de este paquete —ya pasó con NestJS—, cada una tendría su
 * propio `Map` y los clientes de una no verían a los servidores de la otra. El
 * síntoma sería «servicio no registrado» con el servicio arrancado.
 */
const CLAVE = Symbol.for('praxis.local-transport.bus');

type ConBus = typeof globalThis & { [CLAVE]?: Map<string, Receptor> };

function registro(): Map<string, Receptor> {
  const g = globalThis as ConBus;
  g[CLAVE] ??= new Map();
  return g[CLAVE];
}

export function registrar(servicio: string, receptor: Receptor): void {
  const actual = registro().get(servicio);
  if (actual && actual !== receptor) {
    throw new Error(`El servicio «${servicio}» ya está registrado en este proceso.`);
  }
  registro().set(servicio, receptor);
}

export function retirar(servicio: string, receptor: Receptor): void {
  if (registro().get(servicio) === receptor) registro().delete(servicio);
}

export function buscar(servicio: string): Receptor | undefined {
  return registro().get(servicio);
}
