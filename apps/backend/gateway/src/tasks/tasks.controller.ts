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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import {
  AssignTaskBodyDto,
  CreateTaskBodyDto,
  DeleteTaskBodyDto,
  FindTasksDto,
  MoveTaskBodyDto,
  ProjectPermission,
  UpdateTaskBodyDto,
} from '@praxis/contracts';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller()
export class TasksController {
  constructor(
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
  ) {}

  /** Crea una tarea en un board (requiere canCreateTask) */
  @Post('boards/:boardId/tasks')
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_CREATE_TASK)
  @ApiOperation({ summary: 'Crea una tarea o subtarea en un board' })
  @ApiResponse({ status: 201, description: 'Tarea creada exitosamente' })
  create(
    @Param('boardId') boardId: string,
    @Request() req: Express.Request,
    @Body() body: CreateTaskBodyDto,
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

  /** Lista tareas de un board (la membresía basta) */
  @Get('boards/:boardId/tasks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lista tareas de un board' })
  @ApiQuery({ name: 'columnId', required: false, description: 'Filtro por ID de columna' })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Límite por página', type: Number })
  @ApiResponse({ status: 200, description: 'Lista de tareas recuperada' })
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

  /** Detalle de una tarea (la membresía basta) */
  @Get('tasks/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detalle de una tarea' })
  @ApiResponse({ status: 200, description: 'Detalle de la tarea recuperado' })
  findOne(
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.tasksClient.send({ cmd: 'task_find_one' }, { id }),
    );
  }

  /** Actualiza una tarea (requiere canEditTask) */
  @Patch('tasks/:id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Actualiza una tarea' })
  @ApiResponse({ status: 200, description: 'Tarea actualizada exitosamente' })
  update(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: UpdateTaskBodyDto,
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

  /** Mueve una tarea de columna u orden (requiere canEditTask) */
  @Post('tasks/:id/move')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Mueve una tarea de columna u orden' })
  @ApiResponse({ status: 200, description: 'Tarea movida exitosamente' })
  move(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: MoveTaskBodyDto,
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

  /** Elimina una tarea (requiere canDeleteTask) */
  @Delete('tasks/:id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_DELETE_TASK)
  @ApiOperation({ summary: 'Elimina una tarea' })
  @ApiResponse({ status: 200, description: 'Tarea eliminada exitosamente' })
  delete(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: DeleteTaskBodyDto,
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

  /** Asigna un encargado a una tarea (requiere canEditTask) */
  @Post('tasks/:id/assign')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Asigna un encargado a una tarea' })
  @ApiResponse({ status: 200, description: 'Encargado asignado exitosamente' })
  assign(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: AssignTaskBodyDto,
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
