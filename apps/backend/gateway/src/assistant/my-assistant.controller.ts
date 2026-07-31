import { Controller, Get, HttpCode, HttpStatus, Inject, Request, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';

/**
 * La cuota del asistente, sin proyecto de por medio.
 *
 * `GET /projects/:projectId/assistant/quota` existe porque el guard necesita un
 * proyecto contra el que resolver `canViewProject` — pero la cuota es del
 * usuario, no del proyecto, y hay pantallas (Configuración) que quieren
 * enseñarla sin que haya ningún proyecto abierto. Cuelga de `/me` como
 * `/me/tasks` y `/me/notifications`, por el mismo motivo: sin
 * `ProjectPermissionGuard`, el usuario sale del token.
 *
 * Reenvía al mismo `{ cmd: 'assistant_quota' }` que ya usa `AssistantController`
 * — assistant-service no distingue de dónde vino la petición.
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
}
