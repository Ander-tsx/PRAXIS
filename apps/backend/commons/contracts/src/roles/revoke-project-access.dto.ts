import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ProjectPermission } from './project-permission.enum';

export class RevokeProjectAccessDto {
  @IsUUID('4')
  userId: string;

  @IsUUID('4')
  projectId: string;

  @IsOptional()
  @IsEnum(ProjectPermission)
  permission?: ProjectPermission;
}
