import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CloseSprintBodyDto,
  CreateSprintBodyDto,
  ProjectPermission,
  SPRINT_HAS_PENDING_TASKS_CODE,
  SprintCloseAction,
  StartSprintBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

type SprintRow = { id: string; boardId: string; name: string; status: string };
type PendingTask = { id: string; title: string; columnId: string; status: string };

/**
 * Sprints de un tablero Scrum. Ver `docs/PLAN-SCRUM-KANBAN.md`.
 *
 * Todas las rutas llevan `:boardId`, y es a propósito: así el
 * `ProjectPermissionGuard` resuelve el proyecto por el camino que ya tiene
 * para tableros, sin apuntarse a ninguna lista especial.
 */
@ApiTags('Sprints')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('boards/:boardId/sprints')
export class SprintsController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
  ) {}

  @Get()
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Sprints del tablero, del más nuevo al más viejo' })
  findAll(@Param('boardId') boardId: string) {
    return firstValueFrom(this.projectsClient.send({ cmd: 'sprint_find_by_board' }, { boardId }));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_SPRINT)
  @ApiOperation({ summary: 'Planea un sprint (nace sin fechas; arrancarlo es otro paso)' })
  create(@Param('boardId') boardId: string, @Body() body: CreateSprintBodyDto) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'sprint_create' }, { ...body, boardId }),
    );
  }

  @Post(':sprintId/start')
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_SPRINT)
  @ApiOperation({ summary: 'Arranca un sprint planeado. Como mucho uno activo por tablero' })
  @ApiResponse({ status: 409, description: 'Ya hay un sprint activo en el tablero' })
  start(
    @Param('boardId') boardId: string,
    @Param('sprintId') sprintId: string,
    @Body() body: StartSprintBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'sprint_start' }, { ...body, id: sprintId, boardId }),
    );
  }

  /** Lo que hay que resolver antes de cerrar: las tareas sin `completedAt`. */
  @Get(':sprintId/pending')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Tareas del sprint que todavía no están cerradas' })
  async pending(@Param('boardId') boardId: string, @Param('sprintId') sprintId: string) {
    await this.sprintOfBoard(boardId, sprintId);
    return firstValueFrom(
      this.tasksClient.send({ cmd: 'task_pending_in_sprint' }, { boardId, sprintId }),
    );
  }

  /**
   * Cierra un sprint activo.
   *
   * ⚠️ **Va en el gateway porque cruza dos servicios.** Las tareas viven en
   * tasks-service y el sprint en projects-service, que no se hablan en esa
   * dirección. El orden importa:
   *
   * 1. Comprobar que cada pendiente tiene resolución, o 409 con la lista (D6).
   * 2. Reasignar las tareas en tasks-service.
   * 3. Marcar el sprint `CLOSED` — **el último**, para que si el paso 2 falla
   *    el sprint siga activo y el cierre se pueda reintentar entero, en vez de
   *    quedar un sprint cerrado con tareas todavía apuntándolo.
   */
  @Post(':sprintId/close')
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_SPRINT)
  @ApiOperation({ summary: 'Cierra un sprint, resolviendo qué pasa con lo pendiente' })
  @ApiResponse({ status: 409, description: 'Hay tareas pendientes sin resolver' })
  async close(
    @Param('boardId') boardId: string,
    @Param('sprintId') sprintId: string,
    @Body() body: CloseSprintBodyDto,
  ) {
    const sprint = await this.sprintOfBoard(boardId, sprintId);
    if (sprint.status !== 'ACTIVE') {
      throw new BadRequestException('Solo se puede cerrar un sprint activo');
    }

    const pending: PendingTask[] = await firstValueFrom(
      this.tasksClient.send({ cmd: 'task_pending_in_sprint' }, { boardId, sprintId }),
    );

    const decision = new Map((body.resolutions ?? []).map((r) => [r.taskId, r.action]));
    const sinResolver = pending.filter((task) => !decision.has(task.id));
    if (sinResolver.length > 0) {
      throw new ConflictException({
        code: SPRINT_HAS_PENDING_TASKS_CODE,
        message:
          sinResolver.length === 1
            ? 'Queda una tarea sin terminar. Decide si vuelve al backlog o pasa al siguiente sprint.'
            : `Quedan ${sinResolver.length} tareas sin terminar. Decide si vuelven al backlog o pasan al siguiente sprint.`,
        details: { pending: sinResolver },
      });
    }

    const alSiguiente = pending
      .filter((task) => decision.get(task.id) === SprintCloseAction.NEXT_SPRINT)
      .map((task) => task.id);
    const alBacklog = pending
      .filter((task) => decision.get(task.id) === SprintCloseAction.BACKLOG)
      .map((task) => task.id);

    if (alSiguiente.length > 0) {
      if (!body.nextSprintId) {
        throw new BadRequestException('Falta elegir a qué sprint pasan las tareas');
      }
      const siguiente = await this.sprintOfBoard(boardId, body.nextSprintId);
      if (siguiente.status !== 'PLANNED') {
        throw new BadRequestException(
          'Las tareas solo pueden pasar a un sprint planeado que todavía no haya arrancado',
        );
      }
      await firstValueFrom(
        this.tasksClient.send(
          { cmd: 'task_reassign_sprint' },
          { boardId, fromSprintId: sprintId, taskIds: alSiguiente, toSprintId: siguiente.id },
        ),
      );
    }

    if (alBacklog.length > 0) {
      await firstValueFrom(
        this.tasksClient.send(
          { cmd: 'task_reassign_sprint' },
          { boardId, fromSprintId: sprintId, taskIds: alBacklog, toSprintId: null },
        ),
      );
    }

    return firstValueFrom(
      this.projectsClient.send({ cmd: 'sprint_mark_closed' }, { id: sprintId, boardId }),
    );
  }

  /**
   * El sprint, comprobando que es de este tablero.
   *
   * Sin esto un `:sprintId` de otro tablero pasaría el guard —que solo mira
   * `:boardId`— y se podría operar sobre un sprint ajeno con permiso sobre el
   * tablero propio. Es el mismo agujero que tuvo el `projectId` del cuerpo
   * (`PENDIENTES-BACKEND.md §9`).
   */
  private async sprintOfBoard(boardId: string, sprintId: string): Promise<SprintRow> {
    const sprint: SprintRow = await firstValueFrom(
      this.projectsClient.send({ cmd: 'sprint_find_one' }, { id: sprintId }),
    );
    if (sprint.boardId !== boardId) {
      throw new BadRequestException('Ese sprint no es de este tablero');
    }
    return sprint;
  }
}
