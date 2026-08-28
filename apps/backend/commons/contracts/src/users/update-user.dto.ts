import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Cuerpo de `PATCH /users/:id`.
 *
 * Es una **clase** y no `Omit<UpdateUserDto, 'id'>` a propósito: un tipo de
 * TypeScript no existe en runtime, así que el `ValidationPipe` recibía
 * `Object` como metatype y no validaba nada.
 *
 * ⚠️ **Entra en camelCase, igual que sale.** Era el único endpoint que recibía
 * `first_name` y devolvía `firstName`: quien leía un usuario y le devolvía el
 * mismo objeto cambiado obtenía un 200 sin que se guardara nada, porque el
 * `whitelist` descartaba en silencio las claves que no reconocía. Se aceptan las
 * dos formas durante la transición —`first_name` queda **obsoleto**— para no
 * romper a nadie que ya mande la vieja.
 */
/**
 * Los estados de presencia. Espejo de `UserPresence` en el esquema de Prisma.
 *
 * Conjunto cerrado: un texto libre por persona convierte la lista del equipo en
 * algo que no se lee de un vistazo ni se traduce.
 */
export const USER_PRESENCES = [
  'AVAILABLE',
  'BUSY',
  'IN_MEETING',
  'EATING',
  'AWAY',
  'DO_NOT_DISTURB',
] as const;

export type UserPresence = (typeof USER_PRESENCES)[number];

export class UpdateUserBodyDto {
  @ApiPropertyOptional({ description: 'Nombre', example: 'Ada' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(60, { message: 'El nombre no puede superar 60 caracteres' })
  firstName?: string;

  @ApiPropertyOptional({ description: 'Apellido', example: 'Lovelace' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El apellido debe tener al menos 2 caracteres' })
  @MaxLength(60, { message: 'El apellido no puede superar 60 caracteres' })
  lastName?: string;

  /** @deprecated Usa `firstName`. Se acepta para no romper clientes viejos. */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(60, { message: 'El nombre no puede superar 60 caracteres' })
  first_name?: string;

  /** @deprecated Usa `lastName`. */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El apellido debe tener al menos 2 caracteres' })
  @MaxLength(60, { message: 'El apellido no puede superar 60 caracteres' })
  last_name?: string;

  /**
   * Lo que dices que estás haciendo. Lo eliges tú y se queda hasta que lo
   * cambies.
   *
   * ⚠️ **No confundir con `status`**, que es el estado administrativo de la
   * cuenta y **no se toca desde aquí**: quien la suspende es la plataforma, y
   * aceptarlo en este cuerpo dejaría que cualquiera se reactivase solo.
   */
  @ApiPropertyOptional({ enum: USER_PRESENCES, description: 'Presencia elegida' })
  @IsOptional()
  @IsEnum(USER_PRESENCES)
  presence?: UserPresence;

  @ApiPropertyOptional({ description: 'Biografía', example: 'I like the code & F1' })
  @IsOptional()
  @IsString()
  @MaxLength(160, { message: 'La biografía no puede superar 160 caracteres' })
  biography?: string;

  @ApiPropertyOptional({ description: 'Ubicación', example: 'Mexico' })
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'La ubicación no puede superar 30 caracteres' })
  location?: string;

  @ApiPropertyOptional({ description: 'Información profesional en formato JSON' })
  @IsOptional()
  professionalInfo?: any;
}

/** Payload que viaja al microservicio: el cuerpo más el id de la ruta. */
export class UpdateUserDto extends UpdateUserBodyDto {
  @IsUUID()
  id: string;
}
