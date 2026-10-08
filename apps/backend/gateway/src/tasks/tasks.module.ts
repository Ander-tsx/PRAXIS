import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { clienteDeServicio } from '@praxis/local-transport';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { AttachmentsController } from './attachments.controller';
import { ChecklistsController } from './checklists.controller';
import { CommentsController } from './comments.controller';
import { CustomFieldsController, TaskFieldValuesController } from './custom-fields.controller';
import { LabelsController } from './labels.controller';
import { MyTasksController } from './my-tasks.controller';
import { TaskDocumentsController } from './task-documents.controller';
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
    ClientsModule.registerAsync([clienteDeServicio('TASKS'), clienteDeServicio('PROJECTS')]),
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
    CustomFieldsController,
    TaskFieldValuesController,
    CommentsController,
    AttachmentsController,
    TaskDocumentsController,
  ],
})
export class TasksModule {}
