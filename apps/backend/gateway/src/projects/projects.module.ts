import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { clienteDeServicio } from '@praxis/local-transport';
import { AuthModule } from '../auth/auth.module';
import { OptionalJwtGuard } from '../auth/optional-jwt.guard';
import { BillingModule } from '../billing/billing.module';
import { AutomationPurgeService } from './automation-purge.service';
import { BoardsController, BoardsResourceController } from './boards.controller';
import { ColumnStatusSyncService } from './column-status-sync.service';
import { ColumnsController } from './columns.controller';
import { DirectChatController } from './direct-chat.controller';
import { DocumentAccessService } from './document-access.service';
import { DocumentsController } from './documents.controller';
import {
  MyInvitationsController,
  ProjectInvitationsController,
  ProjectMembershipController,
} from './invitations.controller';
import { LinkPreviewController } from './link-preview.controller';
import { MembersController } from './members.controller';
import { MentionablesService } from './mentionables.service';
import { ProjectChatController } from './project-chat.controller';
import { ProjectPermissionsController } from './project-permissions.controller';
import { ProjectRolesController } from './project-roles.controller';
import { ProjectsController } from './projects.controller';
import {
  MySharedDocumentsController,
  SharedDocumentsController,
} from './shared-documents.controller';
import { SprintsController } from './sprints.controller';
import { AssistantModule } from '../assistant/assistant.module';
import { NombreDeAutorService } from './nombre-de-autor.service';
import { OrigenDeMensajeService } from './origen-de-mensaje.service';
import { TaskPurgeService } from './task-purge.service';
import { WorkspacesController, WorkspacesResourceController } from './workspaces.controller';

import { GlobalRolesModule } from '../common/global-roles/global-roles.module';

@Module({
  imports: [
    AuthModule,
    GlobalRolesModule,
    /* Por `QuotaService`: los topes del plan se comprueban donde ocurre la
       escritura —crear proyecto, meter gente— y no en el módulo de facturación,
       que no ve pasar ninguna de las dos. */
    BillingModule,
    /* Por `PraxEnElChatService`: @PRAX en el chat del grupo (F10). */
    AssistantModule,
    ClientsModule.registerAsync([
      clienteDeServicio('PROJECTS'),
      clienteDeServicio('TASKS'),
      /* Solo para la purga: al borrar un proyecto hay que llevarse también sus
         conversaciones del asistente, que viven en otro servicio y sin clave
         foránea. Ver `TaskPurgeService`. */
      clienteDeServicio('ASSISTANT'),
      clienteDeServicio('AUTOMATION'),
      /* Solo para ponerle nombre a quien escribe en el chat (push). */
      clienteDeServicio('CREDENTIALS'),
    ]),
  ],
  controllers: [
    ProjectsController,
    WorkspacesController,
    WorkspacesResourceController,
    BoardsController,
    BoardsResourceController,
    ColumnsController,
    SprintsController,
    DocumentsController,
    SharedDocumentsController,
    MySharedDocumentsController,
    LinkPreviewController,
    MembersController,
    ProjectRolesController,
    ProjectPermissionsController,
    ProjectInvitationsController,
    MyInvitationsController,
    ProjectMembershipController,
    ProjectChatController,
    DirectChatController,
  ],
  providers: [
    ColumnStatusSyncService,
    TaskPurgeService,
    AutomationPurgeService,
    MentionablesService,
    DocumentAccessService,
    OrigenDeMensajeService,
    NombreDeAutorService,
    OptionalJwtGuard,
  ],
  /**
   * ⚠️ **Las dos purgas se exportan porque administración también borra.**
   *
   * Borrar un proyecto tiene que arrastrar sus tareas y sus reglas, que viven en
   * otros microservicios y no las alcanza ningún cascade. Eso lo sabían estos
   * dos servicios y solo los veía este módulo, así que `AdminModule` los
   * inyectaba y Nest no arrancaba —«Nest can't resolve dependencies»— con un
   * volcado que nombra la clase pero no dice que le falta el `exports`.
   *
   * Se exportan en vez de copiarse: dos sitios que purgan es un sitio que
   * olvidar cuando aparezca un tercer servicio con datos de proyecto.
   */
  exports: [TaskPurgeService, AutomationPurgeService],
})
export class ProjectsModule {}
