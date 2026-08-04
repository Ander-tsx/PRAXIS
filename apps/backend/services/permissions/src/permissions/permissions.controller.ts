import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  AssignRoleDto,
  RevokeRoleDto,
  CheckRoleDto,
  GetRolesForUsersDto,
  GetUserRolesDto,
  type GlobalRole,
  SetUserRoleDto,
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

  /**
   * Cuántas cuentas tienen un rol, y quiénes.
   *
   * Lo consumen las invariantes de administración: no dejar el sistema sin
   * SuperAdmin, ni por revocar el rol ni por suspender la cuenta.
   */
  @MessagePattern({ cmd: 'permission_count_role_holders' })
  countRoleHolders(@Payload() dto: { roleName: GlobalRole }) {
    return this.permissionsService.countRoleHolders(dto);
  }

  /** Fija el rol global de una cuenta, reemplazando los que tuviera. */
  @MessagePattern({ cmd: 'permission_set_user_role' })
  setUserRole(@Payload() dto: SetUserRoleDto) {
    return this.permissionsService.setUserRole(dto);
  }

  /** Los roles de varias cuentas de una vez, para el listado del panel. */
  @MessagePattern({ cmd: 'permission_get_roles_for_users' })
  getRolesForUsers(@Payload() dto: GetRolesForUsersDto) {
    return this.permissionsService.getRolesForUsers(dto);
  }
}
