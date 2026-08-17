import { IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Lo que acepta **el cuerpo HTTP** de `POST /auth/logout`.
 *
 * ## Por qué existe aparte de `LogoutDto`
 *
 * Porque son dos contratos distintos y confundirlos rompió el cierre de sesión
 * entero. `LogoutDto` describe lo que le llega **al microservicio**, con el
 * `userId` ya resuelto; el gateway lo usaba también como `@Body()`, así que su
 * `ValidationPipe` exigía en el cuerpo un `userId` que el propio controlador
 * ignora —lo saca del token, como debe—.
 *
 * Resultado: `POST /auth/logout` respondía **400 siempre**. Y en silencio: el
 * BFF de `auth-front` no mira el `ok` de la respuesta y `fetch` no lanza en un
 * 400, así que la cookie se borraba en local, la persona veía que había salido
 * y su refresh token seguía vivo en Redis **siete días**. Cerrar sesión no
 * cerraba nada.
 *
 * Regla que deja escrita: **un DTO de microservicio no vale como `@Body()` del
 * gateway** en cuanto lleve un campo que el gateway resuelve por su cuenta. Es
 * la otra cara de la trampa nº 3 de CLAUDE.md —allí el `@Body()` tipado de menos
 * no validaba nada; aquí el tipado de más rechaza todo—.
 */
export class LogoutBodyDto {
  /** El mismo campo, con el mismo significado. Ver `LogoutDto.refreshToken`. */
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

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
