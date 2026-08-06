import { SetMetadata } from '@nestjs/common';
import type { GlobalRole } from '@praxis/contracts';
import { GLOBAL_ROLE_KEY } from '../guards/global-role.guard';

/**
 * Exige un rol global **mínimo** en un endpoint o en un controlador entero.
 * Se usa junto con `GlobalRoleGuard`.
 *
 * El parámetro está tipado como `GlobalRole` y ya no como `string`: un
 * `@RequireGlobalRole('admin')` en minúscula compilaba y no protegía nada,
 * porque el nombre se compara contra la columna `permissions.roles.name`, que
 * lleva mayúscula inicial. Ese error ahora no compila.
 *
 * ⚠️ Es un **mínimo**, no una igualdad: `'Admin'` lo satisface también un
 * `SuperAdmin`.
 *
 * @example
 * @RequireGlobalRole(GLOBAL_ROLES.ADMIN)
 * @UseGuards(JwtGuard, GlobalRoleGuard)
 * @Post('assign')
 * assign() { ... }
 */
export const RequireGlobalRole = (role: GlobalRole) => SetMetadata(GLOBAL_ROLE_KEY, role);
