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
  constructor(private readonly config: ConfigService) {}

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
