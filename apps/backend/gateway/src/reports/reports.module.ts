import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { ReportsController } from './reports.controller';

/**
 * ⚠️ Registra **tres** clientes y solo usa uno.
 *
 * `REPORTS_SERVICE` es el que consume el controlador. Los otros dos los necesita
 * `ProjectPermissionGuard`, que se aplica aquí y los inyecta por su cuenta: sin
 * ellos en el módulo, Nest no puede construir el guard y el fallo aparece al
 * arrancar, no al llamar a la ruta.
 */
@Module({
  imports: [
    AuthModule,
    ClientsModule.registerAsync([
      {
        name: 'REPORTS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('REPORTS_SERVICE_HOST'),
            port: config.get<number>('REPORTS_SERVICE_PORT'),
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
  controllers: [ReportsController],
})
export class ReportsModule {}
