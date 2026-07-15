import { IsString, IsUUID, IsOptional } from 'class-validator';

export class AssignRoleDto {
  @IsUUID('4')
  userId: string;

  @IsString()
  roleName: string;
}
