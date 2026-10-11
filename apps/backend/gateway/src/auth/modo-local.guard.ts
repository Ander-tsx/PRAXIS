import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Cierra las rutas de autenticación propia cuando Kyloo Accounts es la única puerta
 * (`AUTH_MODE=kyloo`, docs/PLAN-AUTH-KYLOO.md): contraseña, registro, verificación,
 * recuperación y Google.
 *
 * No es cosmética. Si el login por contraseña siguiera vivo, la «única puerta» tendría una
 * segunda, con sus propias contraseñas viejas, fuera del 2FA y del límite de intentos de Kyloo.
 * Y se responde con un código propio para que la interfaz sepa que no es una avería: la
 * pantalla ya redirige a Kyloo, esto es la red de seguridad si alguien llama a la API directo.
 */
@Injectable()
export class ModoLocalGuard implements CanActivate {
  constructor(protected readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get<string>('AUTH_MODE') === 'kyloo') {
      throw new ForbiddenException({
        code: 'AUTH_DELEGATED',
        message: 'Praxis entra con tu cuenta de Kyloo. Usa «Continuar con Kyloo».',
      });
    }
    return true;
  }
}

/**
 * La red de seguridad de `AUTH_MODE=kyloo`: **contraseña y Google siguen abiertos** (registro,
 * verificación y recuperación no), para que una caída o un fallo de Kyloo Accounts no deje a nadie
 * fuera de Praxis sin tocar ninguna variable.
 *
 * La pantalla solo los ofrece cuando Kyloo ha fallado (`?kyloo_error=`), y el gateway no tiene
 * dominio público: lo llama el BFF de `web`. Lo que se abre es lo que ya existía, no algo nuevo:
 * vincular una cuenta a Kyloo **borra** su hash, así que la contraseña solo sirve a las cuentas
 * heredadas que aún no entraron por Kyloo; el resto entra por Google. Lo que se pierde en este
 * camino es el 2FA de Kyloo. `AUTH_FALLBACK_LOCAL=false` lo cierra.
 */
@Injectable()
export class ModoLocalORespaldoGuard extends ModoLocalGuard {
  canActivate(): boolean {
    if (this.config.get<string>('AUTH_FALLBACK_LOCAL') !== 'false') return true;
    return super.canActivate();
  }
}
