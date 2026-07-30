import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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
}

/** Payload que viaja al microservicio: el cuerpo más el id de la ruta. */
export class UpdateUserDto extends UpdateUserBodyDto {
    @IsUUID()
    id: string;
}
