import { Controller, Get, HttpCode, HttpStatus, Inject, Param, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProjectPermission } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

/**
 * Quién ha editado una tarea con un agente de IA (por MCP).
 *
 * Tiene que estar en `TASK_CONTROLLERS` del guard para que `:taskId` resuelva el
 * proyecto; y pide `canViewProject`, como leer la tarea.
 */
@ApiTags('Task agent editors')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('tasks/:taskId/agent-editors')
export class AgentEditorsController {
  constructor(@Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Personas que han editado la tarea con un agente de IA' })
  @ApiResponse({ status: 200, description: 'Una entrada por persona y agente' })
  editors(@Param('taskId') taskId: string) {
    return firstValueFrom(this.credentialsClient.send({ cmd: 'mcp_task_editors' }, { taskId }));
  }
}
