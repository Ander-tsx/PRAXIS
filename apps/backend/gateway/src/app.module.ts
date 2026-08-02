import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ObservabilityModule } from '@praxis/observability';
import { envValidationSchema } from './common/config/env.validation';

import { AssistantModule } from './assistant/assistant.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './users/user.module';
import { PermissionsModule } from './permissions/permissions.module';
import { ProjectsModule } from './projects/projects.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { TasksModule } from './tasks/tasks.module';
import { AlexaModule } from './alexa/alexa.module';


@Module({
  imports: [
    ObservabilityModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),

    // Módulos de negocio
    AuthModule,
    UserModule,
    PermissionsModule,
    ProjectsModule,
    TasksModule,
    NotificationsModule,
    ReportsModule,
    AssistantModule,
    AlexaModule,
  ],
})

export class AppModule {}
