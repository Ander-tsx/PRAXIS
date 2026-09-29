import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

/** Lo que se le pasa a `chat_*_send` para decir de dónde vino el mensaje. */
export interface OrigenDeMensaje {
  origin: 'USER' | 'ASSISTANT';
  originMeta?: { invocadoPor: string; conversationId: string };
}

/**
 * De dónde viene un mensaje que llega por HTTP (D13 de
 * docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * ## Por qué hace falta preguntar
 *
 * Por HTTP un mensaje es siempre de la persona, **salvo** cuando acepta una
 * propuesta de PRAX: entonces se firma «enviado con PRAX». El cliente no puede
 * decir `origin: ASSISTANT` —el DTO lo rechaza, como rechaza `AUTOMATION`—;
 * lo que manda es `praxConversationId`, y aquí se comprueba que esa
 * conversación **es suya**. Sin la comprobación, cualquiera podría firmar como
 * PRAX mensajes que PRAX no propuso.
 *
 * Nunca se firma `AUTOMATION` desde aquí: eso solo lo publica
 * automation-service, por TCP.
 */
@Injectable()
export class OrigenDeMensajeService {
  constructor(@Inject('ASSISTANT_SERVICE') private readonly assistantClient: ClientProxy) {}

  async resolver(userId: string, praxConversationId?: string): Promise<OrigenDeMensaje> {
    if (!praxConversationId) return { origin: 'USER' };
    const suya = await firstValueFrom(
      this.assistantClient.send<boolean>(
        { cmd: 'assistant_conversation_owned' },
        { userId, conversationId: praxConversationId },
      ),
    ).catch(() => false);
    if (!suya) {
      throw new ForbiddenException('Esa conversación con PRAX no es tuya.');
    }
    return {
      origin: 'ASSISTANT',
      originMeta: { invocadoPor: userId, conversationId: praxConversationId },
    };
  }
}
