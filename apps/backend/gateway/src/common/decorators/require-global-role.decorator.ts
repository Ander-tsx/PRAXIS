import { SetMetadata } from '@nestjs/common';
import { GLOBAL_ROLE_KEY } from '../guards/global-role.guard';

/**
 * Marca un endpoint como exclusivo de un rol global específico.
 * Se debe usar junto con `GlobalRoleGuard`.
 *
 * @example
 * @RequireGlobalRole('Admin')
 * @UseGuards(JwtGuard, GlobalRoleGuard)
 * @Post('assign')
 * assign() { ... }
 */
export const RequireGlobalRole = (role: string) =>
  SetMetadata(GLOBAL_ROLE_KEY, role);
