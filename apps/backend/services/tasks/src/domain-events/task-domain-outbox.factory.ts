import { randomUUID } from 'node:crypto';
import type { DomainEvent, TaskDomainEvent } from '@praxis/contracts';
import type { Prisma } from '../generated/prisma-client';

type TrustedTaskContext = {
  projectId: string;
  taskId: string;
  actor: DomainEvent['actor'];
  correlationId: string;
  causationId?: string;
};

/** Construye hechos desde datos resueltos por el servicio, nunca desde el cuerpo cliente. */
export class TaskDomainOutboxFactory {
  async persist(
    tx: Prisma.TransactionClient,
    context: TrustedTaskContext,
    event: Omit<
      TaskDomainEvent,
      | 'id'
      | 'source'
      | 'occurredAt'
      | 'projectId'
      | 'subject'
      | 'actor'
      | 'correlationId'
      | 'causationId'
    >,
  ) {
    const domainEvent: TaskDomainEvent = {
      ...event,
      id: randomUUID(),
      source: 'tasks-service',
      occurredAt: new Date().toISOString(),
      projectId: context.projectId,
      subject: { type: 'TASK', id: context.taskId },
      actor: context.actor,
      correlationId: context.correlationId,
      ...(context.causationId && { causationId: context.causationId }),
    } as TaskDomainEvent;
    return tx.domainOutbox.create({
      data: {
        eventId: domainEvent.id,
        type: domainEvent.type,
        source: domainEvent.source,
        occurredAt: new Date(domainEvent.occurredAt),
        projectId: domainEvent.projectId,
        subjectType: domainEvent.subject.type,
        subjectId: domainEvent.subject.id,
        actorType: domainEvent.actor.type,
        actorId: domainEvent.actor.id,
        correlationId: domainEvent.correlationId,
        causationId: domainEvent.causationId,
        payload: domainEvent.payload as Prisma.InputJsonValue,
        publishedAt: null,
      },
    });
  }
}
