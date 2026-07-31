import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { DONE_COLUMN_COLOR, FindMyTasksQueryDto } from '@praxis/contracts';

/** Suficiente para cubrir a quien esté en muchos proyectos sin paginar aquí. */
const MAX_PROJECTS = 100;

/**
 * Las tareas de quien pregunta.
 *
 * Cuelga de `/me` como las invitaciones, y por el mismo motivo: no hay ningún
 * proyecto en la ruta contra el que `ProjectPermissionGuard` pueda comprobar
 * nada, porque la respuesta cruza todos los proyectos de la persona. La
 * autorización es que **solo puedes pedir las tuyas**: el usuario sale del
 * token, no de la query.
 *
 * Por eso no existe `GET /tasks?assigneeId=…`, que era la forma pedida en
 * `PENDIENTES-BACKEND.md §5`: con el id como parámetro cualquiera consultaría
 * las tareas de cualquiera.
 */
@ApiTags('My Tasks')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/tasks')
export class MyTasksController {
  constructor(
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tareas asignadas a quien hace la petición' })
  @ApiResponse({ status: 200, description: 'Lista de tareas recuperada' })
  async findMine(@Request() req: Express.Request, @Query() query: FindMyTasksQueryDto) {
    const userId = req.user!.userId;

    /**
     * Los proyectos donde sigue estando, que acotan la búsqueda.
     *
     * Quitar a alguien de un proyecto **no** borra sus filas de `TaskAssignee`,
     * así que sin este filtro seguiría viendo tareas de un sitio del que ya
     * salió. Se resuelve aquí y no en tasks-service para no encadenar dos saltos
     * en una ruta que el panel pide en cada carga.
     */
    const projects = await firstValueFrom(
      this.projectsClient.send(
        { cmd: 'project_find_all' },
        { userId, query: { page: 1, limit: MAX_PROJECTS } },
      ),
    );

    const projectIds = (projects?.items ?? []).map((p: { id: string }) => p.id);

    const result = await firstValueFrom(
      this.tasksClient.send({ cmd: 'task_find_mine' }, { ...query, userId, projectIds }),
    );

    if (!query.excludeDone) return result;
    return this.withoutFinishedTasks(result);
  }

  /**
   * Quita las tareas que ya están en una **columna de cierre** (la verde).
   *
   * Se hace aquí y no en tasks-service porque la tarea guarda `columnId` pero
   * las columnas viven en projects-service, y hacer que tasks las pidiera
   * encadenaría gateway → tasks → projects en una ruta que el panel llama en
   * cada carga. El gateway ya habla con los dos.
   *
   * Se filtra **después** de consultar, no antes: para saber qué columnas
   * excluir hay que conocer las de las tareas que salieron, y ese conjunto solo
   * existe una vez hecha la consulta. La consecuencia es que `limit` se aplica
   * antes del filtro, así que se puede devolver menos de lo pedido. Es preferible
   * a la alternativa —traer las columnas de todos sus proyectos por si acaso—
   * para un panel que pide 50.
   *
   * Si projects-service falla, se devuelven las tareas **sin filtrar**: enseñar
   * de más en un aviso es mucho mejor que tumbar el panel entero.
   */
  private async withoutFinishedTasks(result: { items?: Task[]; total?: number }) {
    const items: Task[] = result?.items ?? [];
    if (items.length === 0) return result;

    const columnIds = [...new Set(items.map((task) => task.columnId).filter(Boolean))];

    let doneColumnIds: Set<string>;
    try {
      const columns = await firstValueFrom(
        this.projectsClient.send({ cmd: 'column_find_by_ids' }, { ids: columnIds }),
      );
      doneColumnIds = new Set(
        (columns ?? [])
          .filter((column: { color: string }) => column.color === DONE_COLUMN_COLOR)
          .map((column: { id: string }) => column.id),
      );
    } catch {
      return result;
    }

    if (doneColumnIds.size === 0) return result;

    const remaining = items.filter((task) => !doneColumnIds.has(task.columnId));
    return {
      items: remaining,
      // El total describe lo que se devuelve; dejar el de antes diría que hay
      // pendientes escondidas detrás de una paginación que no existe.
      total: remaining.length,
    };
  }
}

/** Lo único que hace falta de una tarea para decidir si sigue pendiente. */
interface Task {
  columnId: string;
}
