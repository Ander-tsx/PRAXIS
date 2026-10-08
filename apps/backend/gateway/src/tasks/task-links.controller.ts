import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateTaskLinkBodyDto, ProjectPermission } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

/**
 * Enlaces adjuntos a una tarea: un Google Doc, un Figma, un PR.
 *
 * Los mismos permisos que los adjuntos (`AttachmentsController`): añadir pide
 * `canEditTask`; quitar uno ajeno, además, poder eliminar tareas. Tiene que estar
 * en `TASK_CONTROLLERS` del guard para que `:taskId` resuelva el proyecto.
 */
@ApiTags('Task links')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('tasks/:taskId/links')
export class TaskLinksController {
  constructor(
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Añade un enlace a una tarea' })
  @ApiResponse({ status: 201, description: 'Enlace añadido' })
  @ApiResponse({ status: 400, description: 'No es una URL http(s)' })
  create(
    @Param('taskId') taskId: string,
    @Request() req: Express.Request,
    @Body() body: CreateTaskLinkBodyDto,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'task_link_create' },
        { ...body, taskId, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }

  /** Lo quita quien lo añadió, o quien pueda eliminar tareas. */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Quita un enlace propio, o cualquiera si puedes moderar' })
  @ApiResponse({ status: 200, description: 'Enlace quitado' })
  async delete(
    @Param('taskId') taskId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: Express.Request,
  ) {
    const canModerate = await this.canDeleteTasks(req.user!.userId, req.projectId!);
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'task_link_delete' },
        { id, taskId, projectId: req.projectId, requesterId: req.user!.userId, canModerate },
      ),
    );
  }

  /** ¿Puede eliminar tareas del proyecto? El dueño siempre. Igual que en adjuntos. */
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
      return false;
    }
  }
}
