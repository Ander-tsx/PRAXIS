import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Solo un correo: lo comparten «reenviar confirmación» y «olvidé mi contraseña».
 *
 * Un DTO para las dos porque **son la misma forma y la misma promesa**: se
 * responde 200 exista o no la cuenta. Separarlos habría sido dos sitios donde
 * olvidar esa regla.
 */
export class EmailOnlyDto {
  @ApiProperty({ example: 'ana@ejemplo.com' })
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  @MaxLength(255)
  email: string;
}

/** El token que viaja en el enlace de confirmación. */
export class VerifyEmailDto {
  @ApiProperty({ description: 'El token del enlace del correo' })
  @IsString()
  @MinLength(20, { message: 'El enlace no es válido' })
  @MaxLength(200)
  token: string;
}

/**
 * Token del enlace más la contraseña nueva.
 *
 * ⚠️ El mínimo de 8 tiene que coincidir con el de `RegisterDto`: si aquí fuera
 * menor, esta ruta sería la vía para poner una contraseña que el registro no
 * habría aceptado.
 */
export class ResetPasswordDto {
  @ApiProperty({ description: 'El token del enlace del correo' })
  @IsString()
  @MinLength(20, { message: 'El enlace no es válido' })
  @MaxLength(200)
  token: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La contraseña no puede superar 72 caracteres' })
  password: string;
}
