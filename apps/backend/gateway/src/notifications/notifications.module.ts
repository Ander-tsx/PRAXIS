import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { clienteDeServicio } from '@praxis/local-transport';
import { AuthModule } from '../auth/auth.module';
import { MyNotificationsController } from './my-notifications.controller';
import { NotificationsStreamService } from './notifications-stream.service';

/**
 * Los avisos viven en projects-service. Los eventos de tarea los emite
 * tasks-service por su cuenta: el gateway no participa en la escritura,
 * únicamente en la lectura.
 *
 * ⚠️ Registra **también** `CREDENTIALS_SERVICE`, y no para los avisos en sí: es
 * para ponerle nombre a quien los provoca antes de mandarlos al navegador.
 * projects-service solo conoce el `actorId` —los usuarios viven en otro
 * servicio—, así que resolverlo allí habría metido un salto de red por cada
 * mensaje de chat. Ver `NotificationsStreamService`.
 */
@Module({
  imports: [
    AuthModule,
    ClientsModule.registerAsync([clienteDeServicio('PROJECTS'), clienteDeServicio('CREDENTIALS')]),
  ],
  controllers: [MyNotificationsController],
  providers: [NotificationsStreamService],
})
export class NotificationsModule {}
