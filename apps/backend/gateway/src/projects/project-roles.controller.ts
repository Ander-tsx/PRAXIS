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
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateProjectRoleDto,
  UpdateProjectRoleDto,
  ProjectPermission,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';

@ApiTags('Project Roles')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/roles')
export class ProjectRolesController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** Crea un rol local dentro de un proyecto (requiere canManageRoles) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_ROLES)
  @ApiOperation({ summary: 'Crea un rol local dentro de un proyecto' })
  @ApiResponse({ status: 201, description: 'Rol creado exitosamente' })
  create(
    @Param('projectId') projectId: string,
    @Body() body: Omit<CreateProjectRoleDto, 'projectId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_role_create' }, { projectId, ...body }),
    );
  }

  /** Actualiza un rol local — permisos y nombre (requiere canManageRoles) */
  @Patch(':id')
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_ROLES)
  @ApiOperation({ summary: 'Actualiza un rol local de un proyecto' })
  @ApiResponse({ status: 200, description: 'Rol actualizado exitosamente' })
  update(
    @Param('id') id: string,
    @Body() body: Omit<UpdateProjectRoleDto, 'id'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_role_update' }, { id, ...body }),
    );
  }

  /** Elimina un rol local del proyecto (requiere canManageRoles) */
  @Delete(':id')
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_ROLES)
  @ApiOperation({ summary: 'Elimina un rol local del proyecto' })
  @ApiResponse({ status: 200, description: 'Rol eliminado exitosamente' })
  delete(@Param('id') id: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_role_delete' }, { id }),
    );
  }
}
