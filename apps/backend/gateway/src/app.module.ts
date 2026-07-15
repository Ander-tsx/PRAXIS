import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ObservabilityModule } from '@praxis/observability';
import { envValidationSchema } from './common/config/env.validation';

import { AuthModule } from './auth/auth.module';
import { UserModule } from './users/user.module';
import { RolesModule } from './roles/roles.module';
import { ProjectsModule } from './projects/projects.module';

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
    RolesModule,
    ProjectsModule,
  ],
})
export class AppModule {}
