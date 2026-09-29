import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  type ClientOptions,
  type ClientsProviderAsyncOptions,
  type CustomClientOptions,
  Transport,
} from '@nestjs/microservices';
import { LocalClient } from './local.client';
import { transporteDelProceso } from './transporte';

/**
 * Los servicios a los que se puede llamar, con su puerto TCP por defecto.
 *
 * ⚠️ `permissions` es 3002 y `projects` es 3003, no al revés. Invertirlos no da
 * un error claro: el que llama le habla al que no es y la respuesta sale vacía.
 */
export const PUERTOS = {
  CREDENTIALS: 3001,
  PERMISSIONS: 3002,
  PROJECTS: 3003,
  TASKS: 3004,
  REPORTS: 3005,
  ASSISTANT: 3006,
  AUTOMATION: 3008,
  BILLING: 3009,
} as const;

export type ServicioPraxis = keyof typeof PUERTOS;

/** El nombre con el que se registra cada servicio en el bus del proceso. */
export function nombreLocal(servicio: ServicioPraxis): string {
  return servicio.toLowerCase();
}

/**
 * Las opciones de cliente hacia un servicio, en el transporte del proceso.
 *
 * Sustituye a los `{ transport: Transport.TCP, options: { host, port } }`
 * escritos a mano en cada módulo. Con TCP, host y puerto salen de
 * `<SERVICIO>_SERVICE_HOST/PORT` como siempre.
 */
export function opcionesDeCliente(
  servicio: ServicioPraxis,
  config?: Pick<ConfigService, 'get'>,
): ClientOptions {
  if (transporteDelProceso() === 'local') {
    const local: CustomClientOptions = {
      customClass: LocalClient,
      options: { servicio: nombreLocal(servicio) },
    };
    return local;
  }
  const leer = (clave: string) => config?.get(clave) ?? process.env[clave];
  return {
    transport: Transport.TCP,
    options: {
      host: leer(`${servicio}_SERVICE_HOST`) ?? 'localhost',
      port: Number(leer(`${servicio}_SERVICE_PORT`) ?? PUERTOS[servicio]),
    },
  };
}

/**
 * La entrada de `ClientsModule.registerAsync` para un servicio, con el token de
 * siempre (`PROJECTS_SERVICE`, `TASKS_SERVICE`…).
 */
export function clienteDeServicio(servicio: ServicioPraxis): ClientsProviderAsyncOptions {
  return {
    name: `${servicio}_SERVICE`,
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => opcionesDeCliente(servicio, config),
  };
}
