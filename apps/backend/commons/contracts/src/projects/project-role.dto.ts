import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { IsPermissionMap } from '../roles/is-permission-map.validator';
import { PROJECT_PERMISSIONS } from '../roles/project-permission.enum';

/** Mapa de permisos de un rol: claves del enum, valores booleanos. */
export type PermissionMap = Partial<Record<string, boolean>>;

const PERMISSIONS_API = {
    type: 'object',
    additionalProperties: { type: 'boolean' },
    description:
        'Diccionario de permisos. Claves válidas: ' +
        PROJECT_PERMISSIONS.join(', ') +
        '. Un array se rechaza: el evaluador hace permisos[clave] y sobre un array daría undefined.',
    example: { canViewProject: true, canEditTask: true },
} as const;

/** Cuerpo de `POST /projects/:projectId/roles`. */
export class CreateProjectRoleBodyDto {
    @IsString()
    @MinLength(2)
    @MaxLength(50)
    name: string;

    @ApiProperty(PERMISSIONS_API)
    @IsPermissionMap()
    permissions: PermissionMap;
}

/** Payload al microservicio: el cuerpo más el projectId de la ruta. */
export class CreateProjectRoleDto extends CreateProjectRoleBodyDto {
    @IsUUID('4')
    projectId: string;
}

/** Cuerpo de `PATCH /projects/:projectId/roles/:id`. */
export class UpdateProjectRoleBodyDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(50)
    name?: string;

    @ApiPropertyOptional(PERMISSIONS_API)
    @IsOptional()
    @IsPermissionMap()
    permissions?: PermissionMap;
}

export class UpdateProjectRoleDto extends UpdateProjectRoleBodyDto {
    @IsUUID('4')
    id: string;
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
