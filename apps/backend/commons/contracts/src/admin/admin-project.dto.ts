import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Estado administrativo de un proyecto. Espejo del enum de projects-service.
 *
 * ⚠️ `DELETED` **no es** el `DELETE /projects/:id` que ya existe. Aquel cascadea,
 * purga las tareas en otro microservicio y es irreversible; se queda con el
 * dueño. Esto es un estado y se deshace.
 */
export enum ProjectStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

/**
 * Los permisos que **siguen funcionando** en un proyecto suspendido.
 *
 * Suspendido significa solo lectura: se ve todo y no se toca nada. Estos dos son
 * los únicos de lectura del catálogo —ver el proyecto y ver sus informes— y todo
 * lo demás implica escribir.
 *
 * ⚠️ Vive aquí, en el contrato, y no dentro del guard, porque **es una decisión de
 * producto y no un detalle de implementación**: añadir un permiso de lectura nuevo
 * y olvidarse de apuntarlo aquí lo convierte en algo que la suspensión bloquea sin
 * que nadie lo haya decidido.
 */
export const READ_ONLY_PROJECT_PERMISSIONS: readonly string[] = [
  'canViewProject',
  'canViewReports',
];

/**
 * Código de error para distinguir «el proyecto está suspendido» de «no tienes
 * permiso».
 *
 * Los dos son 403 y la interfaz tiene que reaccionar distinto: uno se arregla
 * pidiendo permiso a quien administra el proyecto, el otro no se arregla —hay que
 * esperar a que la plataforma lo reactive—. Sin el código, ambos salen como
 * «acceso denegado» y el dueño de un proyecto suspendido va a pedirle permisos a
 * sí mismo.
 */
export const PROJECT_SUSPENDED_CODE = 'PROJECT_SUSPENDED';

/** Cuerpo de `PATCH /admin/projects/:id/status`. */
export class SetProjectStatusBodyDto {
  @ApiProperty({ enum: ProjectStatus })
  @IsEnum(ProjectStatus, {
    message: `status debe ser uno de: ${Object.values(ProjectStatus).join(', ')}`,
  })
  status: ProjectStatus;

  @ApiPropertyOptional({
    description: 'Obligatorio al suspender o archivar. Lo lee el dueño en el aviso del proyecto.',
    minLength: 4,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'El motivo debe tener al menos 4 caracteres' })
  @MaxLength(500, { message: 'El motivo no puede superar 500 caracteres' })
  reason?: string;
}

/** Payload al microservicio. */
export class SetProjectStatusDto {
  @IsUUID()
  id: string;

  @IsEnum(ProjectStatus)
  status: ProjectStatus;

  @IsOptional()
  @IsString()
  reason?: string;

  /** Quién lo hizo. Sale del JWT en el gateway. */
  @IsOptional()
  @IsUUID()
  actorId?: string;
}

/**
 * Filtros del inventario de `GET /admin/projects`.
 *
 * Es otra ruta y no un parámetro de `GET /projects` a propósito: aquel filtra por
 * dueño o miembro —es «tus proyectos»— y añadirle una forma de ver todos sería
 * poner un interruptor de bypass en la ruta que usa cualquiera. Aquí el alcance es
 * la plataforma entera desde el principio, y por eso está detrás del rol.
 */
export class FindAdminProjectsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Busca por nombre o descripción' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
