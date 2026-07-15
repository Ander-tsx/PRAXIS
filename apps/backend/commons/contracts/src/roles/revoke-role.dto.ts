import { IsString, IsUUID } from 'class-validator';

export class RevokeRoleDto {
  @IsUUID('4')
  userId: string;

  @IsString()
  roleName: string;
}
