import {
  Body,
  Controller,
  Delete,
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
  CreateProjectRoleDto,
  UpdateProjectRoleDto,
  ProjectPermission,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';

@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/roles')
export class ProjectRolesController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** Crea un rol local dentro de un proyecto */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.EDIT)
  create(
    @Param('projectId') projectId: string,
    @Body() body: Omit<CreateProjectRoleDto, 'projectId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_role_create' }, { projectId, ...body }),
    );
  }

  /** Actualiza un rol local (permisos, nombre) */
  @Patch(':id')
  @RequireProjectPermission(ProjectPermission.EDIT)
  update(
    @Param('id') id: string,
    @Body() body: Omit<UpdateProjectRoleDto, 'id'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_role_update' }, { id, ...body }),
    );
  }

  /** Elimina un rol local del proyecto */
  @Delete(':id')
  @RequireProjectPermission(ProjectPermission.EDIT)
  delete(@Param('id') id: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_role_delete' }, { id }),
    );
  }
}
