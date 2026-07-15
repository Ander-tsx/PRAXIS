import { IsIn, IsUUID } from 'class-validator';

export type Role = 'admin' | 'user';

export class CheckPermissionDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  projectId: string;

  @IsIn(['admin', 'user'])
  role: Role;
}
