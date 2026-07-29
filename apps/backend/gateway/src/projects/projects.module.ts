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
  providers: [TaskPurgeService],
})
export class ProjectsModule {}
