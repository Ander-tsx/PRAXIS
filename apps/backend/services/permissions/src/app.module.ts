import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { ObservabilityModule } from '@praxis/observability';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AdminActivityModule } from './admin-activity/admin-activity.module';
import { PermissionsModule } from './permissions/permissions.module';

@Module({
  imports: [
    ObservabilityModule.forRoot({ serviceName: 'permissions' }),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL:    Joi.string().default('redis://localhost:6379'),
        TCP_PORT:     Joi.number().required(),
        LOG_LEVEL:    Joi.string()
                        .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
                        .default('info'),
        NODE_ENV:     Joi.string()
                        .valid('development', 'production', 'test')
                        .default('development'),
      }),
    }),
    PrismaModule,
    RedisModule,
    PermissionsModule,
    AdminActivityModule,
  ],
})
export class AppModule {}
