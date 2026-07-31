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
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import {
  CreateCommentBodyDto,
  ProjectPermission,
  UpdateCommentBodyDto,
} from '@praxis/contracts';

/**
 * Comentarios de una tarea.
 *
 * El `projectId` sale de `req.projectId`, que el guard resuelve desde el
 * `:taskId`, igual que en checklists.
 *
 * ⚠️ **Escribir exige `canEditTask`.** No hay un permiso de comentar, así que
 * un perfil de solo lectura —cliente, dirección— puede leer el hilo pero no
 * participar. Es una limitación real y está anotada en
 * `PENDIENTES-BACKEND.md §17`; no inventamos un permiso nuevo sin acordarlo.
 */
@ApiTags('Task Comments')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('tasks/:taskId/comments')
export class CommentsController {
  constructor(
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Comentarios de una tarea, del más antiguo al más nuevo' })
  @ApiResponse({ status: 200, description: 'Lista de comentarios' })
  findAll(@Param('taskId') taskId: string, @Request() req: Express.Request) {
    return firstValueFrom(
      this.tasksClient.send({ cmd: 'comment_find_all' }, { taskId, projectId: req.projectId }),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_COMMENT)
  @ApiOperation({ summary: 'Comenta en una tarea' })
  @ApiResponse({ status: 201, description: 'Comentario creado' })
  create(
    @Param('taskId') taskId: string,
    @Request() req: Express.Request,
    @Body() body: CreateCommentBodyDto,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'comment_create' },
        { ...body, taskId, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }

  /** Editar es solo del autor; el microservicio lo comprueba. */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_COMMENT)
  @ApiOperation({ summary: 'Edita un comentario propio' })
  @ApiResponse({ status: 200, description: 'Comentario actualizado' })
  update(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: UpdateCommentBodyDto,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'comment_update' },
        { ...body, id, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }

  /**
   * Lo borra su autor, o quien pueda eliminar tareas.
   *
   * El permiso de moderación se resuelve **aquí** y viaja como `canModerate`:
   * el guard solo puede exigir un permiso por ruta, y esta admite dos vías
   * distintas. Consultarlo en tasks-service sería otro salto de red para algo
   * que el gateway ya tiene a mano.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_COMMENT)
  @ApiOperation({ summary: 'Elimina un comentario propio, o cualquiera si puedes moderar' })
  @ApiResponse({ status: 200, description: 'Comentario eliminado' })
  async delete(@Param('id') id: string, @Request() req: Express.Request) {
    const canModerate = await this.canDeleteTasks(req.user!.userId, req.projectId!);

    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'comment_delete' },
        { id, projectId: req.projectId, requesterId: req.user!.userId, canModerate },
      ),
    );
  }

  /** ¿Puede esta persona eliminar tareas del proyecto? El dueño siempre. */
  private async canDeleteTasks(userId: string, projectId: string): Promise<boolean> {
    try {
      const project = await firstValueFrom(
        this.projectsClient.send({ cmd: 'project_find_one' }, { id: projectId }),
      );
      if (project?.ownerId === userId) return true;

      const { allowed } = await firstValueFrom(
        this.projectsClient.send(
          { cmd: 'project_check_permission' },
          { userId, projectId, permission: ProjectPermission.CAN_DELETE_TASK },
        ),
      );
      return !!allowed;
    } catch {
      // Ante la duda, no se modera: solo podrá borrar sus propios comentarios.
      return false;
    }
  }
}
