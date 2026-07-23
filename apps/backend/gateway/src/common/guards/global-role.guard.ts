import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

export const GLOBAL_ROLE_KEY = 'global_role';

@Injectable()
export class GlobalRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject('PERMISSIONS_SERVICE') private readonly permissionsClient: ClientProxy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.get<string>(
      GLOBAL_ROLE_KEY,
      context.getHandler(),
    );

    // Si no hay rol requerido en el handler, deja pasar
    if (!requiredRole) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    if (!userId) return false;

    try {
      const { hasRole } = await firstValueFrom(
        this.permissionsClient.send(
          { cmd: 'permission_check_role' },
          { userId, roleName: requiredRole },
        ),
      );

      if (!hasRole) {
        throw new ForbiddenException(`Se requiere el rol global: ${requiredRole}`);
      }

      return true;
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      return false;
    }
  }
}
