import { Module } from '@nestjs/common';
import { BillingHealthController } from './billing-health.controller';
import { BillingHealthService } from './billing-health.service';

@Module({ controllers: [BillingHealthController], providers: [BillingHealthService] })
export class BillingHealthModule {}
