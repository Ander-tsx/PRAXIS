import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AssistantChatBodyDto,
  ProjectPermission,
  RenameConversationBodyDto,
  ResolveProposalBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { QuotaService } from '../billing/quota.service';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

/**
 * El asistente de un proyecto.
 *
 * Cuelga de `/projects/:projectId/...`, así que `ProjectPermissionGuard`
 * resuelve el proyecto de `params` sin que haya que tocar el guard ni apuntar
 * este controlador en `TASK_CONTROLLERS`. Mismo caso que los reportes.
 *
 * ### Qué hace este controlador que no hace assistant-service
 *
 * Resuelve **quién es quién y qué puede hacer**, que es trabajo del gateway y de
 * nadie más: es el único que habla con projects y con credentials, y el único
 * que sabe de roles. `assistant-service` recibe el mapa de permisos ya expandido
 * y los miembros ya con nombre, y se dedica a lo suyo —la cuota y hablar con
 * Gemini— sin abrir clientes hacia media plataforma.
 *
 * ### La línea de permisos
 *
 * | | |
 * |---|---|
 * | Hablar con el asistente, y leer sus conversaciones | `canViewReports` |
 * | Que se le declare `proponer_tarea` | `canCreateTask` |
 * | `proponer_asignacion`, `proponer_edicion`, `proponer_checklist` | `canEditTask` |
 * | `proponer_movimiento` | `canMoveTask` |
 * | `proponer_comentario`, `proponer_mensaje` | `canComment` |
 *
 * Solo la primera fila es un guard. Las demás son **datos que viajan** y que
 * recortan lo que el modelo puede sugerir. El guard de verdad sigue estando
 * donde estaba: al aceptar la propuesta se llama al endpoint de siempre, con su
 * permiso de siempre.
 *
 * ⚠️ Y el permiso **no basta para las conversaciones**: son de quien las
 * escribió, así que el `userId` viaja en cada comando y el servicio filtra por
 * él. Ver la nota de `conversaciones`.
 *
 * ⚠️ `proponer_mensaje` es la de **más alcance**: un comentario queda en una
 * tarea, pero un mensaje del chat le suena a todo el equipo. Cuelga del mismo
 * `canComment` porque es el mismo acto —participar en una conversación sin poder
 * editar el trabajo de nadie— y el listón extra se pone en el prompt y en la
 * tarjeta, que enseña el texto entero antes de enviarlo.
 *
 * ⚠️ **Este controlador no escribe nada.** No crea tareas, no asigna y no toca
 * el tablero. Devuelve texto y propuestas.
 */
@ApiTags('Assistant')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/assistant')
export class AssistantController {
  constructor(
    @Inject('ASSISTANT_SERVICE') private readonly assistantClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    private readonly cuotas: QuotaService,
  ) {}

  /**
   * Cuánta cuota le queda a quien pregunta.
   *
   * Va por su cuenta y no dentro del turno porque la pantalla lo necesita **al
   * cargar**, antes de que nadie escriba nada: poner el coste a la vista de
   * quien lo gasta evita la sorpresa de encontrarse el límite de golpe.
   *
   * Es del usuario, no del proyecto, pero cuelga de `/projects/:projectId` para
   * que el guard tenga contra qué comprobar `canViewProject`: sin proyecto en la
   * ruta no hay nada que resolver, que es el mismo motivo por el que `/me/tasks`
   * cuelga de `/me`.
   */
  @Get('quota')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Cuota mensual del asistente para quien llama' })
  @ApiResponse({ status: 200, description: 'plan, usados, limite, periodo y fecha de reinicio' })
  async quota(
    @Param('projectId', ParseUUIDPipe) _projectId: string,
    @Request() req: Express.Request,
  ) {
    const userId = req.user!.userId;
    /* ⚠️ El tope se resuelve aquí y viaja en el payload: assistant-service
       cuenta los mensajes, pero **no sabe de planes de empresa** —esa tabla es
       de billing-service— y sin el número usaría su tabla por defecto, que para
       quien tiene el plan de su organización diría otra cosa que el servidor.

       ⚠️ Y la organización sale **del proyecto**, no de lo que mande nadie:
       desde 2026-08-28 el tope es el de la organización en la que se trabaja, y
       el contador se lleva con esa misma clave. */
    const organizationId = await this.cuotas.organizacionDelProyecto(_projectId);
    const limiteMensual = await this.cuotas.limiteDeIa(userId, organizationId);

    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_quota' },
        { userId, limiteMensual, organizationId },
      ),
    );
  }

  /**
   * Un turno de conversación.
   *
   * ⚠️ **Responde con propuestas, nunca con hechos.** Si el modelo decide llamar
   * a una función, lo que sale por aquí es la propuesta; crear la tarea es otra
   * petición, a `POST /boards/:boardId/tasks`, con `canCreateTask` y la misma
   * validación de siempre.
   *
   * Códigos que puede devolver, además de los normales:
   * - **402** `QUOTA_EXCEEDED`, con el detalle del tope y la cuota en `details`;
   * - **502** Gemini no respondió. En ese caso **no se ha consumido cuota**.
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Un turno de conversación con el asistente del proyecto' })
  @ApiResponse({ status: 200, description: 'Respuesta, propuestas pendientes de aceptar y cuota' })
  @ApiResponse({ status: 402, description: 'Cuota mensual agotada (QUOTA_EXCEEDED)' })
  @ApiResponse({ status: 502, description: 'Gemini no respondió. No se ha consumido cuota' })
  async chat(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() req: Express.Request,
    @Body() body: AssistantChatBodyDto,
  ) {
    const userId = req.user!.userId;

    const [permisos, miembros, chat, ia] = await Promise.all([
      this.permisosEfectivos(userId, projectId),
      this.miembrosConNombre(projectId),
      this.chatReciente(projectId, userId),
      /* `iaDe` y no `limiteDeIa`: esta ruta **gasta** cuota, así que puede
         acabar en un 402 que tiene que decir qué plan puso ese tope.

         La organización sale del proyecto: es el recurso el que dice dónde se
         está trabajando, y por tanto qué plan aplica y contra qué cubo se
         cuenta. */
      this.cuotas
        .organizacionDelProyecto(projectId)
        .then((organizationId) => this.cuotas.iaDe(userId, organizationId)),
    ]);

    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_chat' },
        {
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
        },
      ),
    );
  }

  /**
   * Las conversaciones guardadas.
   *
   * ⚠️ **`canViewReports` no basta y por eso no es lo único que se comprueba.**
   * Es un permiso del **proyecto**: con él, cualquier compañero del mismo rol
   * podría pedir la conversación de otro. Lo que alguien le escribe a un
   * asistente no es un dato del proyecto, es suyo — así que el `userId` viaja
   * en cada comando y assistant-service filtra por él. Una conversación ajena
   * responde 404, no 403: un 403 confirmaría que ese id existe.
   *
   * El permiso sigue haciendo falta igualmente: sin acceso al informe no hay
   * asistente del que tener conversaciones.
   */

  /**
   * Marcar una propuesta como aplicada o descartada.
   *
   * ⚠️ **Esto no aplica nada.** Solo anota lo que se decidió, para que al releer
   * el hilo dentro de una semana no vuelva a ofrecer un botón que ya se pulsó.
   * Aplicarla sigue siendo otra petición, al endpoint de siempre y con su
   * permiso — el cliente llama aquí **después** de que aquella haya salido bien.
   */
  @Post('proposals/:proposalId/resolve')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Anotar si una propuesta se aceptó o se descartó' })
  resolverPropuesta(
    @Param('projectId', ParseUUIDPipe) _projectId: string,
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Request() req: Express.Request,
    @Body() body: ResolveProposalBodyDto,
  ) {
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_proposal_resolve' },
        { userId: req.user!.userId, proposalId, status: body.status },
      ),
    );
  }

  /**
   * El mapa efectivo, ya expandido por jerarquía y con el bypass del dueño.
   *
   * Es exactamente lo que devuelve `GET /projects/:id/permissions/me`, y se pide
   * aquí en vez de fiarse de nada que venga del cliente: quien decide qué
   * herramientas ve el modelo no puede ser el navegador.
   */
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
     * `user_find_by_ids` ya existía —lo usan el panel de administración y
     * alexa-service— y resuelve los mismos perfiles de un golpe.
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
