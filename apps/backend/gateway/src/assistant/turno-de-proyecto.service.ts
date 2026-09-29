import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { type AssistantChatBodyDto, NOT_IN_ORG_CODE } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { QuotaService } from '../billing/quota.service';

/**
 * Lo que necesita un turno de PRAX **con proyecto**, reunido en un sitio.
 *
 * Vivía dentro de `AssistantController`. Salió a un servicio cuando lo
 * necesitó un segundo llamador —@PRAX en el chat del grupo (F10 de
 * docs/PLAN-PRAX-SEMIAGENTICO.md)—: los permisos, los miembros, el chat
 * reciente y la cuota tienen que salir exactamente igual se hable con PRAX
 * desde su pantalla o desde el chat, o PRAX sabría cosas distintas según
 * dónde le escribas.
 */
@Injectable()
export class TurnoDeProyectoService {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    private readonly cuotas: QuotaService,
  ) {}

  /** Todo lo que el servicio necesita para un turno con proyecto. */
  async prepararTurno(projectId: string, userId: string, body: AssistantChatBodyDto) {
    /* La organización sale del proyecto: es el recurso el que dice dónde se
       está trabajando, y por tanto qué plan aplica y contra qué cubo se cuenta.

       🔴 **Y tiene que ser la activa** (D6 de docs/PLAN-PRAX-SEMIAGENTICO.md).
       Tener acceso a un proyecto de otra organización no basta para hablar de
       él con PRAX desde esta: es el malentendido que la organización activa
       existe para evitar. El cliente dice desde cuál pregunta, y si no es la
       del proyecto, 403 `NOT_IN_ORG`. Sin el campo, como antes: un cliente sin
       actualizar no se queda sin PRAX. */
    const organizacionDelProyecto = await this.cuotas.organizacionDelProyecto(projectId);
    if (
      body.organizationId &&
      organizacionDelProyecto &&
      body.organizationId !== organizacionDelProyecto
    ) {
      throw new ForbiddenException({
        code: NOT_IN_ORG_CODE,
        message:
          'Este proyecto es de otra organización. Cámbiate a ella para hablar de él con PRAX.',
      });
    }

    const [permisos, miembros, chat, ia] = await Promise.all([
      this.permisosEfectivos(userId, projectId),
      this.miembrosConNombre(projectId),
      this.chatReciente(projectId, userId),
      /* `iaDe` y no `limiteDeIa`: esta ruta **gasta** cuota, así que puede
         acabar en un 402 que tiene que decir qué plan puso ese tope. */
      this.cuotas.iaDe(userId, organizacionDelProyecto),
    ]);

    return {
      projectId,
      userId,
      message: body.message,
      /* `history` ya no viaja: el hilo lo guarda el servicio y lo lee de su
             base. Ver la nota de `AssistantTurnDto`. */
      conversationId: body.conversationId,
      /* Solo los ids: los bytes ya están guardados desde que se subieron,
             y es assistant-service quien los tiene. Que aquí no viaje ningún
             archivo es justo lo que quita de encima el tope de 1 MB de la
             Server Action. Ver `AssistantChatBodyDto.attachmentIds`. */
      attachmentIds: body.attachmentIds,
      permisos,
      miembros,
      chat,
      limiteMensual: ia.limite,
      organizationId: ia.organizationId,
      planTier: ia.tier,
    };
  }

  /**
   * Lo último que se ha dicho en el chat del equipo.
   *
   * ## Leer el chat es contexto, no una herramienta
   *
   * Se le da hecho en vez de declararle un `leer_chat` que tuviera que invocar:
   * una herramienta de lectura gasta un turno entero del modelo para traer algo
   * que casi siempre hace falta, y encima puede decidir no llamarla justo cuando
   * era relevante. Es el mismo trato que ya reciben los miembros y los permisos.
   *
   * ⚠️ **Solo el chat de ESTE proyecto.** Las conversaciones privadas no entran
   * aquí ni entrarán: son de dos personas, y meterlas en el contexto de un
   * asistente de proyecto sería enseñárselas a quien tenga acceso al proyecto.
   *
   * Veinte mensajes: suficiente para entender de qué se está hablando sin
   * comerse la ventana de contexto con una conversación de meses.
   *
   * Si falla, se devuelve vacío en vez de tumbar el turno: perder el contexto
   * del chat empeora la respuesta, perder el turno la borra.
   */
  private async chatReciente(
    projectId: string,
    userId: string,
  ): Promise<{ autor: string; texto: string; cuando: string }[]> {
    try {
      const pagina = await firstValueFrom(
        this.projectsClient.send<{
          items?: { authorId: string; body: string; createdAt: string }[];
        }>({ cmd: 'chat_project_find_all' }, { projectId, requesterId: userId, limit: 20 }),
      );

      return (pagina?.items ?? []).map((mensaje) => ({
        autor: mensaje.authorId,
        texto: mensaje.body,
        cuando: mensaje.createdAt,
      }));
    } catch {
      return [];
    }
  }

  /**
   * El mapa efectivo, ya expandido por jerarquía y con el bypass del dueño.
   *
   * Es exactamente lo que devuelve `GET /projects/:id/permissions/me`, y se pide
   * aquí en vez de fiarse de nada que venga del cliente: quien decide qué
   * herramientas ve el modelo no puede ser el navegador.
   */

  private async permisosEfectivos(
    userId: string,
    projectId: string,
  ): Promise<Record<string, boolean>> {
    const efectivos = await firstValueFrom(
      this.projectsClient.send<{ permissions?: Record<string, boolean> }>(
        { cmd: 'project_effective_permissions' },
        { userId, projectId },
      ),
    );
    return efectivos?.permissions ?? {};
  }

  /**
   * Los miembros, con un nombre que se pueda decir en voz alta.
   *
   * El modelo necesita las dos cosas: el `userId` para poder rellenar
   * `assigneeIds` en una propuesta, y el nombre para escribir «Carlos» en vez de
   * un UUID en mitad de una frase.
   *
   * Los nombres viven en credentials-service, que no conoce los proyectos, y los
   * miembros en projects-service, que no conoce los nombres. Cruzarlos es
   * trabajo del gateway — es el mismo cruce que ya hace la pantalla de Reportes
   * pidiendo `/members` y `/users` por separado.
   *
   * Si credentials no responde, cada persona se queda con su id como nombre en
   * vez de tumbar el turno: perder los nombres empeora la respuesta, perder el
   * turno la borra.
   */
  private async miembrosConNombre(
    projectId: string,
  ): Promise<{ userId: string; nombre: string }[]> {
    const miembros = await firstValueFrom(
      this.projectsClient.send<{ userId: string }[]>({ cmd: 'member_find_all' }, { projectId }),
    ).catch(() => [] as { userId: string }[]);

    const ids = [...new Set((miembros ?? []).map((miembro) => miembro.userId))];
    if (ids.length === 0) return [];

    /**
     * ⚠️ **Una llamada, no una por miembro** (E6.1).
     *
     * Esto hacía `user_find_one` dentro de un `map`: una llamada TCP a
     * credentials **por cada persona del proyecto**, cada vez que el asistente
     * necesita saber quién es quién. Un equipo de veinte eran veinte idas y
     * vueltas para construir un dato que se usa entero o no se usa.
     *
     * `user_find_by_ids` ya existía —lo usa el panel de administración— y
     * resuelve los mismos perfiles de un golpe.
     */
    const perfiles = await firstValueFrom(
      this.credentialsClient.send<{ id: string; firstName?: string; lastName?: string }[]>(
        { cmd: 'user_find_by_ids' },
        { ids },
      ),
    ).catch(() => [] as { id: string; firstName?: string; lastName?: string }[]);

    const porId = new Map((perfiles ?? []).map((perfil) => [perfil.id, perfil]));

    /* Sin perfil se cae al `userId`, igual que antes: el asistente prefiere
       hablar en UUID a no poder nombrar a alguien. */
    return ids.map((userId) => {
      const perfil = porId.get(userId);
      const nombre = [perfil?.firstName, perfil?.lastName].filter(Boolean).join(' ').trim();
      return { userId, nombre: nombre || userId };
    });
  }
}
