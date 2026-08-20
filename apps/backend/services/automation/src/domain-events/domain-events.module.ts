import { Module } from '@nestjs/common';

import { RulesModule } from '../rules/rules.module';
import { InboundEventConsumer } from './inbound-event.consumer';

/**
 * El flujo de hechos de dominio, ya conectado a las reglas.
 *
 * 🔴 **Hasta ahora no lo estaba, y era la mitad del servicio sin usar.** El
 * consumidor copiaba cada hecho a `inbound_events` y ahí se acababa: ninguna
 * consulta leía esa tabla. Toda la tubería —el outbox transaccional de dos
 * servicios, el stream de Redis, el grupo de consumo, el reclamo de mensajes
 * huérfanos— entregaba a un archivo muerto, y las reglas solo corrían cuando
 * alguien pulsaba «Revisar ahora».
 */
@Module({ imports: [RulesModule], providers: [InboundEventConsumer] })
export class DomainEventsModule {}
