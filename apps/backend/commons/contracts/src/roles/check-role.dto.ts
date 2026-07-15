import { IsString, IsUUID } from 'class-validator';

export class CheckRoleDto {
  @IsUUID('4')
  userId: string;

  @IsString()
  roleName: string;
}
