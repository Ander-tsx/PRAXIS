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
import { FindMyTasksQueryDto } from '@praxis/contracts';

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

    return firstValueFrom(
      this.tasksClient.send({ cmd: 'task_find_mine' }, { ...query, userId, projectIds }),
    );
  }
}
