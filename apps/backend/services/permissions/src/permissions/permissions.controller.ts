import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  AssignRoleDto,
  RevokeRoleDto,
  CheckRoleDto,
  GetUserRolesDto,
} from '@praxis/contracts';

import { PermissionsService } from './permissions.service';

@Controller()
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @MessagePattern({ cmd: 'permission_find_all_roles' })
  findAll() {
    return this.permissionsService.findAll();
  }

  @MessagePattern({ cmd: 'permission_assign_role' })
  assign(@Payload() dto: AssignRoleDto) {
    return this.permissionsService.assign(dto);
  }

  @MessagePattern({ cmd: 'permission_revoke_role' })
  revoke(@Payload() dto: RevokeRoleDto) {
    return this.permissionsService.revoke(dto);
  }

  @MessagePattern({ cmd: 'permission_get_user_roles' })
  getUserRoles(@Payload() dto: GetUserRolesDto) {
    return this.permissionsService.getUserRoles(dto.userId);
  }

  @MessagePattern({ cmd: 'permission_check_role' })
  checkRole(@Payload() dto: CheckRoleDto) {
    return this.permissionsService.checkRole(dto);
  }
}
