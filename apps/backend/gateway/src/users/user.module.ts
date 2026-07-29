import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { UserController } from './user.controller';

@Module({
  // PermissionsModule aporta PERMISSIONS_SERVICE, que AccountOwnerGuard usa
  // para dejar pasar a los administradores globales sobre cuentas ajenas.
  imports: [AuthModule, PermissionsModule],
  controllers: [UserController],
})
export class UserModule {}
