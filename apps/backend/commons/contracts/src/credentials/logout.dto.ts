import { IsOptional, IsString, IsUUID } from 'class-validator';

export class LogoutDto {
  /**
   * ⚠️ Sale **del token de la petición**, nunca del cuerpo. En el gateway lo
   * pone `req.user.userId`; aquí se declara porque el microservicio lo recibe
   * ya resuelto.
   */
  @IsUUID('4')
  userId: string;

  /**
   * Cuál de las sesiones se cierra.
   *
   * Una cuenta puede tener varias abiertas a la vez (ver `AuthService`), así que
   * «cerrar sesión» necesita decir cuál: con el refresh token de este
   * dispositivo se cierra solo el suyo. **Sin él se cierran todas**, que es lo
   * que hacía siempre y sigue siendo el valor seguro por defecto.
   *
   * No se valida como UUID ni como JWT: quien lo comprueba es `logout()`, que ya
   * tiene que verificar la firma para sacar el `jti`. Un token ilegible cierra
   * todas — quien pide salir, sale.
   */
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
