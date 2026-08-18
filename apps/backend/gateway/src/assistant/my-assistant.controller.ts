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
import { ProjectDraftBodyDto, RenameConversationBodyDto } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';

/**
 * Lo del asistente que **no tiene proyecto detrás**.
 *
 * `GET /projects/:projectId/assistant/quota` existe porque el guard necesita un
 * proyecto contra el que resolver `canViewProject` — pero la cuota es del
 * usuario, no del proyecto, y hay pantallas (Configuración) que quieren
 * enseñarla sin que haya ningún proyecto abierto. Cuelga de `/me` como
 * `/me/tasks` y `/me/notifications`, por el mismo motivo: sin
 * `ProjectPermissionGuard`, el usuario sale del token.
 *
 * Desde la plantilla de arranque hay un segundo inquilino con la misma forma y
 * un motivo más fuerte: **se pide para crear un proyecto, así que el proyecto
 * todavía no existe**. No hay `projectId` que poner en la ruta ni permisos de
 * proyecto que comprobar.
 *
 * ## Y desde el foco cambiable, las conversaciones
 *
 * ⚠️ **Estaban en `/projects/:projectId/assistant/conversations` y se han mudado
 * aquí.** Una conversación ya no es de un proyecto: es de la persona, y el
 * proyecto es el foco de cada turno, que puede cambiar a mitad. Con la ruta
 * anterior, pedir un hilo que había pasado por otro proyecto daba 404 — justo el
 * gesto que el foco cambiable viene a permitir.
 *
 * ⚠️ **Eso quita `canViewReports` de estas cuatro rutas, y hay que entender por
 * qué no es un agujero.** Ese permiso nunca protegió estos hilos: es del
 * proyecto, así que con él cualquier compañero del mismo rol habría podido leer
 * las conversaciones ajenas. Lo que las protege —y sigue protegiéndolas— es que
 * el `userId` sale del token y assistant-service filtra por él, devolviendo 404
 * y no 403 para no confirmar que un id existe.
 *
 * El permiso se sigue exigiendo donde de verdad hace falta: en
 * `POST /projects/:projectId/assistant/chat`, que es lo único que **lee datos
 * del proyecto**.
 */
@ApiTags('Assistant')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/assistant')
export class MyAssistantController {
  constructor(@Inject('ASSISTANT_SERVICE') private readonly assistantClient: ClientProxy) {}

  @Get('conversations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mis conversaciones con el asistente, la última arriba' })
  conversaciones(@Request() req: Express.Request) {
    return firstValueFrom(
      this.assistantClient.send({ cmd: 'assistant_conversations' }, { userId: req.user!.userId }),
    );
  }

  @Get('conversations/:conversationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Una conversación con sus mensajes y propuestas' })
  @ApiResponse({ status: 404, description: 'No existe, o no es tuya' })
  conversacion(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Request() req: Express.Request,
  ) {
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_conversation' },
        { userId: req.user!.userId, conversationId },
      ),
    );
  }

  @Patch('conversations/:conversationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renombrar una conversación' })
  renombrar(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Request() req: Express.Request,
    @Body() body: RenameConversationBodyDto,
  ) {
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_conversation_rename' },
        { userId: req.user!.userId, conversationId, title: body.title },
      ),
    );
  }

  /**
   * Borrar una conversación propia.
   *
   * No contradice la regla de que el asistente nunca borra: ahí quien borraría
   * es el modelo, sobre el trabajo de un equipo. Aquí borra una persona sus
   * propios mensajes, que es lo mínimo que se le debe a quien deja rastro de lo
   * que escribe.
   */
  @Delete('conversations/:conversationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borrar una conversación propia' })
  borrar(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Request() req: Express.Request,
  ) {
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_conversation_delete' },
        { userId: req.user!.userId, conversationId },
      ),
    );
  }

  @Get('quota')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cuota mensual del asistente para quien llama, sin proyecto' })
  @ApiResponse({ status: 200, description: 'plan, usados, limite, periodo y fecha de reinicio' })
  quota(@Request() req: Express.Request) {
    return firstValueFrom(
      this.assistantClient.send({ cmd: 'assistant_quota' }, { userId: req.user!.userId }),
    );
  }

  /**
   * Propone la estructura de arranque de un proyecto nuevo.
   *
   * **No crea nada.** Devuelve nombres —etiquetas, roles, espacios, tableros y
   * columnas— y quien los materializa es el frontend, llamando una a una a las
   * rutas que ya usa cada formulario, con la sesión de quien acepta y bajo los
   * guards de siempre. Es la regla de §26.1 aplicada a una pantalla donde
   * todavía no hay proyecto: la IA propone; ejecuta el código que ya existe.
   *
   * Solo pide sesión, y basta: lo único que puede hacer alguien autenticado con
   * esta ruta es gastarse **su propia** cuota mensual, que es exactamente lo
   * mismo que puede hacer con el chat.
   *
   * Códigos que puede devolver, además de los normales:
   * - **429** cuota agotada, con la cuota en `details`;
   * - **502** Gemini no respondió, o respondió algo inservible. En el primer
   *   caso **no se ha consumido cuota**.
   */
  @Post('project-draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plantilla propuesta para un proyecto nuevo, sin crear nada' })
  @ApiResponse({ status: 200, description: 'La plantilla propuesta y la cuota restante' })
  @ApiResponse({ status: 429, description: 'Cuota mensual agotada' })
  @ApiResponse({ status: 502, description: 'El asistente no devolvió una plantilla utilizable' })
  borradorDeProyecto(@Request() req: Express.Request, @Body() body: ProjectDraftBodyDto) {
    return firstValueFrom(
      this.assistantClient.send(
        { cmd: 'assistant_project_draft' },
        {
          userId: req.user!.userId,
          brief: body.brief,
          ajuste: body.ajuste,
          previa: body.previa,
        },
      ),
    );
  }
}
