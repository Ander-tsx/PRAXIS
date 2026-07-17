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

  /** Crea un workspace dentro de un proyecto */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.EDIT)
  create(
    @Param('projectId') projectId: string,
    @Body() body: Omit<CreateWorkspaceDto, 'projectId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_create' }, { projectId, ...body }),
    );
  }

  /** Lista todos los workspaces de un proyecto */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.VIEW)
  findAll(@Param('projectId') projectId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_find_all' }, { projectId }),
    );
  }

  /** Actualiza un workspace */
  @Patch(':id')
  @RequireProjectPermission(ProjectPermission.EDIT)
  update(
    @Param('id') id: string,
    @Body() body: Omit<UpdateWorkspaceDto, 'id'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_update' }, { id, ...body }),
    );
  }

  /** Elimina un workspace */
  @Delete(':id')
  @RequireProjectPermission(ProjectPermission.EDIT)
  delete(@Param('id') id: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'workspace_delete' }, { id }),
    );
  }
}
