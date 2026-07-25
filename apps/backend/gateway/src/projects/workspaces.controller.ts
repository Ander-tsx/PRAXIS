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
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  ProjectPermission,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
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

  /** Lista todos los workspaces de un proyecto (la membresía basta) */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lista todos los workspaces de un proyecto' })
  @ApiResponse({ status: 200, description: 'Lista de workspaces recuperada' })
  findAll(@Param('projectId') projectId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_find_all' }, { projectId }),
    );
  }

  /** Crea un workspace dentro de un proyecto (requiere canEditBoard) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_BOARD)
  @ApiOperation({ summary: 'Crea un workspace dentro de un proyecto' })
  @ApiResponse({ status: 201, description: 'Workspace creado exitosamente' })
  create(
    @Param('projectId') projectId: string,
    @Body() body: Omit<CreateWorkspaceDto, 'projectId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_create' }, { projectId, ...body }),
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
  ) {}

  /** Detalle de un workspace por ID (la membresía basta) */
  @Get(':workspaceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detalle de un workspace por ID' })
  @ApiResponse({ status: 200, description: 'Detalle del workspace recuperado' })
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
    @Body() body: Omit<UpdateWorkspaceDto, 'id'>,
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
  delete(@Param('workspaceId') workspaceId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_delete' }, { id: workspaceId }),
    );
  }
}
