import { Module } from '@nestjs/common';
import { AutomationHealthController } from './automation-health.controller';
import { AutomationHealthService } from './automation-health.service';

@Module({ controllers: [AutomationHealthController], providers: [AutomationHealthService] })
export class AutomationHealthModule {}
