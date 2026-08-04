import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GlobalRolesModule } from '../common/global-roles/global-roles.module';
import { UserController } from './user.controller';

@Module({
  // GlobalRolesModule aporta GlobalRolesService, que AccountOwnerGuard usa para
  // dejar pasar a los administradores globales sobre cuentas ajenas. Antes se
  // importaba PermissionsModule solo por su cliente TCP.
  imports: [AuthModule, GlobalRolesModule],
  controllers: [UserController],
})
export class UserModule {}
