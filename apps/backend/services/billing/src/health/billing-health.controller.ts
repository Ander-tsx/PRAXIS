import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { BillingHealthService } from './billing-health.service';

@Controller()
export class BillingHealthController {
  constructor(private readonly health: BillingHealthService) {}

  @MessagePattern({ cmd: 'billing_health' })
  healthCheck(): { status: 'ok' } {
    return this.health.health();
  }
}
