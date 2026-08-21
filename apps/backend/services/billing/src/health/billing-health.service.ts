import { Injectable } from '@nestjs/common';

@Injectable()
export class BillingHealthService {
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
