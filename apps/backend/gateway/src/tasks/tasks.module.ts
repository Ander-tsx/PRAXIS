import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { AttachmentsController } from './attachments.controller';
import { ChecklistsController } from './checklists.controller';
import { CommentsController } from './comments.controller';
import { LabelsController } from './labels.controller';
import { MyTasksController } from './my-tasks.controller';
import { TasksController } from './tasks.controller';

/**
 * Las tareas y todo lo que cuelga de una.
 *
 * ⚠️ **Importa `BillingModule` por `QuotaService`**: el almacén de adjuntos es
 * una cuota del plan y se comprueba donde ocurre la escritura, que es la subida
 * de `AttachmentsController`. Ver la cabecera de `QuotaService`.
 */
@Module({
  imports: [
    AuthModule,
    BillingModule,
    ClientsModule.registerAsync([
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
    ]),
  ],
  /**
   * `MyTasksController` va **antes** que `TasksController`: este declara
   * `@Get('tasks/:id')` sin prefijo de controlador, y aunque hoy no colisiona
   * con `me/tasks`, el orden deja claro cuál es la ruta más específica.
   */
  controllers: [
    MyTasksController,
    TasksController,
    ChecklistsController,
    LabelsController,
    CommentsController,
    AttachmentsController,
  ],
})
export class TasksModule {}
