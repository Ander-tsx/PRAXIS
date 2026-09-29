import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { TurnoDeProyectoService } from './turno-de-proyecto.service';

/** La mención a PRAX en el cuerpo de un mensaje. */
const MENCION_A_PRAX = /@\[[^\]\n]{1,120}\]\(assistant:prax\)/g;

/** Tope de un mensaje de chat. Espejo de `CHAT_MESSAGE_MAX`. */
const CHAT_MESSAGE_MAX = 4000;

/**
 * @PRAX en el chat del grupo (D15 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * ## Qué hace
 *
 * Cuando alguien escribe `@PRAX` en el chat de un proyecto, esto lanza un turno
 * **con la sesión de quien lo mencionó** —sus permisos, su cuota, su
 * organización— y publica la respuesta en el chat, citando el mensaje.
 *
 * ## Lo que no hace, a propósito
 *
 * - **No propone en el chat.** Una tarjeta que solo puede aceptar una persona es
 *   ruido para todas las demás. Las propuestas se guardan en la conversación
 *   privada de quien preguntó, y la respuesta dice cuántas hay.
 * - **No se dispara solo.** Solo con la mención explícita: adivinar cuándo
 *   hablarle (Jev, sin `@`) queda fuera de esta etapa, porque un falso positivo
 *   hace hablar a PRAX donde nadie lo llamó.
 * - **No bloquea el envío.** El mensaje de la persona ya está guardado; esto
 *   corre detrás y, si falla, lo dice en el chat en vez de perderse.
 *
 * ## Quién firma
 *
 * El mensaje de PRAX tiene que tener un autor, y es **quien lo invocó**, con
 * `origin: ASSISTANT` y `originMeta.respuesta: true`: la pantalla lo pinta como
 * PRAX, «a petición de …». No hay una cuenta de PRAX, y no debe haberla: una
 * cuenta sería alguien con asiento y permisos propios.
 */
@Injectable()
export class PraxEnElChatService {
  private readonly log = new Logger(PraxEnElChatService.name);

  constructor(
    @Inject('ASSISTANT_SERVICE') private readonly assistantClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    private readonly turnos: TurnoDeProyectoService,
  ) {}

  /** ¿Menciona a PRAX? Barato: se llama en cada mensaje del chat. */
  static loMenciona(cuerpo: string | undefined): boolean {
    return Boolean(cuerpo && new RegExp(MENCION_A_PRAX.source).test(cuerpo));
  }

  /**
   * Atiende la mención. **No lanza nunca**: se llama sin esperar (`void`) desde
   * el controlador, y una promesa rechazada sin nadie escuchando tumba el
   * proceso (ver la nota del `touchRead` en `chat.service.ts`).
   */
  async atender(mensaje: {
    id: string;
    projectId: string;
    userId: string;
    body: string;
  }): Promise<void> {
    const publicar = (texto: string, meta: Record<string, unknown> = {}) =>
      firstValueFrom(
        this.projectsClient.send(
          { cmd: 'chat_project_send' },
          {
            projectId: mensaje.projectId,
            requesterId: mensaje.userId,
            /* Sin la mención dentro: si PRAX la repitiera, se llamaría a sí mismo. */
            body: texto.replace(MENCION_A_PRAX, 'PRAX').slice(0, CHAT_MESSAGE_MAX),
            replyToId: mensaje.id,
            origin: 'ASSISTANT',
            originMeta: { invocadoPor: mensaje.userId, respuesta: true, ...meta },
          },
        ),
      );

    try {
      const pregunta = mensaje.body.replace(MENCION_A_PRAX, 'PRAX').trim();
      const payload = await this.turnos.prepararTurno(mensaje.projectId, mensaje.userId, {
        message:
          '[Te han mencionado en el CHAT DEL EQUIPO. Tu respuesta la leerá todo el equipo: ' +
          'breve, sin saludos, y dirigida a quien pregunta. Si propones algo, las tarjetas se ' +
          'quedan en su conversación privada contigo: dilo en una frase.]\n\n' +
          pregunta,
      } as never);
      if (payload.permisos.canViewReports !== true) {
        await publicar(
          'Para hablar conmigo hace falta el permiso «Ver los reportes y usar el asistente» ' +
            'en este proyecto. Pídeselo a quien lo administra.',
          { error: true },
        );
        return;
      }

      const resultado = await firstValueFrom(
        this.assistantClient.send<{
          reply: string;
          proposals?: unknown[];
          conversationId?: string;
        }>({ cmd: 'assistant_chat' }, payload),
      );
      const propuestas = resultado.proposals?.length ?? 0;
      await publicar(resultado.reply || 'No he sabido qué responder a eso.', {
        ...(resultado.conversationId ? { conversationId: resultado.conversationId } : {}),
        ...(propuestas > 0 ? { propuestas } : {}),
      });
    } catch (error) {
      const e = (error ?? {}) as { message?: string; statusCode?: number };
      this.log.warn(`prax_en_el_chat_fallido ${e.statusCode ?? ''} ${e.message ?? error}`);
      await publicar(
        e.statusCode === 402
          ? 'No puedo responder: se ha agotado tu cuota de PRAX de este mes.'
          : 'No he podido responder ahora. Vuelve a mencionarme en un momento.',
        { error: true },
      ).catch(() => undefined);
    }
  }
}
