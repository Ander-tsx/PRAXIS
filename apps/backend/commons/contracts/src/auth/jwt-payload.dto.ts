import { IsInt, IsOptional, IsString } from 'class-validator';

export class JwtPayloadDto {
  @IsString()
  sub: string;

  @IsInt()
  iat: number;

  @IsInt()
  exp: number;

  /**
   * Identificador de **esta** sesión. Solo lo llevan los refresh tokens.
   *
   * Es el campo del hash `auth:sessions:<userId>` donde vive el token, y lo que
   * permite que una persona tenga varias sesiones abiertas sin que la última
   * entrada eche a las anteriores. Ver `AuthService.claveDeSesiones`.
   *
   * Opcional porque el access token no lo necesita —y porque un refresh token
   * firmado antes de que esto existiera no lo trae: `refresh()` lo rechaza, que
   * es una entrada más y una sola vez.
   */
  @IsOptional()
  @IsString()
  jti?: string;
}
