import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UserController } from './user.controller';

@Module({
  // Reutiliza CREDENTIALS_SERVICE y JwtGuard exportados por AuthModule
  imports: [AuthModule],
  controllers: [UserController],
})
export class UserModule {}
