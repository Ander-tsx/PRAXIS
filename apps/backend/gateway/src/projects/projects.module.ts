import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { AutomationPurgeService } from './automation-purge.service';
import { BoardsController, BoardsResourceController } from './boards.controller';
import { ColumnStatusSyncService } from './column-status-sync.service';
import { ColumnsController } from './columns.controller';
import { DirectChatController } from './direct-chat.controller';
import {
  MyInvitationsController,
  ProjectInvitationsController,
  ProjectMembershipController,
} from './invitations.controller';
import { MembersController } from './members.controller';
import { MentionablesService } from './mentionables.service';
import { ProjectChatController } from './project-chat.controller';
import { ProjectPermissionsController } from './project-permissions.controller';
import { ProjectRolesController } from './project-roles.controller';
import { ProjectsController } from './projects.controller';
import { SprintsController } from './sprints.controller';
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
    ClientsModule.registerAsync([
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
      /* Solo para la purga: al borrar un proyecto hay que llevarse también sus
         conversaciones del asistente, que viven en otro servicio y sin clave
         foránea. Ver `TaskPurgeService`. */
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
