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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateWorkspaceBodyDto,
  ProjectPermission,
  UpdateWorkspaceBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { TaskPurgeService } from './task-purge.service';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';

// ─── Colección: workspaces de un proyecto ───────────────────────────────────

@ApiTags('Workspaces')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/workspaces')
export class WorkspacesController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /**
   * Lista todos los workspaces de un proyecto.
   *
   * `canViewProject` es lo que hace cumplir «la membresía basta»: sin el
   * decorador, el guard deja pasar a cualquiera con sesión. Ver la nota larga en
   * `members.controller.ts`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Lista todos los workspaces de un proyecto' })
  @ApiResponse({ status: 200, description: 'Lista de workspaces recuperada' })
  @ApiResponse({ status: 403, description: 'No eres miembro de este proyecto' })
  findAll(@Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_find_all' }, { projectId: req.projectId }),
    );
  }

  /** Crea un workspace dentro de un proyecto (requiere canEditBoard) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_BOARD)
  @ApiOperation({ summary: 'Crea un workspace dentro de un proyecto' })
  @ApiResponse({ status: 201, description: 'Workspace creado exitosamente' })
  create(@Request() req: Express.Request, @Body() body: CreateWorkspaceBodyDto) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'workspace_create' },
        { projectId: req.projectId, ...body },
      ),
    );
  }
}

// ─── Elemento individual ────────────────────────────────────────────────────

@ApiTags('Workspaces')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('workspaces')
export class WorkspacesResourceController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    private readonly taskPurge: TaskPurgeService,
  ) {}

  /**
   * Detalle de un workspace por ID.
   *
   * `canViewProject` hace cumplir «la membresía basta»; el guard resuelve el
   * proyecto desde el `:workspaceId`. Ver `members.controller.ts`.
   */
  @Get(':workspaceId')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Detalle de un workspace por ID' })
  @ApiResponse({ status: 200, description: 'Detalle del workspace recuperado' })
  @ApiResponse({ status: 403, description: 'No eres miembro de este proyecto' })
  findOne(@Param('workspaceId') workspaceId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_find_one' }, { id: workspaceId }),
    );
  }

  /** Actualiza un workspace (requiere canEditBoard) */
  @Patch(':workspaceId')
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_BOARD)
  @ApiOperation({ summary: 'Actualiza un workspace' })
  @ApiResponse({ status: 200, description: 'Workspace actualizado exitosamente' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Body() body: UpdateWorkspaceBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_update' }, { id: workspaceId, ...body }),
    );
  }

  /** Elimina un workspace (requiere canDeleteBoard) */
  @Delete(':workspaceId')
  @RequireProjectPermission(ProjectPermission.CAN_DELETE_BOARD)
  @ApiOperation({ summary: 'Elimina un workspace' })
  @ApiResponse({ status: 200, description: 'Workspace eliminado exitosamente' })
  async delete(@Param('workspaceId') workspaceId: string) {
    /**
     * Los tableros se leen **antes** de borrar el espacio: el borrado los
     * arrastra en cascada dentro de projects-service, y después ya no habría
     * forma de saber qué tareas se quedaron sin sitio.
     */
    const boards = await firstValueFrom(
      this.projectsClient.send({ cmd: 'board_find_all' }, { workspaceId }),
    ).catch(() => [] as Array<{ id: string }>);

    const result = await firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_delete' }, { id: workspaceId }),
    );

    await this.taskPurge.afterBoardsDeleted((boards ?? []).map((b) => b.id));
    return result;
  }
}
