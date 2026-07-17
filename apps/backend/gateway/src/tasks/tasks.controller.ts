import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import {
  AssignTaskDto,
  CreateTaskDto,
  DeleteTaskDto,
  FindTasksDto,
  MoveTaskDto,
  ProjectPermission,
  UpdateTaskDto,
} from '@praxis/contracts';

@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller()
export class TasksController {
  constructor(
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
  ) {}

  /** Crea una tarea en un board */
  @Post('boards/:boardId/tasks')
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.EDIT)
  create(
    @Param('boardId') boardId: string,
    @Request() req: Express.Request,
    @Body() body: Omit<CreateTaskDto, 'requesterId' | 'boardId'>,
  ) {
    const cmd = body.parentTaskId ? 'subtask_create' : 'task_create';
    return firstValueFrom(
      this.tasksClient.send(
        { cmd },
        {
          ...body,
          boardId,
          requesterId: req.user!.userId,
        },
      ),
    );
  }

  /** Lista tareas de un board (soporta filtrar por columnId en query) */
  @Get('boards/:boardId/tasks')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.VIEW)
  findAll(
    @Param('boardId') boardId: string,
    @Query('columnId') columnId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const findDto: FindTasksDto = {
      boardId,
      columnId,
      query: {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      },
    };
    return firstValueFrom(
      this.tasksClient.send({ cmd: 'task_find_all' }, findDto),
    );
  }

  /** Detalle de una tarea */
  @Get('tasks/:id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.VIEW)
  findOne(
    @Param('id') id: string,
    @Query('projectId') projectId: string, // Requerido para el guard
  ) {
    return firstValueFrom(
      this.tasksClient.send({ cmd: 'task_find_one' }, { id }),
    );
  }

  /** Actualiza una tarea */
  @Patch('tasks/:id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.EDIT)
  update(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: Omit<UpdateTaskDto, 'id' | 'requesterId'>,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'task_update' },
        {
          ...body,
          id,
          requesterId: req.user!.userId,
        },
      ),
    );
  }

  /** Mueve una tarea de columna u orden */
  @Post('tasks/:id/move')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.EDIT)
  move(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: Omit<MoveTaskDto, 'id' | 'requesterId'>,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'task_move' },
        {
          ...body,
          id,
          requesterId: req.user!.userId,
        },
      ),
    );
  }

  /** Elimina una tarea */
  @Delete('tasks/:id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.EDIT)
  delete(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: Omit<DeleteTaskDto, 'id' | 'requesterId'>,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'task_delete' },
        {
          ...body,
          id,
          requesterId: req.user!.userId,
        },
      ),
    );
  }

  /** Asigna un encargado a una tarea */
  @Post('tasks/:id/assign')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.EDIT)
  assign(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: Omit<AssignTaskDto, 'id' | 'requesterId'>,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'task_assign' },
        {
          ...body,
          id,
          requesterId: req.user!.userId,
        },
      ),
    );
  }
}
