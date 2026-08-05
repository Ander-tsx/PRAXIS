import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { ObservabilityModule } from '@praxis/observability';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ObservabilityModule.forRoot({ serviceName: 'credentials' }),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL:              Joi.string().required(),
        REDIS_URL:                 Joi.string().default('redis://localhost:6379'),
        TCP_PORT:                  Joi.number().required(),
        JWT_SECRET:                Joi.string().required(),
        JWT_EXPIRES_IN:            Joi.string().default('15m'),
        REFRESH_TOKEN_EXPIRES_IN:  Joi.string().default('7d'),
        LOG_LEVEL:                 Joi.string()
                                     .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
                                     .default('info'),
        NODE_ENV:                  Joi.string()
                                     .valid('development', 'production', 'test')
                                     .default('development'),
      }),
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
