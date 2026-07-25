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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import {
  CreateChecklistDto,
  DeleteChecklistDto,
  ProjectPermission,
  ToggleChecklistDto,
} from '@praxis/contracts';

@ApiTags('Task Checklists')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('tasks/:taskId/checklists')
export class ChecklistsController {
  constructor(
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
  ) {}

  /** Agrega un ítem al checklist de una tarea */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Agrega un ítem al checklist de una tarea' })
  @ApiResponse({ status: 201, description: 'Ítem de checklist creado' })
  create(
    @Param('taskId') taskId: string,
    @Request() req: Express.Request,
    @Body() body: Omit<CreateChecklistDto, 'taskId' | 'requesterId'>,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'checklist_create' },
        {
          ...body,
          taskId,
          requesterId: req.user!.userId,
        },
      ),
    );
  }

  /** Alterna el estado completado de un ítem de checklist */
  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Alterna el estado completado de un ítem' })
  @ApiResponse({ status: 200, description: 'Estado de ítem cambiado' })
  toggle(
    @Param('taskId') taskId: string,
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: Omit<ToggleChecklistDto, 'id' | 'requesterId'>,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'checklist_toggle' },
        {
          ...body,
          id,
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
    @Body() body: Omit<DeleteChecklistDto, 'id' | 'requesterId'>,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'checklist_delete' },
        {
          ...body,
          id,
          requesterId: req.user!.userId,
        },
      ),
    );
  }
}
