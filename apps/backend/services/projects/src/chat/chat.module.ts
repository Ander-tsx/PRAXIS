import { Module } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/**
 * El chat vive en projects-service porque quién puede leerlo y quién puede
 * escribir se responde con la membresía y el rol, que ya son de este servicio.
 * En otro servicio, cada comprobación de acceso sería un salto de red y habría
 * que duplicar la noción de miembro — que es exactamente como se desincronizan
 * dos servicios.
 */
@Module({
  controllers: [ChatController],
  providers: [ChatService, ChannelsService],
})
export class ChatModule {}
