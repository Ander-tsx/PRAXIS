import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProjectDraftBodyDto } from '@praxis/contracts';
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
 */
@ApiTags('Assistant')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/assistant')
export class MyAssistantController {
  constructor(@Inject('ASSISTANT_SERVICE') private readonly assistantClient: ClientProxy) {}

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
