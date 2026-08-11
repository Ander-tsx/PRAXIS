import { IsJWT, IsString } from 'class-validator';

/**
 * Lo único que el cliente manda para entrar con Google.
 *
 * ⚠️ **Solo el token, nunca el correo ni el nombre.** Puede parecer cómodo que
 * el navegador envíe también `{ email, name }` ya extraídos —se ahorra
 * decodificar— pero eso sería aceptar la identidad que el cliente diga ser. El
 * correo sale de dentro del token **después** de comprobar que Google lo firmó.
 *
 * `@IsJWT` no valida la firma —eso lo hace el servicio contra las claves
 * públicas de Google— pero descarta antes lo que ni siquiera tiene forma de
 * token, que es lo que llega cuando algo se rompe en el navegador.
 */
export class GoogleLoginDto {
  @IsString()
  @IsJWT({ message: 'El token de Google no tiene el formato esperado' })
  idToken: string;
}
