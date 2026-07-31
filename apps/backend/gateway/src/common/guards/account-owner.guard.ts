import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

/** Rol global que puede administrar cuentas ajenas. */
const ADMIN_ROLE = 'Admin';

/**
 * Permite operar sobre una cuenta solo a su dueño o a un administrador global.
 *
 * Sin esto, `PATCH` y `DELETE /users/:id` solo llevaban `JwtGuard`: cualquier
 * usuario autenticado podía editar o eliminar la cuenta de otro sabiendo su id.
 *
 * Se compara contra el `:id` de la **ruta**. El controlador debe componer el
 * payload como `{ ...body, id }` —con el id al final— para que un `id` colado
 * en el cuerpo no pise al de la ruta después de esta comprobación.
 */
@Injectable()
export class AccountOwnerGuard implements CanActivate {
  constructor(
    @Inject('PERMISSIONS_SERVICE') private readonly permissionsClient: ClientProxy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.userId;
    const targetId: string | undefined = request.params?.id;

    if (!userId) {
      throw new ForbiddenException('No hay usuario autenticado.');
    }

    // El caso normal: cada quien sobre su propia cuenta, sin salto de red.
    if (userId === targetId) return true;

    if (await this.isGlobalAdmin(userId)) return true;

    throw new ForbiddenException('Solo puedes modificar tu propia cuenta.');
  }

  private async isGlobalAdmin(userId: string): Promise<boolean> {
    try {
      const { hasRole } = await firstValueFrom(
        this.permissionsClient.send(
          { cmd: 'permission_check_role' },
          { userId, roleName: ADMIN_ROLE },
        ),
      );
      return !!hasRole;
    } catch {
      // Si permissions-service no responde, se deniega: es más seguro que
      // dejar pasar por un fallo de infraestructura.
      return false;
    }
  }
}
