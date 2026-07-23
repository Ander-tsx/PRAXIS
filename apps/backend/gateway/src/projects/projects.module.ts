import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthModule } from '../auth/auth.module';
import { ProjectsController } from './projects.controller';
import { WorkspacesController } from './workspaces.controller';
import { BoardsController } from './boards.controller';
import { ColumnsController } from './columns.controller';
import { MembersController } from './members.controller';
import { ProjectRolesController } from './project-roles.controller';

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
    ]),
  ],
  controllers: [
    ProjectsController,
    WorkspacesController,
    BoardsController,
    ColumnsController,
    MembersController,
    ProjectRolesController,
  ],
})
export class ProjectsModule {}
