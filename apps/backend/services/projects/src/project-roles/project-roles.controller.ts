import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateProjectRoleDto,
  UpdateProjectRoleDto,
  DeleteProjectRoleDto,
  CheckProjectPermissionDto,
} from '@praxis/contracts';
import { ProjectRolesService } from './project-roles.service';

@Controller()
export class ProjectRolesController {
  constructor(private readonly projectRolesService: ProjectRolesService) {}

  @MessagePattern({ cmd: 'project_role_create' })
  createProjectRole(@Payload() dto: CreateProjectRoleDto) {
    return this.projectRolesService.createProjectRole(dto);
  }

  @MessagePattern({ cmd: 'project_role_update' })
  updateProjectRole(@Payload() dto: UpdateProjectRoleDto) {
    return this.projectRolesService.updateProjectRole(dto);
  }

  @MessagePattern({ cmd: 'project_role_delete' })
  deleteProjectRole(@Payload() dto: DeleteProjectRoleDto) {
    return this.projectRolesService.deleteProjectRole(dto.id);
  }

  @MessagePattern({ cmd: 'project_check_permission' })
  checkPermission(@Payload() dto: CheckProjectPermissionDto) {
    return this.projectRolesService.checkPermission(dto);
  }

  /** Todos los permisos efectivos de un usuario en un proyecto, ya expandidos. */
  @MessagePattern({ cmd: 'project_effective_permissions' })
  effectivePermissions(@Payload() dto: { userId: string; projectId: string }) {
    return this.projectRolesService.getEffectivePermissions(dto);
  }
}
