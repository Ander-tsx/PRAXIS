import { Module } from '@nestjs/common';
import { TaskDomainOutboxPublisher } from './domain-outbox.publisher';

@Module({ providers: [TaskDomainOutboxPublisher] })
export class DomainEventsModule {}
