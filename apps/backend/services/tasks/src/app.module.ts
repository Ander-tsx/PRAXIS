import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { ObservabilityModule } from '@praxis/observability';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    ObservabilityModule.forRoot({ serviceName: 'tasks' }),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL:           Joi.string().required(),
        REDIS_URL:              Joi.string().default('redis://localhost:6379'),
        TCP_PORT:               Joi.number().required(),
        PROJECTS_SERVICE_HOST:  Joi.string().default('localhost'),
        PROJECTS_SERVICE_PORT:  Joi.number().default(3003),
        LOG_LEVEL:              Joi.string()
                                  .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
                                  .default('info'),
        NODE_ENV:               Joi.string()
                                  .valid('development', 'production', 'test')
                                  .default('development'),
      }),
    }),
    PrismaModule,
    RedisModule,
    TasksModule,
  ],
})
export class AppModule {}
