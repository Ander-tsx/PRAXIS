import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ObservabilityModule } from '@praxis/observability';
import { automationEnvValidationSchema } from './config/env.validation';
import { DomainEventsModule } from './domain-events/domain-events.module';
import { AutomationHealthModule } from './health/automation-health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RulesModule } from './rules/rules.module';

@Module({
  imports: [
    ObservabilityModule,
    ConfigModule.forRoot({ isGlobal: true, validationSchema: automationEnvValidationSchema }),
    PrismaModule,
    RedisModule,
    DomainEventsModule,
    RulesModule,
    AutomationHealthModule,
  ],
})
export class AppModule {}
