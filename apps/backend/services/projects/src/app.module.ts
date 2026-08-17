import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { ObservabilityModule } from '@praxis/observability';
import { BoardsModule } from './boards/boards.module';
import { ChatModule } from './chat/chat.module';
import { ColumnsModule } from './columns/columns.module';
import { InvitationsModule } from './invitations/invitations.module';
import { MembersModule } from './members/members.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectRolesModule } from './project-roles/project-roles.module';
import { ProjectsModule } from './projects/projects.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { ReportLayoutsModule } from './report-layouts/report-layouts.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ObservabilityModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().default('redis://localhost:6379'),
        TCP_PORT: Joi.number().required(),
        LOG_LEVEL: Joi.string()
          .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
          .default('info'),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        /* Dónde viven los bytes de los adjuntos de chat. `postgres` por
           defecto; `gcs` activa el proveedor de GCS, que hoy está escrito pero
           sin conexión. Ver `storage/blob-storage.module.ts`. */
        STORAGE_DRIVER: Joi.string().valid('postgres', 'gcs').default('postgres'),
        GCS_PROJECT_ID: Joi.string().allow(''),
        GCS_BUCKET: Joi.string().allow(''),
      }),
    }),
    PrismaModule,
    RedisModule,
    RealtimeModule,
    ProjectsModule,
    WorkspacesModule,
    BoardsModule,
    ColumnsModule,
    InvitationsModule,
    MembersModule,
    NotificationsModule,
    ProjectRolesModule,
    ChatModule,
    ReportLayoutsModule,
  ],
})
export class AppModule {}
