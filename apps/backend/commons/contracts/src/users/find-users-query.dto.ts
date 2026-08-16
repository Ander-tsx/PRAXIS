import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
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

  /**
   * Resuelve **varios perfiles concretos de una vez**: `?ids=uuid,uuid,uuid`.
   *
   * Existe porque media aplicación hacía lo mismo a mano —una petición por id—
   * para poner cara y nombre a los `userId` que devuelven projects-service y
   * las notificaciones: la bandeja de avisos, la pantalla del proyecto, el chat
   * y la rejilla de proyectos. Doce tarjetas con cuatro miembros eran hasta
   * cuarenta y ocho peticiones para pintar una lista.
   *
   * ⚠️ **No es lo mismo que `search`, y por eso no se mezclan.** Con `ids` la
   * respuesta no se pagina: se piden unos cuantos perfiles por su
   * identificador y vienen todos, hasta el tope del DTO del microservicio
   * (`FindUsersByIdsDto`: 200). Si llegan los dos, mandan los `ids`.
   *
   * Viaja como cadena separada por comas porque es una query string; el
   * `@Transform` la parte y el microservicio valida que cada trozo sea un UUID.
   * Un id que no exista simplemente no sale en la respuesta — no es un error.
   */
  @ApiPropertyOptional({ description: 'Perfiles concretos por id, separados por comas' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids?: string[];

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
