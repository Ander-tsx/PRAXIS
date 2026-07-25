import { IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectRoleDto {
  @IsUUID('4')
  projectId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    description: 'Diccionario de permisos asignados al rol',
  })
  @IsObject()
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
  id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    description: 'Diccionario de permisos del rol',
  })
  @IsOptional()
  @IsObject()
  permissions?: Record<string, boolean>;
}

export class DeleteProjectRoleDto {
  @IsUUID('4')
  id: string;
}

export class CheckProjectPermissionDto {
  @IsUUID('4')
  userId: string;

  @IsUUID('4')
  projectId: string;

  @IsString()
  permission: string;
}
