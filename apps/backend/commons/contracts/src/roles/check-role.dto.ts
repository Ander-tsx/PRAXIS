import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CheckRoleDto {
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  roleName: string;
}
