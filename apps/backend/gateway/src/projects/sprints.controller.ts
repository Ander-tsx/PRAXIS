import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AddTasksToSprintBodyDto,
  CloseSprintBodyDto,
  CreateSprintBodyDto,
  ProjectPermission,
  SPRINT_HAS_PENDING_TASKS_CODE,
  SprintCloseAction,
  StartSprintBodyDto,
  UpdateSprintBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

type SprintRow = {
  id: string;
  boardId: string;
  name: string;
  status: string;
  closedAt?: string | null;
};

/** Sprints cerrados que entran en la velocidad. El mismo número que usa PRAX. */
const SPRINTS_DE_VELOCIDAD = 3;
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
  private readonly log = new Logger(SprintsController.name);

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
    return firstValueFrom(this.projectsClient.send({ cmd: 'sprint_create' }, { ...body, boardId }));
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

  /**
   * Lo que la pantalla necesita para el burndown y la velocidad: el sprint en
   * curso, el planeado y los últimos cerrados, con una fila mínima por tarea.
   *
   * Existe porque la pantalla lo calculaba sobre las cien primeras tareas del
   * tablero y los números se recortaban en silencio (auditoría S2).
   */
  @Get('metrics')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Filas mínimas por tarea para burndown y velocidad' })
  async metrics(@Param('boardId') boardId: string) {
    const sprints: SprintRow[] = await firstValueFrom(
      this.projectsClient.send({ cmd: 'sprint_find_by_board' }, { boardId }),
    );
    const cerrados = sprints
      .filter((s) => s.status === 'CLOSED')
      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))
      .slice(0, SPRINTS_DE_VELOCIDAD);
    const ids = [
      ...sprints.filter((s) => s.status !== 'CLOSED').map((s) => s.id),
      ...cerrados.map((s) => s.id),
    ];
    const tasks = await firstValueFrom(
      this.tasksClient.send({ cmd: 'task_sprint_metric_rows' }, { sprintIds: ids }),
    );
    return { velocitySprintIds: cerrados.map((s) => s.id), tasks };
  }

  @Patch(':sprintId')
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_SPRINT)
  @ApiOperation({ summary: 'Nombre, meta y fechas. De uno en curso, solo el final' })
  update(
    @Param('boardId') boardId: string,
    @Param('sprintId') sprintId: string,
    @Body() body: UpdateSprintBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'sprint_update' }, { ...body, id: sprintId, boardId }),
    );
  }

  /**
   * Descarta un sprint planeado. Sus tareas vuelven al backlog **antes** de
   * borrarlo: al revés, quedarían apuntando a un sprint que ya no existe.
   */
  @Delete(':sprintId')
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_SPRINT)
  @ApiOperation({ summary: 'Descarta un sprint planeado; sus tareas vuelven al backlog' })
  async remove(@Param('boardId') boardId: string, @Param('sprintId') sprintId: string) {
    const sprint = await this.sprintOfBoard(boardId, sprintId);
    if (sprint.status !== 'PLANNED') {
      throw new ConflictException('Solo se puede descartar un sprint que todavía no ha empezado');
    }
    const suyas: { id: string }[] = await firstValueFrom(
      this.tasksClient.send(
        { cmd: 'task_find_all' },
        { boardId, sprintId, query: { limit: 10_000 } },
      ),
    ).then((page: { items: { id: string }[] }) => page.items);
    await firstValueFrom(
      this.tasksClient.send(
        { cmd: 'task_reassign_sprint' },
        { boardId, fromSprintId: sprintId, taskIds: suyas.map((t) => t.id), toSprintId: null },
      ),
    );
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'sprint_delete_planned' }, { id: sprintId, boardId }),
    );
  }

  /** Mete tareas del backlog en un sprint planeado o en curso, en bloque. */
  @Post(':sprintId/tasks')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_SPRINT)
  @ApiOperation({ summary: 'Mete un lote de tareas del backlog en el sprint' })
  async addTasks(
    @Param('boardId') boardId: string,
    @Param('sprintId') sprintId: string,
    @Body() body: AddTasksToSprintBodyDto,
  ) {
    const sprint = await this.sprintOfBoard(boardId, sprintId);
    if (sprint.status === 'CLOSED') {
      throw new ConflictException('Ese sprint ya está cerrado');
    }
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'task_reassign_sprint' },
        { boardId, fromSprintId: null, taskIds: body.taskIds, toSprintId: sprintId },
      ),
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

    /**
     * El siguiente sprint: el que se pida, el planeado que ya haya, o uno nuevo.
     * Nace **planeado**, no en marcha — entre sprint y sprint va la
     * planificación. Antes lo creaba y arrancaba el cliente con tres llamadas
     * sueltas, y un fallo a mitad dejaba sprints huérfanos o tareas en un
     * planeado que ninguna pantalla enseñaba (auditoría S4).
     */
    let siguiente: SprintRow | null = null;
    let creadoAqui = false;
    if (alSiguiente.length > 0) {
      if (body.nextSprintId) {
        siguiente = await this.sprintOfBoard(boardId, body.nextSprintId);
      } else {
        siguiente = await firstValueFrom(
          this.projectsClient.send({ cmd: 'sprint_find_planned' }, { boardId }),
        );
        if (!siguiente) {
          siguiente = await firstValueFrom(
            this.projectsClient.send(
              { cmd: 'sprint_create' },
              { boardId, name: body.nextName ?? 'Siguiente sprint' },
            ),
          );
          creadoAqui = true;
        }
      }
      if (!siguiente || siguiente.status !== 'PLANNED') {
        throw new BadRequestException(
          'Las tareas solo pueden pasar a un sprint planeado que todavía no haya arrancado',
        );
      }
    }

    try {
      if (siguiente) {
        await firstValueFrom(
          this.tasksClient.send(
            { cmd: 'task_reassign_sprint' },
            {
              boardId,
              fromSprintId: sprintId,
              taskIds: alSiguiente,
              toSprintId: siguiente.id,
              carry: true,
            },
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
    } catch (error) {
      /* Si el planeado lo creó este cierre y no llegó a recibir nada, se
         descarta: un reintento no debe ir dejando sprints vacíos por el camino. */
      if (creadoAqui && siguiente) {
        await firstValueFrom(
          this.projectsClient.send({ cmd: 'sprint_delete_planned' }, { id: siguiente.id, boardId }),
        ).catch((e: unknown) => this.log.warn(`No se pudo descartar el sprint: ${String(e)}`));
      }
      throw error;
    }

    /* Lo terminado se cuenta **después** de reasignar: lo que queda apuntando
       a este sprint es exactamente lo que se hizo en él. */
    const [resumen] = await firstValueFrom(
      this.tasksClient.send<{ hechas: number; puntosHechos: number; estimadas: number }[]>(
        { cmd: 'task_sprint_summary' },
        { sprintIds: [sprintId] },
      ),
    ).catch(() => [] as { hechas: number; puntosHechos: number; estimadas: number }[]);
    const summary = {
      hechas: resumen?.hechas ?? 0,
      puntosHechos: resumen?.puntosHechos ?? 0,
      alSiguiente: alSiguiente.length,
      alBacklog: alBacklog.length,
    };

    const cerrado = await firstValueFrom(
      this.projectsClient.send({ cmd: 'sprint_mark_closed' }, { id: sprintId, boardId, summary }),
    );
    return { ...cerrado, nextSprintId: siguiente?.id ?? null };
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
