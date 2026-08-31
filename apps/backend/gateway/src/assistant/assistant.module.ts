import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { AssistantController } from './assistant.controller';
import { MyAssistantController } from './my-assistant.controller';

/**
 * ⚠️ Registra **cuatro** clientes y el controlador usa tres.
 *
 * `ASSISTANT_SERVICE` y `CREDENTIALS_SERVICE` los usa el controlador —el
 * segundo, solo para ponerle nombre a cada `userId`—. `PROJECTS_SERVICE` lo usa
 * el controlador *y* `ProjectPermissionGuard`; `TASKS_SERVICE` solo el guard,
 * que se aplica aquí y los inyecta por su cuenta. Sin los dos en el módulo,
 * Nest no puede construir el guard y el fallo aparece **al arrancar**, no al
 * llamar a la ruta. Mismo motivo que en `reports.module.ts`.
 */
@Module({
  imports: [
    AuthModule,
    /* Por `QuotaService`: el tope mensual de IA lo pone el plan, y el plan puede
       venir de la organización de una empresa — que assistant-service no ve. */
    BillingModule,
    ClientsModule.registerAsync([
      {
        name: 'ASSISTANT_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('ASSISTANT_SERVICE_HOST'),
            port: config.get<number>('ASSISTANT_SERVICE_PORT'),
          },
        }),
      },
      {
        name: 'CREDENTIALS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('CREDENTIALS_SERVICE_HOST'),
            port: config.get<number>('CREDENTIALS_SERVICE_PORT'),
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
  controllers: [AssistantController, MyAssistantController],
})
export class AssistantModule {}
