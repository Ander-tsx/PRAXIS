import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

/** Limpieza idempotente de datos que no tienen FK entre microservicios. */
@Injectable()
export class AutomationPurgeService {
  constructor(@Inject('AUTOMATION_SERVICE') private readonly automationClient: ClientProxy) {}

  async afterProjectDeleted(projectId: string) {
    await firstValueFrom(
      this.automationClient.send({ cmd: 'automation_project_purge' }, { projectId }),
    );
  }
}
