import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { VoiceConfigService } from '../common/voice-config.service';
import { PraxisDataService } from './praxis-data.service';

/**
 * Proxies TCP hacia los servicios dueños de los datos.
 * alexa-service solo lee: nunca envía comandos de escritura a estos servicios.
 */
@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'CREDENTIALS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('CREDENTIALS_SERVICE_HOST', 'localhost'),
            port: config.get<number>('CREDENTIALS_SERVICE_PORT', 3001),
          },
        }),
      },
      {
        name: 'PROJECTS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('PROJECTS_SERVICE_HOST', 'localhost'),
            port: config.get<number>('PROJECTS_SERVICE_PORT', 3003),
          },
        }),
      },
      {
        name: 'TASKS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('TASKS_SERVICE_HOST', 'localhost'),
            port: config.get<number>('TASKS_SERVICE_PORT', 3004),
          },
        }),
      },
    ]),
  ],
  providers: [PraxisDataService, VoiceConfigService],
  exports: [PraxisDataService, VoiceConfigService, ClientsModule],
})
export class ClientsProxyModule {}
