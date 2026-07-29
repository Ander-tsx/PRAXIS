import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { TasksController } from './tasks.controller';
import { ChecklistsController } from './checklists.controller';
import { MyTasksController } from './my-tasks.controller';
import { LabelsController } from './labels.controller';
import { CommentsController } from './comments.controller';

@Module({
  imports: [
    AuthModule,
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
  ],
})
export class TasksModule {}
