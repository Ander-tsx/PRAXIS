import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { FindAdminActivityDto, RecordAdminActionDto } from '@praxis/contracts';

import { AdminActivityService } from './admin-activity.service';

/**
 * Los dos únicos comandos del registro de actividad.
 *
 * ⚠️ **No añadas aquí un `admin_activity_update` ni un `admin_activity_delete`.**
 * El registro es solo-añadir a propósito: es lo que lo hace servir para
 * responder «quién hizo esto y por qué». Ver `AdminActivityService`.
 */
@Controller()
export class AdminActivityController {
  constructor(private readonly adminActivity: AdminActivityService) {}

  @MessagePattern({ cmd: 'admin_activity_record' })
  record(@Payload() dto: RecordAdminActionDto) {
    return this.adminActivity.record(dto);
  }

  @MessagePattern({ cmd: 'admin_activity_find' })
  find(@Payload() dto: FindAdminActivityDto) {
    return this.adminActivity.find(dto);
  }
}
