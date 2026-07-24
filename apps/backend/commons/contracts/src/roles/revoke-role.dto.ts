import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class RevokeRoleDto {
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  roleName: string;
}
