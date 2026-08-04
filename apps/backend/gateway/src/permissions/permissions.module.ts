import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GlobalRolesModule } from '../common/global-roles/global-roles.module';
import { PermissionsController } from './permissions.controller';

/**
 * `GlobalRolesModule` aporta `PERMISSIONS_SERVICE` **y** `GlobalRolesService`.
 *
 * El cliente TCP se registraba aquí; se movió allí para que un solo módulo sea
 * dueño de la conexión a permissions-service y los guards no tengan que
 * importar este módulo —que necesita el suyo— cerrando un ciclo.
 */
@Module({
  imports: [AuthModule, GlobalRolesModule],
  controllers: [PermissionsController],
  exports: [GlobalRolesModule],
})
export class PermissionsModule {}
