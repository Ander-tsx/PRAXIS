import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { catchError, throwError } from 'rxjs';

import { type Alcance, AlcanceService } from './alcance.service';
import { AssistantService } from './assistant.service';
import { AttachmentsService } from './attachments.service';
import type { AmbitoDeOrganizacion } from './conversations.service';

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
  constructor(
    private readonly assistant: AssistantService,
    private readonly adjuntos: AttachmentsService,
    private readonly alcance: AlcanceService,
  ) {}

  /** «Recursos» de una persona en una organización (D5). La validación es del gateway. */
  @MessagePattern({ cmd: 'assistant_scope_get' })
  leerAlcance(@Payload() dto: { userId: string; organizationId: string }) {
    return this.alcance.leer(dto.userId, dto.organizationId);
  }

  @MessagePattern({ cmd: 'assistant_scope_set' })
  guardarAlcance(@Payload() dto: { userId: string; organizationId: string; alcance: Alcance }) {
    return this.alcance.guardar(dto.userId, dto.organizationId, dto.alcance);
  }

  @MessagePattern({ cmd: 'assistant_chat' })
  async chat(
    @Payload()
    dto: {
      projectId: string;
      userId: string;
      message: string;
      conversationId?: string;
      history?: { role: string; text: string }[];
      attachmentIds?: string[];
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

  /**
   * El mismo turno, emitiendo eventos según ocurre (D7): `inicio`, `paso`,
   * `texto` y `fin`. Varios valores por una sola petición: por TCP y por el
   * transporte en proceso, igual.
   */
  @MessagePattern({ cmd: 'assistant_chat_vivo' })
  chatEnVivo(@Payload() dto: Parameters<AssistantService['chatEnVivo']>[0]) {
    return this.assistant
      .chatEnVivo(dto)
      .pipe(catchError((error) => throwError(() => AssistantService.comoRpc(error))));
  }

  @MessagePattern({ cmd: 'assistant_quota' })
  quota(
    @Payload()
    dto: { userId: string; limiteMensual?: number | null; organizationId?: string | null },
  ) {
    return this.assistant.estadoCuota(dto.userId, dto.limiteMensual, dto.organizationId);
  }

  /**
   * El borrador de plantilla de un proyecto que todavía no existe.
   *
   * ⚠️ **No lleva `projectId`, y no es un olvido.** Se pide antes de crear
   * nada, así que no hay proyecto contra el que el gateway pueda resolver
   * permisos: lo único que comprueba es que haya sesión. Es seguro porque esto
   * **no escribe nada** —devuelve nombres— y porque materializarlo son N
   * llamadas del frontend a los endpoints de siempre, cada una con su guard.
   */
  @MessagePattern({ cmd: 'assistant_project_draft' })
  async borradorDePlantilla(
    @Payload() dto: { userId: string; brief: string; ajuste?: string; previa?: string },
  ) {
    try {
      return await this.assistant.borradorDePlantilla(dto);
    } catch (error) {
      throw AssistantService.comoRpc(error);
    }
  }

  /*
   * 🕳️ Aquí había cinco comandos del sistema de planes viejo:
   * `assistant_plan_set`, `assistant_plans_of`, `assistant_billing_of`,
   * `assistant_billing_link` y `assistant_billing_by_subscription`.
   *
   * Los tres de facturación **no los llamaba nadie desde antes**: el cliente de
   * Stripe pasó a ser de la organización y billing-service tiene los suyos. Los
   * dos de plan servían a una pantalla de administración que concedía un `PRO`
   * por persona que ya no cambiaba ningún tope — ver el hueco de
   * `QuotaService` y `docs/AUDITORIA-PLANES.md`.
   *
   * Retirados el 2026-09-03 con la tabla que había debajo.
   */

  /**
   * Los comandos de conversaciones.
   *
   * Todos llevan `userId` y **ninguno acepta un id sin él**: una conversación
   * es de quien la escribió, y `canViewReports` —lo único que comprueba el
   * gateway— es un permiso del proyecto, no de la conversación. Sin esto, un
   * compañero con el mismo rol leería estos hilos.
   *
   * ⚠️ **Y ninguno lleva ya `projectId`.** Desde que el proyecto es un foco
   * cambiable y no lo que define la conversación, filtrar por él daba 404 al
   * pedir un hilo que había pasado por otro — que es justo el gesto que todo esto
   * viene a permitir. El `userId` sigue siendo la clave de acceso, que es la que
   * de verdad protegía algo.
   */
  @MessagePattern({ cmd: 'assistant_conversations' })
  conversaciones(@Payload() dto: { userId: string; ambito?: AmbitoDeOrganizacion }) {
    return this.assistant.listarConversaciones(dto.userId, dto.ambito);
  }

  @MessagePattern({ cmd: 'assistant_conversation' })
  async conversacion(
    @Payload() dto: { userId: string; conversationId: string; ambito?: AmbitoDeOrganizacion },
  ) {
    try {
      return await this.assistant.detalleConversacion(dto.userId, dto.conversationId, dto.ambito);
    } catch (error) {
      throw AssistantService.comoRpc(error);
    }
  }

  @MessagePattern({ cmd: 'assistant_conversation_rename' })
  async renombrar(
    @Payload()
    dto: { userId: string; conversationId: string; title: string },
  ) {
    try {
      return await this.assistant.renombrarConversacion(dto.userId, dto.conversationId, dto.title);
    } catch (error) {
      throw AssistantService.comoRpc(error);
    }
  }

  /** ¿La conversación es de esta persona? Lo pregunta el chat antes de firmar con PRAX. */
  @MessagePattern({ cmd: 'assistant_conversation_owned' })
  conversacionPropia(@Payload() dto: { userId: string; conversationId: string }) {
    return this.assistant.esConversacionDe(dto.userId, dto.conversationId);
  }

  @MessagePattern({ cmd: 'assistant_conversation_delete' })
  async borrar(@Payload() dto: { userId: string; conversationId: string }) {
    try {
      return await this.assistant.borrarConversacion(dto.userId, dto.conversationId);
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

  /**
   * Los adjuntos de PRAX.
   *
   * ⚠️ **No llevan `projectId` y no lo necesitan.** Un archivo se sube antes de
   * escribir el mensaje —cuando puede que no haya ni conversación, ni proyecto
   * elegido— y es de quien lo sube. `uploadedBy` es lo único que lo protege, y
   * es lo que filtra el servicio en las tres.
   */
  @MessagePattern({ cmd: 'assistant_attachment_create' })
  async crearAdjunto(
    @Payload()
    dto: { userId: string; filename: string; mimeType: string; content: string },
  ) {
    try {
      return await this.adjuntos.crear(dto);
    } catch (error) {
      throw AssistantService.comoRpc(error);
    }
  }

  @MessagePattern({ cmd: 'assistant_attachment_delete' })
  async borrarAdjunto(@Payload() dto: { userId: string; attachmentId: string }) {
    try {
      return await this.adjuntos.descartar(dto.userId, dto.attachmentId);
    } catch (error) {
      throw AssistantService.comoRpc(error);
    }
  }

  @MessagePattern({ cmd: 'assistant_attachment_get_content' })
  async contenidoDeAdjunto(@Payload() dto: { userId: string; attachmentId: string }) {
    try {
      return await this.adjuntos.contenido(dto.userId, dto.attachmentId);
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
