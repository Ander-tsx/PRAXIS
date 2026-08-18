import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { AutomationHealthService } from './automation-health.service';

@Controller()
export class AutomationHealthController {
  constructor(private readonly health: AutomationHealthService) {}

  @MessagePattern({ cmd: 'automation_health' })
  healthCheck(): { status: 'ok' } {
    return this.health.health();
  }
}
