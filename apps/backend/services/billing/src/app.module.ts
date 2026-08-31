import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ObservabilityModule } from '@praxis/observability';
import { billingEnvValidationSchema } from './config/env.validation';
import { BillingHealthModule } from './health/billing-health.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ObservabilityModule,
    ConfigModule.forRoot({ isGlobal: true, validationSchema: billingEnvValidationSchema }),
    PrismaModule,
    RedisModule,
    OrganizationsModule,
    BillingHealthModule,
  ],
})
export class AppModule {}
