import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ProjectAutomationsController } from './project-automations.controller';

/**
 * Las reglas de un proyecto.
 *
 * ⚠️ **Importa `BillingModule` por `QuotaService`**, no por facturar nada: el
 * tope de automatizaciones activas es una cuota del plan y se comprueba donde
 * ocurre la escritura, que es aquí. Es el mismo motivo por el que lo importan
 * `ProjectsModule` y `AssistantModule`.
 */
@Module({
  imports: [
    AuthModule,
    BillingModule,
    ClientsModule.registerAsync([
      {
        name: 'AUTOMATION_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('AUTOMATION_SERVICE_HOST'),
            port: config.get<number>('AUTOMATION_SERVICE_PORT'),
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
            host: config.get<string>('PROJECTS_SERVICE_HOST'),
            port: config.get<number>('PROJECTS_SERVICE_PORT'),
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
            host: config.get<string>('TASKS_SERVICE_HOST'),
            port: config.get<number>('TASKS_SERVICE_PORT'),
          },
        }),
      },
    ]),
  ],
  controllers: [ProjectAutomationsController],
})
export class AutomationModule {}
