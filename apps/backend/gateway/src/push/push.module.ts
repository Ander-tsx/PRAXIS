import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { clienteDeServicio } from '@praxis/local-transport';
import { AuthModule } from '../auth/auth.module';
import { MyPushController } from './push.controller';

/** Notificaciones push. Ver `docs/PLAN-PUSH.md`. */
@Module({
  imports: [AuthModule, ClientsModule.registerAsync([clienteDeServicio('PROJECTS')])],
  controllers: [MyPushController],
})
export class PushModule {}
