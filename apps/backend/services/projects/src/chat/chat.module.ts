import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { BlobStorageModule } from '../storage/blob-storage.module';
import { ChannelsService } from './channels.service';
import { ChatAttachmentsService } from './chat-attachments.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/**
 * El chat vive en projects-service porque quién puede leerlo y quién puede
 * escribir se responde con la membresía y el rol, que ya son de este servicio.
 * En otro servicio, cada comprobación de acceso sería un salto de red y habría
 * que duplicar la noción de miembro — que es exactamente como se desincronizan
 * dos servicios.
 *
 * Los adjuntos traen su propio almacenamiento (`BlobStorageModule`), que hoy
 * guarda en Postgres y mañana en GCS; el resto del módulo no conoce cuál está
 * activo.
 */
@Module({
  imports: [BlobStorageModule, PushModule],
  controllers: [ChatController],
  providers: [ChatService, ChannelsService, ChatAttachmentsService],
})
export class ChatModule {}
