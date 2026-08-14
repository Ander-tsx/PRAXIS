import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateChecklistBodyDto,
  DeleteChecklistBodyDto,
  ProjectPermission,
  ToggleChecklistBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

/**
 * Ítems de checklist de una tarea.
 *
 * ⚠️ **El `projectId` sale de `req.projectId`**, resuelto por el guard desde
 * el `:taskId` de la ruta. El cuerpo ya no lo declara: mandarlo responde 400
 * (`PENDIENTES-BACKEND.md §9`).
 */
@ApiTags('Task Checklists')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('tasks/:taskId/checklists')
export class ChecklistsController {
  constructor(@Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy) {}

  /** Agrega un ítem al checklist de una tarea */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Agrega un ítem al checklist de una tarea' })
  @ApiResponse({ status: 201, description: 'Ítem de checklist creado' })
  create(
    @Param('taskId') taskId: string,
    @Request() req: Express.Request,
    @Body() body: CreateChecklistBodyDto,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'checklist_create' },
        {
          ...body,
          taskId,
          projectId: req.projectId,
          requesterId: req.user!.userId,
        },
      ),
    );
  }

  /**
   * Alterna el estado completado de un ítem (requiere canMoveTask).
   *
   * **Marcar un paso es ejecutar el trabajo, no redefinirlo.** Quien puede
   * arrastrar la tarjeta a «Hecho» tiene que poder ir marcando los pasos por el
   * camino; exigir `canEditTask` dejaba a esa persona con un checklist de solo
   * lectura sobre su propia tarea.
   *
   * Añadir y borrar ítems sí siguen siendo `canEditTask`: eso es decidir en qué
   * consiste la tarea.
   */
  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_MOVE_TASK)
  @ApiOperation({ summary: 'Alterna el estado completado de un ítem' })
  @ApiResponse({ status: 200, description: 'Estado de ítem cambiado' })
  toggle(
    @Param('taskId') taskId: string,
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: ToggleChecklistBodyDto,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'checklist_toggle' },
        {
          ...body,
          id,
          projectId: req.projectId,
          requesterId: req.user!.userId,
        },
      ),
    );
  }

  /** Elimina un ítem del checklist */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Elimina un ítem del checklist' })
  @ApiResponse({ status: 200, description: 'Ítem eliminado' })
  delete(
    @Param('taskId') taskId: string,
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: DeleteChecklistBodyDto,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'checklist_delete' },
        {
          ...body,
          id,
          projectId: req.projectId,
          requesterId: req.user!.userId,
        },
      ),
    );
  }
}
