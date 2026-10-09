import { IsString, Matches, MaxLength } from 'class-validator';

/**
 * Lo que el servidor web manda para entrar con Kyloo Accounts: el `code` de
 * autorización y los secretos de **su propio** intento (PKCE y nonce).
 *
 * ⚠️ **Nunca la identidad.** Ni el correo, ni el `sub`, ni un id_token ya
 * hecho: el `code` se canjea aquí, con el secreto del cliente, y la identidad
 * sale de un id_token cuya firma se comprueba contra las claves públicas de
 * Accounts. Aceptar `{ email }` del cliente sería dejar entrar a quien diga ser
 * cualquiera.
 */
export class KylooLoginDto {
  @IsString()
  @MaxLength(512)
  code: string;

  /** El verificador PKCE (RFC 7636): 43–128 caracteres del alfabeto «unreserved». */
  @IsString()
  @Matches(/^[A-Za-z0-9\-._~]{43,128}$/, { message: 'El verificador PKCE no es válido' })
  codeVerifier: string;

  @IsString()
  @MaxLength(256)
  nonce: string;

  /** La misma `redirect_uri` con la que se pidió el código: Accounts la compara. */
  @IsString()
  @MaxLength(512)
  redirectUri: string;
}
