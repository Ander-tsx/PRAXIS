import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  AssignRoleDto,
  RevokeRoleDto,
  CheckRoleDto,
  GetUserRolesDto,
  GrantProjectAccessDto,
  RevokeProjectAccessDto,
  GetUserProjectAccessDto,
  CheckProjectAccessDto,
} from '@praxis/contracts';

import { RolesService } from './roles.service';

@Controller()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @MessagePattern({ cmd: 'role_find_all' })
  findAll() {
    return this.rolesService.findAll();
  }

  @MessagePattern({ cmd: 'role_assign' })
  assign(@Payload() dto: AssignRoleDto) {
    return this.rolesService.assign(dto);
  }

  @MessagePattern({ cmd: 'role_revoke' })
  revoke(@Payload() dto: RevokeRoleDto) {
    return this.rolesService.revoke(dto);
  }

  @MessagePattern({ cmd: 'role_get_user_roles' })
  getUserRoles(@Payload() dto: GetUserRolesDto) {
    return this.rolesService.getUserRoles(dto.userId);
  }

  @MessagePattern({ cmd: 'role_check' })
  checkRole(@Payload() dto: CheckRoleDto) {
    return this.rolesService.checkRole(dto);
  }


  @MessagePattern({ cmd: 'project_access_grant' })
  grantProjectAccess(@Payload() dto: GrantProjectAccessDto) {
    return this.rolesService.grantProjectAccess(dto);
  }

  @MessagePattern({ cmd: 'project_access_revoke' })
  revokeProjectAccess(@Payload() dto: RevokeProjectAccessDto) {
    return this.rolesService.revokeProjectAccess(dto);
  }

  @MessagePattern({ cmd: 'project_access_get_user' })
  getUserProjectAccess(@Payload() dto: GetUserProjectAccessDto) {
    return this.rolesService.getUserProjectAccess(dto.userId);
  }

  @MessagePattern({ cmd: 'project_access_check' })
  checkProjectAccess(@Payload() dto: CheckProjectAccessDto) {
    return this.rolesService.checkProjectAccess(dto);
  }

  @MessagePattern({ cmd: 'project_access_get_by_project' })
  getProjectUsers(@Payload() dto: { projectId: string }) {
    return this.rolesService.getProjectUsers(dto.projectId);
  }
}
