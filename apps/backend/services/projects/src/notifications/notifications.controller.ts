import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateNotificationsDto,
  FindNotificationsDto,
  MarkAllNotificationsReadDto,
  MarkNotificationReadDto,
} from '@praxis/contracts';
import { NotificationsService } from './notifications.service';

@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Alta en bloque.
   *
   * La llaman los emisores de dentro de este servicio (invitaciones, miembros) y
   * **tasks-service**, que ya habla con projects para comprobar permisos.
   */
  @MessagePattern({ cmd: 'notification_create' })
  create(@Payload() dto: CreateNotificationsDto) {
    return this.notificationsService.createNotifications(dto);
  }

  @MessagePattern({ cmd: 'notification_find_mine' })
  findMine(@Payload() dto: FindNotificationsDto) {
    return this.notificationsService.findMine(dto);
  }

  @MessagePattern({ cmd: 'notification_mark_read' })
  markRead(@Payload() dto: MarkNotificationReadDto) {
    return this.notificationsService.markRead(dto);
  }

  @MessagePattern({ cmd: 'notification_mark_all_read' })
  markAllRead(@Payload() dto: MarkAllNotificationsReadDto) {
    return this.notificationsService.markAllRead(dto);
  }
}
