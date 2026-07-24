import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateProjectRoleDto {
  @IsUUID('4')
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsObject()
  @IsNotEmpty()
  permissions: {
    canCreateBoard?: boolean;
    canEditBoard?: boolean;
    canDeleteBoard?: boolean;
    canCreateColumn?: boolean;
    canEditColumn?: boolean;
    canDeleteColumn?: boolean;
    canCreateTask?: boolean;
    canEditTask?: boolean;
    canDeleteTask?: boolean;
    canManageMembers?: boolean;
    canManageRoles?: boolean;
  };
}

export class UpdateProjectRoleDto {
  @IsUUID('4')
  @IsNotEmpty()
  id: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsObject()
  permissions?: Record<string, boolean>;
}

export class DeleteProjectRoleDto {
  @IsUUID('4')
  @IsNotEmpty()
  id: string;
}

export class CheckProjectPermissionDto {
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @IsUUID('4')
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  permission: string;
}
