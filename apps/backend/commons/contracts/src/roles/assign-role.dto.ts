import { IsIn, IsUUID } from 'class-validator';
import { GLOBAL_ROLES, type GlobalRole } from './global-role';

/**
 * `roleName` está restringido a los tres roles conocidos.
 *
 * Antes era un `@IsString()` libre: el servicio buscaba el nombre en la tabla y
 * devolvía un 404 si no existía, así que la validación de verdad estaba a un
 * salto de red de distancia. Y con `permissions.roles` siendo una tabla abierta,
 * un nombre inventado que alguien hubiera insertado ahí se podía asignar sin más.
 */
export class AssignRoleDto {
  /**
   * ⚠️ `@IsUUID()` **sin versión**, y no `@IsUUID('4')` como estaba.
   *
   * Con la versión exigida, estas rutas eran inalcanzables para las cuentas del
   * seed: sus ids son fijos y legibles (`11111111-1111-…`), que no tienen el
   * nibble de versión de un v4, así que asignar o revocar un rol a
   * admin@praxis.dev devolvía `400 "userId must be a UUID"`. Un id aleatorio de
   * Prisma pasaba, así que el fallo solo aparecía con las cuentas con las que se
   * prueba — y el panel de administración se habría estrenado justo ahí.
   *
   * Es el mismo criterio que `DeleteUserDto` y `FindOneUserDto`, los otros DTO
   * que llevan un id de usuario. La versión de un UUID no es una propiedad de
   * seguridad: lo que importa es que sea un UUID.
   */
  @IsUUID()
  userId: string;

  @IsIn(Object.values(GLOBAL_ROLES), {
    message: `roleName debe ser uno de: ${Object.values(GLOBAL_ROLES).join(', ')}`,
  })
  roleName: GlobalRole;
}
