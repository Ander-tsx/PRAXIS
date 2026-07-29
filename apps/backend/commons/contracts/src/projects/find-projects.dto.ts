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

  /** Filtro estricto por propietario. Para herramientas de administración. */
  @IsOptional()
  @IsUUID('4')
  ownerId?: string;

  @IsOptional()
  @IsString()
  search?: string;

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

  /** `userId` sale del token, nunca de la URL. */
  toFindProjectsDto(userId: string): FindProjectsDto {
    const dto: FindProjectsDto = { userId };

    if (this.search) dto.search = this.search;

    const query: QueryOptionsDto = {};
    if (this.page !== undefined) query.page = this.page;
    if (this.limit !== undefined) query.limit = this.limit;
    if (this.sortBy !== undefined) query.sortBy = this.sortBy;
    if (this.sortOrder !== undefined) query.sortOrder = this.sortOrder;
    if (Object.keys(query).length) dto.query = query;

    return dto;
  }
}
