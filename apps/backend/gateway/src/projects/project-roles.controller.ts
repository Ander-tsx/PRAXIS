import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
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
  CreateProjectRoleBodyDto,
  ProjectPermission,
  UpdateProjectRoleBodyDto,
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
  @ApiResponse({ status: 400, description: 'permissions mal formado o con claves desconocidas' })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: CreateProjectRoleBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_role_create' }, { ...body, projectId }),
    );
  }

  /** Actualiza un rol local — permisos y nombre (requiere canManageRoles) */
  @Patch(':id')
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_ROLES)
  @ApiOperation({ summary: 'Actualiza un rol local de un proyecto' })
  @ApiResponse({ status: 200, description: 'Rol actualizado exitosamente' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectRoleBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_role_update' }, { ...body, id }),
    );
  }

  /** Elimina un rol local del proyecto (requiere canManageRoles) */
  @Delete(':id')
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_ROLES)
  @ApiOperation({ summary: 'Elimina un rol local del proyecto' })
  @ApiResponse({ status: 200, description: 'Rol eliminado exitosamente' })
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_role_delete' }, { id }),
    );
  }
}
