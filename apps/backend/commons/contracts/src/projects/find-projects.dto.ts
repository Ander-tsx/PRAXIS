import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { QueryOptionsDto, SortOrder } from '../pagination.dto';
import { ProjectPermission } from '../roles/project-permission.enum';

export class FindProjectsDto {
  /**
   * Proyectos donde este usuario es **dueño o miembro**.
   *
   * Antes solo existía `ownerId` y el gateway enviaba `userId`, así que el
   * filtro nunca casaba y el `where` quedaba vacío: `GET /projects` devolvía
   * **todos los proyectos del sistema**. Y aun con el nombre corregido habría
   * filtrado por propietario, dejando fuera los proyectos donde te han añadido.
   */
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  /**
   * Acota a los proyectos de **una** organización.
   *
   * ⚠️ **Se suma a `userId`, no lo sustituye.** Sigues viendo solo los tuyos:
   * esto es el selector del sidebar, no una llave. Sustituirlo dejaría ver los
   * proyectos de una organización entera escribiendo su identificador en la URL.
   */
  @IsOptional()
  @IsUUID('4')
  organizationId?: string;

  /** Filtro estricto por propietario. Para herramientas de administración. */
  @IsOptional()
  @IsUUID('4')
  ownerId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Solo los proyectos donde `userId` tiene **este permiso**, ya expandido por
   * jerarquía. El dueño pasa siempre, igual que en el guard.
   *
   * Existe para el selector de Reportes, que tiene que ofrecer únicamente los
   * proyectos cuyo informe puedes abrir. La alternativa era pedir
   * `/projects/:id/permissions/me` una vez por proyecto desde el cliente: N
   * peticiones por carga para descartar casi todas.
   *
   * Sin `userId` no hace nada — un permiso sin sujeto no filtra a nadie.
   */
  @IsOptional()
  @IsEnum(ProjectPermission)
  permission?: ProjectPermission;

  @IsOptional()
  @ValidateNested()
  @Type(() => QueryOptionsDto)
  query?: QueryOptionsDto;
}

/**
 * Filtros de `GET /projects` **como query params**.
 *
 * El controlador los recibía por `@Body()` en un GET, inalcanzable desde
 * `fetch`. Esta clase los aplana para la URL y los pliega a la forma que espera
 * el microservicio, que no cambia de contrato.
 */
export class FindProjectsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: SortOrder })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Busca por nombre o descripción' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ProjectPermission,
    description:
      'Solo los proyectos donde tienes este permiso (ya expandido por jerarquía). El dueño pasa siempre.',
  })
  @IsOptional()
  @IsEnum(ProjectPermission)
  permission?: ProjectPermission;

  /**
   * Solo los de esta organización.
   *
   * 🔴 **Tiene que estar declarado aquí, no solo en `FindProjectsDto`.** El
   * `ValidationPipe` del gateway rechaza lo que el DTO no declara, así que un
   * campo puesto solo en el payload interno da **400 en la URL** — y el síntoma
   * es una lista vacía, no un error visible. Es la trampa de «envía solo los
   * campos que el DTO declara» leída al revés.
   */
  @ApiPropertyOptional({ description: 'Solo los de esta organización' })
  @IsOptional()
  @IsUUID('4')
  organizationId?: string;

  /** `userId` sale del token, nunca de la URL. */
  toFindProjectsDto(userId: string): FindProjectsDto {
    const dto: FindProjectsDto = { userId };

    if (this.search) dto.search = this.search;
    if (this.permission) dto.permission = this.permission;
    if (this.organizationId) dto.organizationId = this.organizationId;

    const query: QueryOptionsDto = {};
    if (this.page !== undefined) query.page = this.page;
    if (this.limit !== undefined) query.limit = this.limit;
    if (this.sortBy !== undefined) query.sortBy = this.sortBy;
    if (this.sortOrder !== undefined) query.sortOrder = this.sortOrder;
    if (Object.keys(query).length) dto.query = query;

    return dto;
  }
}
