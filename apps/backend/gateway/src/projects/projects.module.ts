import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { ProjectsController } from './projects.controller';
import { WorkspacesController, WorkspacesResourceController } from './workspaces.controller';
import { BoardsController, BoardsResourceController } from './boards.controller';
import { ColumnsController } from './columns.controller';
import { MembersController } from './members.controller';
import { ProjectRolesController } from './project-roles.controller';
import { ProjectPermissionsController } from './project-permissions.controller';
import {
  MyInvitationsController,
  ProjectInvitationsController,
  ProjectMembershipController,
} from './invitations.controller';
import { ColumnStatusSyncService } from './column-status-sync.service';
import { TaskPurgeService } from './task-purge.service';


@Module({
  imports: [
    AuthModule,
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
    ]),
  ],
  controllers: [
    ProjectsController,
    WorkspacesController,
    WorkspacesResourceController,
    BoardsController,
    BoardsResourceController,
    ColumnsController,
    MembersController,
    ProjectRolesController,
    ProjectPermissionsController,
    ProjectInvitationsController,
    MyInvitationsController,
    ProjectMembershipController,
  ],
  providers: [ColumnStatusSyncService, TaskPurgeService],
})
export class ProjectsModule {}
