import { IsEnum, IsUUID } from 'class-validator';
import { ProjectPermission } from './project-permission.enum';

export class GrantProjectAccessDto {
  @IsUUID('4')
  userId: string;

  @IsUUID('4')
  projectId: string;

  @IsEnum(ProjectPermission)
  permission: ProjectPermission;
}
