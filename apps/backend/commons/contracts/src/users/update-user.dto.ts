import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Cuerpo de `PATCH /users/:id`.
 *
 * Es una **clase** y no `Omit<UpdateUserDto, 'id'>` a propósito: un tipo de
 * TypeScript no existe en runtime, así que el `ValidationPipe` recibía
 * `Object` como metatype y no validaba nada. El síntoma era peor que la
 * permisividad: `{ firstName: 'X' }` (camelCase) devolvía 200 sin guardar nada.
 */
export class UpdateUserBodyDto {
    @ApiPropertyOptional({ description: 'Nombre. Ojo: snake_case', example: 'Ada' })
    @IsOptional()
    @IsString()
    @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
    @MaxLength(60, { message: 'El nombre no puede superar 60 caracteres' })
    first_name?: string;

    @ApiPropertyOptional({ description: 'Apellido. Ojo: snake_case', example: 'Lovelace' })
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
