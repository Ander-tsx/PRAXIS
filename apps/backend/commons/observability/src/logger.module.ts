import { DynamicModule, Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { createPinoConfig } from './pino.config';

/**
 * Módulo global de observabilidad.
 *
 * Uso en cada servicio:
 *   ObservabilityModule.register('gateway')
 *   ObservabilityModule.register('credentials-service')
 *
 * El nombre del servicio define la subcarpeta de logs:
 *   logs/gateway/
 *   logs/credentials-service/
 */
@Global()
@Module({})
export class ObservabilityModule {
  static register(serviceName: string): DynamicModule {
    return {
      module: ObservabilityModule,
      imports: [LoggerModule.forRoot(createPinoConfig(serviceName))],
      exports: [LoggerModule],
    };
  }
}
