import { DynamicModule, Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { createPinoConfig, LoggerOptions } from './pino.config';
import { ensureLogDirs } from './ensure-log-dirs';

/**
 * Módulo global de observabilidad que configura el logger de Pino.
 *
 * Cada servicio debe registrar el módulo con su nombre para que los logs
 * se escriban en la carpeta correcta:
 *
 * ```ts
 * ObservabilityModule.forRoot({ serviceName: 'credentials' })
 * ```
 *
 * Esto crea la estructura `logs/credentials/` con archivos separados
 * por nivel (debug.log, info.log, warn.log, error.log).
 */
@Global()
@Module({})
export class ObservabilityModule {
  static forRoot(options: LoggerOptions): DynamicModule {
    // Crear las carpetas de logs al registrar el módulo
    ensureLogDirs(options.serviceName);

    const pinoConfig = createPinoConfig(options);

    return {
      module: ObservabilityModule,
      imports: [LoggerModule.forRoot(pinoConfig)],
      exports: [LoggerModule],
      global: true,
    };
  }
}
