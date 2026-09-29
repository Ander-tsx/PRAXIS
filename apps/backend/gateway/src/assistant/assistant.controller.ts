import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  Res,
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
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { QuotaService } from '../billing/quota.service';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { TurnoDeProyectoService } from './turno-de-proyecto.service';
import { transmitirTurno } from './turno-en-vivo';

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
  private readonly log = new Logger(AssistantController.name);

  constructor(
    @Inject('ASSISTANT_SERVICE') private readonly assistantClient: ClientProxy,
    private readonly cuotas: QuotaService,
    private readonly turnos: TurnoDeProyectoService,
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
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_chat' },
        await this.turnos.prepararTurno(projectId, req.user!.userId, body),
      ),
    );
  }

  /**
   * El mismo turno, contado mientras ocurre por SSE (D7). Mismo guard y mismo
   * permiso que la ruta de siempre: los decoradores de clase y de método son
   * los mismos, y la organización se comprueba igual antes de abrir el flujo.
   */
  @Post('chat/stream')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Un turno con el asistente del proyecto, por Server-Sent Events' })
  async chatEnVivo(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() req: Express.Request,
    @Body() body: AssistantChatBodyDto,
    @Res() res: Response,
  ) {
    const payload = await this.turnos.prepararTurno(projectId, req.user!.userId, body);
    transmitirTurno(
      res,
      this.assistantClient.send({ cmd: 'assistant_chat_vivo' }, payload),
      this.log,
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
}
