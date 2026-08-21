import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { ObservabilityModule } from '@praxis/observability';
import { DomainEventsModule } from './domain-events/domain-events.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    ObservabilityModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().default('redis://localhost:6379'),
        DOMAIN_OUTBOX_STREAM: Joi.string().default('praxis:domain-events'),
        DOMAIN_OUTBOX_BATCH_SIZE: Joi.number().integer().min(1).max(500).default(100),
        DOMAIN_OUTBOX_RETRY_ATTEMPTS: Joi.number().integer().min(1).max(10).default(3),
        DOMAIN_OUTBOX_RETRY_DELAY_MS: Joi.number().integer().min(0).max(10000).default(50),
        DOMAIN_OUTBOX_POLL_INTERVAL_MS: Joi.number().integer().min(100).max(60000).default(5000),
        TCP_PORT: Joi.number().required(),
        PROJECTS_SERVICE_HOST: Joi.string().default('localhost'),
        PROJECTS_SERVICE_PORT: Joi.number().default(3003),
        LOG_LEVEL: Joi.string()
          .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
          .default('info'),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
      }),
    }),
    PrismaModule,
    RedisModule,
    DomainEventsModule,
    TasksModule,
  ],
})
export class AppModule {}
