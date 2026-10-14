import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';

/** Notificaciones push. Ver `docs/PLAN-PUSH.md`. */
@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
