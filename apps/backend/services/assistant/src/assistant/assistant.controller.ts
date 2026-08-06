import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { AssistantService } from './assistant.service';

/**
 * ⚠️ **Ninguna comprueba permisos.** Lo hizo el gateway contra el `projectId` de
 * la ruta, igual que en el resto de comandos internos, y además le manda el mapa
 * de permisos ya resuelto: este servicio no conoce a los usuarios ni a los roles
 * y no tiene forma de comprobar nada.
 *
 * El corolario incómodo, dicho en voz alta: quien pueda hablar por TCP con el
 * 3006 puede pedir un turno con los permisos que quiera declarar. Es la misma
 * superficie que ya tienen los otros cinco servicios —está en la red interna—,
 * y por eso el modelo **no ejecuta nada**: aceptar una propuesta vuelve a pasar
 * por el gateway, que sí comprueba.
 */
@Controller()
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @MessagePattern({ cmd: 'assistant_chat' })
  async chat(
    @Payload()
    dto: {
      projectId: string;
      userId: string;
      message: string;
      conversationId?: string;
      history?: { role: string; text: string }[];
      permisos: Record<string, boolean>;
      miembros: { userId: string; nombre: string }[];
    },
  ) {
    try {
      return await this.assistant.chat(dto);
    } catch (error) {
      /* Un `throw` crudo cruza el TCP como un 500 sin mensaje. Se traduce aquí,
         que es el borde del servicio. */
      throw AssistantService.comoRpc(error);
    }
  }

  @MessagePattern({ cmd: 'assistant_quota' })
  quota(@Payload() dto: { userId: string }) {
    return this.assistant.estadoCuota(dto.userId);
  }

  /**
   * Los comandos de conversaciones.
   *
   * Todos llevan `userId` y **ninguno acepta un id sin él**: una conversación
   * es de quien la escribió, y `canViewReports` —lo único que comprueba el
   * gateway— es un permiso del proyecto, no de la conversación. Sin esto, un
   * compañero con el mismo rol leería estos hilos.
   */
  @MessagePattern({ cmd: 'assistant_conversations' })
  conversaciones(@Payload() dto: { userId: string; projectId: string }) {
    return this.assistant.listarConversaciones(dto.userId, dto.projectId);
  }

  @MessagePattern({ cmd: 'assistant_conversation' })
  async conversacion(
    @Payload() dto: { userId: string; projectId: string; conversationId: string },
  ) {
    try {
      return await this.assistant.detalleConversacion(
        dto.userId,
        dto.projectId,
        dto.conversationId,
      );
    } catch (error) {
      throw AssistantService.comoRpc(error);
    }
  }

  @MessagePattern({ cmd: 'assistant_conversation_rename' })
  async renombrar(
    @Payload()
    dto: { userId: string; projectId: string; conversationId: string; title: string },
  ) {
    try {
      return await this.assistant.renombrarConversacion(
        dto.userId,
        dto.projectId,
        dto.conversationId,
        dto.title,
      );
    } catch (error) {
      throw AssistantService.comoRpc(error);
    }
  }

  @MessagePattern({ cmd: 'assistant_conversation_delete' })
  async borrar(@Payload() dto: { userId: string; projectId: string; conversationId: string }) {
    try {
      return await this.assistant.borrarConversacion(dto.userId, dto.projectId, dto.conversationId);
    } catch (error) {
      throw AssistantService.comoRpc(error);
    }
  }

  @MessagePattern({ cmd: 'assistant_proposal_resolve' })
  async resolverPropuesta(
    @Payload()
    dto: { userId: string; proposalId: string; status: 'ACCEPTED' | 'DISCARDED' },
  ) {
    try {
      return await this.assistant.resolverPropuesta(dto.userId, dto.proposalId, dto.status);
    } catch (error) {
      throw AssistantService.comoRpc(error);
    }
  }

  /** Lo llama el gateway al borrar un proyecto, como `task_purge`. */
  @MessagePattern({ cmd: 'assistant_purge' })
  purgar(@Payload() dto: { projectId: string }) {
    return this.assistant.purgarConversaciones(dto.projectId);
  }
}
