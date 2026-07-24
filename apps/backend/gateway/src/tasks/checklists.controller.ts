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
