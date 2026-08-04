import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { GlobalRole } from '@praxis/contracts';
import { GlobalRolesService } from '../global-roles/global-roles.service';

export const GLOBAL_ROLE_KEY = 'global_role';

/**
 * Exige un rol global **mínimo**, contando la jerarquía.
 *
 * ⚠️ Antes preguntaba por el **nombre exacto** (`permission_check_role` con
 * `roleName`), y eso se rompe en cuanto hay más de dos roles sin orden: un
 * `SuperAdmin` no tiene la fila `Admin`, así que habría fallado todos los
 * `@RequireGlobalRole('Admin')` que ya existían — el rol más alto habría sido el
 * que menos puede. La jerarquía vive en `@praxis/contracts` y la aplica
 * `GlobalRolesService`.
 *
 * `catch → return false` desapareció con la llamada suelta: devolver `false`
 * dentro de un `catch` que envolvía también al `ForbiddenException` obligaba a
 * relanzarlo a mano, y un `false` sin excepción sale como un 403 sin mensaje.
 * Ahora el fallo de infraestructura lo absorbe el servicio —falla cerrado, con
 * aviso en el log— y aquí solo queda la decisión.
 */
@Injectable()
export class GlobalRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly globalRoles: GlobalRolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    /* El rol se busca en el handler y **también en la clase**: el namespace
       `/admin` lo declara una vez a nivel de controlador, y con `get` sobre el
       handler a secas ese controlador entero se quedaría sin guard. */
    const requiredRole = this.reflector.getAllAndOverride<GlobalRole | undefined>(
      GLOBAL_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si no hay rol requerido, este guard no opina.
    if (!requiredRole) return true;

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.userId;
    if (!userId) {
      throw new ForbiddenException('No hay usuario autenticado.');
    }

    if (!(await this.globalRoles.satisfies(userId, requiredRole))) {
      throw new ForbiddenException(`Se requiere el rol global: ${requiredRole}`);
    }

    return true;
  }
}
