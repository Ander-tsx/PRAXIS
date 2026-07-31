import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Los avisos viven aquí porque este servicio ya es dueño de las membresías y las
 * invitaciones, que son la mayoría de los eventos. Se exporta el servicio para
 * que invitaciones y miembros emitan sin pasar por la red.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
