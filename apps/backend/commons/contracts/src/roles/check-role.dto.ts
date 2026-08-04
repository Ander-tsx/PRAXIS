import { IsIn, IsUUID } from 'class-validator';
import { GLOBAL_ROLES, type GlobalRole } from './global-role';

export class CheckRoleDto {
  /** Sin versión, por lo que explica `AssignRoleDto`: los ids del seed no son v4. */
  @IsUUID()
  userId: string;

  @IsIn(Object.values(GLOBAL_ROLES), {
    message: `roleName debe ser uno de: ${Object.values(GLOBAL_ROLES).join(', ')}`,
  })
  roleName: GlobalRole;
}
