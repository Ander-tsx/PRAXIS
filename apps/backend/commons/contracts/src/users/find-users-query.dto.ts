import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SortOrder } from '../pagination.dto';
import { FindUsersDto } from './find-users.dto';

/**
 * Filtros de `GET /users` **como query params**.
 *
 * `FindUsersDto` los declara anidados (`{ query, filters }`) y el controlador
 * los recibía por `@Body()` en un GET. `fetch` no puede enviar cuerpo en un GET,
 * así que desde el navegador era inalcanzable: siempre llegaba la página 1 con
 * el límite por defecto, sin forma de buscar ni paginar.
 *
 * Esta clase aplana esos filtros para la URL y `toFindUsersDto()` los vuelve a
 * plegar a la forma que espera el microservicio, que no se toca.
 */
export class FindUsersQueryDto {
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

  @ApiPropertyOptional({ description: 'Busca por nombre, apellido o email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdFrom?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdTo?: Date;

  /** Pliega los params planos a la forma anidada del microservicio. */
  toFindUsersDto(): FindUsersDto {
    const query = stripUndefined({
      page: this.page,
      limit: this.limit,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,
    });

    const filters = stripUndefined({
      search: this.search,
      createdFrom: this.createdFrom,
      createdTo: this.createdTo,
    });

    const dto: FindUsersDto = {};
    if (Object.keys(query).length) dto.query = query;
    if (Object.keys(filters).length) dto.filters = filters;
    return dto;
  }
}

function stripUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}
