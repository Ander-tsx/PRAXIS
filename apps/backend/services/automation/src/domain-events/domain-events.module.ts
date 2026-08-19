import { Module } from '@nestjs/common';
import { InboundEventConsumer } from './inbound-event.consumer';

@Module({ providers: [InboundEventConsumer] })
export class DomainEventsModule {}
