import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { type CargaPush, PushService } from './push.service';

@Controller()
export class PushController {
  constructor(private readonly push: PushService) {}

  @MessagePattern({ cmd: 'push_public_key' })
  publicKey() {
    return this.push.claveSecreta();
  }

  @MessagePattern({ cmd: 'push_state' })
  state(@Payload() dto: { userId: string; endpoint?: string | null }) {
    return this.push.estado(dto);
  }

  @MessagePattern({ cmd: 'push_subscribe' })
  subscribe(
    @Payload()
    dto: {
      userId: string;
      endpoint: string;
      p256dh: string;
      auth: string;
      userAgent?: string | null;
    },
  ) {
    return this.push.suscribir(dto);
  }

  @MessagePattern({ cmd: 'push_visible' })
  visible(@Payload() dto: { userId: string; visible: boolean }) {
    return this.push.marcarVisible(dto);
  }

  @MessagePattern({ cmd: 'push_unsubscribe' })
  unsubscribe(@Payload() dto: { userId: string; endpoint: string }) {
    return this.push.desuscribir(dto);
  }

  /** Lo llama el gateway con los recordatorios de vencimiento ya agrupados. */
  @MessagePattern({ cmd: 'push_send' })
  send(@Payload() dto: { userIds: string[]; carga: CargaPush }) {
    return this.push.enviar(dto.userIds, dto.carga);
  }
}
