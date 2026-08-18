import { randomUUID } from 'node:crypto';
import type { DomainEvent, ProjectDomainEvent } from '@praxis/contracts';
import type { Prisma } from '../generated/prisma-client';

type TrustedProjectContext = {
  projectId: string;
  subject: DomainEvent['subject'];
  actor: DomainEvent['actor'];
  correlationId: string;
  causationId?: string;
};

export class ProjectDomainOutboxFactory {
  async persist(
    tx: Prisma.TransactionClient,
    context: TrustedProjectContext,
    event: Omit<ProjectDomainEvent, 'id' | 'source' | 'occurredAt' | 'projectId' | 'subject' | 'actor' | 'correlationId' | 'causationId'>,
  ) {
    const domainEvent: ProjectDomainEvent = {
      ...event,
      id: randomUUID(), source: 'projects-service', occurredAt: new Date().toISOString(),
      projectId: context.projectId, subject: context.subject, actor: context.actor,
      correlationId: context.correlationId,
      ...(context.causationId && { causationId: context.causationId }),
    } as ProjectDomainEvent;
    return tx.domainOutbox.create({ data: {
      eventId: domainEvent.id, type: domainEvent.type, source: domainEvent.source,
      occurredAt: new Date(domainEvent.occurredAt), projectId: domainEvent.projectId,
      subjectType: domainEvent.subject.type, subjectId: domainEvent.subject.id,
      actorType: domainEvent.actor.type, actorId: domainEvent.actor.id,
      correlationId: domainEvent.correlationId, causationId: domainEvent.causationId,
      payload: domainEvent.payload as Prisma.InputJsonValue, publishedAt: null,
    }});
  }
}
