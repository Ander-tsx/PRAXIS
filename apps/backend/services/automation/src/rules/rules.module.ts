import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AutomationEngineService } from '../executions/direct-execution';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'PROJECTS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get('PROJECTS_SERVICE_HOST'),
            port: config.get('PROJECTS_SERVICE_PORT'),
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
            host: config.get('TASKS_SERVICE_HOST'),
            port: config.get('TASKS_SERVICE_PORT'),
          },
        }),
      },
    ]),
  ],
  controllers: [RulesController],
  providers: [RulesService, AutomationEngineService],
  /* El consumidor de eventos necesita el motor: es lo que conecta el flujo de
     hechos con las reglas. Los clientes TCP se exportan con él porque el motor
     los tiene inyectados. */
  exports: [AutomationEngineService],
})
export class RulesModule {}
