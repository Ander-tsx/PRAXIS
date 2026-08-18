import { Injectable } from '@nestjs/common';

@Injectable()
export class AutomationHealthService {
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
