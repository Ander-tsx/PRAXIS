import { IsIn, IsNotEmpty, IsUUID } from 'class-validator';

export type Role = 'admin' | 'user';

export class CheckPermissionDto {
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @IsUUID('4')
  @IsNotEmpty()
  projectId: string;

  @IsIn(['admin', 'user'])
  @IsNotEmpty()
  role: Role;
}
