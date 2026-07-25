import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { UserController } from './user.controller';

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [UserController],
})
export class UserModule {}
