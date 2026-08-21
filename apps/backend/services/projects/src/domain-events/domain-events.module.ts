import { Module } from '@nestjs/common';
import { ProjectDomainOutboxPublisher } from './domain-outbox.publisher';

@Module({ providers: [ProjectDomainOutboxPublisher] })
export class DomainEventsModule {}
