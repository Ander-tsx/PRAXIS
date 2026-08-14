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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AssignTaskBodyDto,
  CreateTaskBodyDto,
  DONE_COLUMN_COLOR,
  DeleteTaskBodyDto,
  FindTasksDto,
  MoveTaskBodyDto,
  ProjectPermission,
  UpdateTaskBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

/**
 * Rutas de tarea.
 *
 * ⚠️ **El `projectId` sale de `req.projectId`**, que resuelve
 * `ProjectPermissionGuard` desde la ruta, y se inyecta **después** del spread
 * del cuerpo para que un valor del cliente no pueda ganar. El cuerpo ya no lo
 * declara: mandarlo responde 400 (`PENDIENTES-BACKEND.md §9`).
 */
@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller()
export class TasksController {
  constructor(
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /**
   * ¿Esa columna es de **cierre** (la verde)?
   *
   * Se resuelve aquí y no en tasks-service porque el color es un campo de
   * `BoardColumn`, que vive en projects-service. Es el cuarto cruce de esta
   * frontera que se resuelve en el gateway, por el mismo motivo que los otros
   * tres (`TaskPurgeService`, `ColumnStatusSyncService` y el `excludeDone` de
   * `/me/tasks`): hacer que tasks llamara a projects encadenaría dos saltos en
   * una ruta que se llama al arrastrar cada tarjeta.
   *
   * Devuelve `undefined` si no se pudo averiguar, y tasks-service lo interpreta
   * como «no toques `completedAt`». Un cierre falso ensucia el throughput para
   * siempre; no registrarlo solo deja el dato incompleto, que es reparable.
   */
  private async isClosingColumn(columnId?: string): Promise<boolean | undefined> {
    if (!columnId) return undefined;

    try {
      const columns = await firstValueFrom(
        this.projectsClient.send({ cmd: 'column_find_by_ids' }, { ids: [columnId] }),
      );
      const column = (columns ?? [])[0] as { color?: string } | undefined;
      if (!column) return undefined;
      return column.color === DONE_COLUMN_COLOR;
    } catch {
      return undefined;
    }
  }

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
          projectId: req.projectId,
          requesterId: req.user!.userId,
        },
      ),
    );
  }

  /** Lista tareas de un board (requiere canViewProject) */
  @Get('boards/:boardId/tasks')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
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
    return firstValueFrom(this.tasksClient.send({ cmd: 'task_find_all' }, findDto));
  }

  /** Detalle de una tarea (requiere canViewProject) */
  @Get('tasks/:id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Detalle de una tarea' })
  @ApiResponse({ status: 200, description: 'Detalle de la tarea recuperado' })
  findOne(@Param('id') id: string) {
    return firstValueFrom(this.tasksClient.send({ cmd: 'task_find_one' }, { id }));
  }

  /** Actualiza una tarea (requiere canEditTask) */
  @Patch('tasks/:id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Actualiza una tarea' })
  @ApiResponse({ status: 200, description: 'Tarea actualizada exitosamente' })
  async update(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: UpdateTaskBodyDto,
  ) {
    /* Este `PATCH` también acepta `columnId`, así que también puede cerrar una
       tarea. Solo se pregunta si el cuerpo trae columna. */
    const isClosingColumn = await this.isClosingColumn(body.columnId);

    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'task_update' },
        {
          ...body,
          id,
          projectId: req.projectId,
          requesterId: req.user!.userId,
          isClosingColumn,
        },
      ),
    );
  }

  /** Mueve una tarea de columna u orden (requiere canEditTask) */
  /**
   * Mueve una tarea de columna (requiere canMoveTask).
   *
   * Es el único endpoint que pide `canMoveTask`: mover no es editar. Quien tiene
   * `canEditTask` lo obtiene por jerarquía, así que ningún rol existente pierde
   * capacidad. Ojo: `PATCH /tasks/:id` también acepta `columnId` y `status`, y
   * ese sigue exigiendo `canEditTask` — el que solo mueve usa esta ruta.
   */
  @Post('tasks/:id/move')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_MOVE_TASK)
  @ApiOperation({ summary: 'Mueve una tarea de columna u orden' })
  @ApiResponse({ status: 200, description: 'Tarea movida exitosamente' })
  async move(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: MoveTaskBodyDto,
  ) {
    /* Lo que convierte «arrastrar a Hecho» en un cierre medible: sin esto, la
       tarea llegaría a la columna verde sin `completedAt` y no contaría en
       ningún tiempo de ciclo. */
    const isClosingColumn = await this.isClosingColumn(body.columnId);

    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'task_move' },
        {
          ...body,
          id,
          projectId: req.projectId,
          requesterId: req.user!.userId,
          isClosingColumn,
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
          projectId: req.projectId,
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
          projectId: req.projectId,
          requesterId: req.user!.userId,
        },
      ),
    );
  }
}
