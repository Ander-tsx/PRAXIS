import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GLOBAL_ROLES } from '@praxis/contracts';
import { GlobalRolesService } from '../global-roles/global-roles.service';

/**
 * Permite operar sobre una cuenta solo a su dueño o a un administrador global.
 *
 * Sin esto, `PATCH` y `DELETE /users/:id` solo llevaban `JwtGuard`: cualquier
 * usuario autenticado podía editar o eliminar la cuenta de otro sabiendo su id.
 *
 * Se compara contra el parámetro de la **ruta**. El controlador debe componer el
 * payload como `{ ...body, id }` —con el id al final— para que un `id` colado en
 * el cuerpo no pise al de la ruta después de esta comprobación.
 *
 * ## Lo que este guard NO es
 *
 * ⚠️ **No sirve para acciones de administración sobre cuentas ajenas**, y la
 * distinción importa: aquí «el dueño» pasa siempre, así que cualquier campo que
 * se añada al DTO de `PATCH /users/:id` queda automáticamente auto-editable. Por
 * eso `status` **no** vive en ese endpoint sino en `/admin/users/:id/status`: en
 * el compartido, quien acabara de ser suspendido podría reactivarse a sí mismo
 * durante los minutos en que su token sigue siendo válido.
 *
 * Aquí «administrador» es el nivel `Admin` **o superior**, y basta con serlo: no
 * se exige superar a la cuenta de destino. Las reglas de «solo hacia abajo» son
 * de las rutas de administración, que sí distinguen niveles
 * (`GlobalRolesService.canActOn`).
 */
@Injectable()
export class AccountOwnerGuard implements CanActivate {
  constructor(private readonly globalRoles: GlobalRolesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.userId;

    /**
     * `id` en `/users/:id`, `userId` en `/permissions/user/:userId`.
     *
     * Se prueban las dos porque el guard protege rutas de dos controladores que
     * nombran distinto el mismo dato. Es el mismo apaño que `params.taskId ??
     * params.id` en `ProjectPermissionGuard`, y con el mismo riesgo: **una ruta
     * nueva que llame de otra forma al id de la cuenta se queda sin puerta**, y
     * el síntoma es un guard que deja pasar a todo el mundo porque `targetId`
     * llega `undefined` y no coincide con nadie.
     */
    const targetId: string | undefined = request.params?.id ?? request.params?.userId;

    if (!userId) {
      throw new ForbiddenException('No hay usuario autenticado.');
    }

    /* Un `targetId` que no llega no puede compararse con nada, y dejar pasar
       «por si acaso» sería abrir la cuenta de cualquiera. */
    if (!targetId) {
      throw new ForbiddenException('No se pudo determinar la cuenta de destino.');
    }

    // El caso normal: cada quien sobre su propia cuenta, sin salto de red.
    if (userId === targetId) return true;

    if (await this.globalRoles.satisfies(userId, GLOBAL_ROLES.ADMIN)) return true;

    throw new ForbiddenException('Solo puedes modificar tu propia cuenta.');
  }
}
