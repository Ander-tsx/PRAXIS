import { Global, Module } from '@nestjs/common';
import { EventDispatcher } from './event-dispatcher.service';

/**
 * El reparto de eventos en vivo.
 *
 * `@Global` por el mismo motivo que `RedisModule`: lo usan el chat y las
 * notificaciones, y va a usarlo cualquier cosa que quiera empujar algo al
 * navegador. Importarlo en cada módulo sería ceremonia por una dependencia sin
 * estado.
 */
@Global()
@Module({
  providers: [EventDispatcher],
  exports: [EventDispatcher],
})
export class RealtimeModule {}
