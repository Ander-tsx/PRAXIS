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
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  ProjectPermission,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';

@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/workspaces')
export class WorkspacesController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** Crea un workspace dentro de un proyecto (requiere canEditBoard) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_BOARD)
  create(
    @Param('projectId') projectId: string,
    @Body() body: Omit<CreateWorkspaceDto, 'projectId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_create' }, { projectId, ...body }),
    );
  }

  /** Lista todos los workspaces de un proyecto (la membresía basta) */
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(@Param('projectId') projectId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_find_all' }, { projectId }),
    );
  }

  /** Actualiza un workspace (requiere canEditBoard) */
  @Patch(':id')
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_BOARD)
  update(
    @Param('id') id: string,
    @Body() body: Omit<UpdateWorkspaceDto, 'id'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_update' }, { id, ...body }),
    );
  }

  /** Elimina un workspace (requiere canDeleteBoard) */
  @Delete(':id')
  @RequireProjectPermission(ProjectPermission.CAN_DELETE_BOARD)
  delete(@Param('id') id: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_delete' }, { id }),
    );
  }
}
