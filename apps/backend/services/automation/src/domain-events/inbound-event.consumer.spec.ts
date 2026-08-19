/// <reference types="jest" />

import { InboundEventConsumer } from './inbound-event.consumer';

const event = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'task.created.v1',
  source: 'tasks-service',
  occurredAt: '2026-08-18T00:00:00.000Z',
  projectId: 'project-a',
  subject: { type: 'TASK', id: 'task-a' },
  actor: { type: 'USER', id: 'user-a' },
  correlationId: '00000000-0000-4000-8000-000000000002',
  payload: { taskId: 'task-a', boardId: 'board-a', columnId: 'column-a' },
};

const consumerFor = () => {
  const redis = {
    createConsumerGroup: jest.fn(async () => undefined),
    xautoclaim: jest.fn(async () => ({ nextStartId: '0-0', messages: [] })),
    xreadgroup: jest.fn(async () => [{ id: '1-0', fields: { event: JSON.stringify(event) } }]),
    xack: jest.fn(async () => 1),
    getConsumerMetrics: jest.fn(async () => ({ lag: 0, pending: 0 })),
  };
  const prisma = {
    inboundEvent: {
      create: jest.fn(async () => ({ id: 'inbound-1' })),
    },
  };
  const config = {
    get: <T>(_key: string, fallback: T) => fallback,
  };
  return {
    consumer: new InboundEventConsumer(prisma as never, redis as never, config as never),
    prisma,
    redis,
  };
};

describe('InboundEventConsumer', () => {
  it('persiste el hecho antes de confirmarlo al grupo', async () => {
    const { consumer, prisma, redis } = consumerFor();

    await consumer.consumeOnce();

    expect(prisma.inboundEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: event.id,
        dedupeKey: expect.any(String),
        projectId: event.projectId,
        subjectId: event.subject.id,
        actorId: event.actor.id,
        correlationId: event.correlationId,
      }),
    });
    expect(redis.xack).toHaveBeenCalledWith('praxis:domain-events', 'automation', '1-0');
  });

  it('deja el mensaje sin confirmar cuando falla la persistencia', async () => {
    const { consumer, prisma, redis } = consumerFor();
    prisma.inboundEvent.create.mockRejectedValue(new Error('database unavailable'));

    await consumer.consumeOnce();

    expect(redis.xack).not.toHaveBeenCalled();
  });

  it('no persiste ni confirma un sobre que no cumple el contrato versionado', async () => {
    const { consumer, prisma, redis } = consumerFor();
    redis.xreadgroup.mockResolvedValue([
      { id: '1-0', fields: { event: JSON.stringify({ ...event, source: 'projects-service' }) } },
    ]);

    await consumer.consumeOnce();

    expect(prisma.inboundEvent.create).not.toHaveBeenCalled();
    expect(redis.xack).not.toHaveBeenCalled();
    expect(consumer.getMetrics()).toMatchObject({ errors: 1 });
  });

  it('absorbe una reentrega ya persistida y la confirma sin otra fila lógica', async () => {
    const { consumer, prisma, redis } = consumerFor();
    prisma.inboundEvent.create.mockRejectedValue({ code: 'P2002' });

    await consumer.consumeOnce();

    expect(prisma.inboundEvent.create).toHaveBeenCalledTimes(1);
    expect(redis.xack).toHaveBeenCalledWith('praxis:domain-events', 'automation', '1-0');
    expect(consumer.getMetrics()).toMatchObject({ deduplicated: 1, errors: 0 });
  });

  it('reclama con XAUTOCLAIM una entrega abandonada y la confirma tras persistir', async () => {
    const { consumer, prisma, redis } = consumerFor();
    redis.xreadgroup.mockResolvedValue([]);
    redis.xautoclaim.mockResolvedValue({
      nextStartId: '0-0',
      messages: [{ id: '9-0', fields: { event: JSON.stringify(event) } }],
    });

    await consumer.consumeOnce();

    expect(prisma.inboundEvent.create).toHaveBeenCalledTimes(1);
    expect(redis.xack).toHaveBeenCalledWith('praxis:domain-events', 'automation', '9-0');
    expect(consumer.getMetrics()).toMatchObject({ reclaimed: 1 });
  });

  it('se recupera de Redis temporalmente indisponible en el siguiente ciclo', async () => {
    const { consumer, redis } = consumerFor();
    redis.createConsumerGroup.mockRejectedValueOnce(new Error('ECONNREFUSED redis down'));

    await consumer.consumeOnce();
    await consumer.consumeOnce();

    expect(redis.xack).toHaveBeenCalledWith('praxis:domain-events', 'automation', '1-0');
    expect(consumer.getMetrics()).toMatchObject({ accepted: 1, errors: 0 });
  });

  it('avanza el cursor de XAUTOCLAIM para no bloquear pendientes posteriores', async () => {
    const { consumer, prisma, redis } = consumerFor();
    const laterEvent = { ...event, id: '00000000-0000-4000-8000-000000000003' };
    redis.xreadgroup.mockResolvedValue([]);
    redis.xautoclaim
      .mockResolvedValueOnce({
        nextStartId: '2-0',
        messages: [{ id: '1-0', fields: { event: JSON.stringify(event) } }],
      })
      .mockResolvedValueOnce({
        nextStartId: '0-0',
        messages: [{ id: '2-0', fields: { event: JSON.stringify(laterEvent) } }],
      });
    prisma.inboundEvent.create.mockRejectedValueOnce(new Error('persistent failure'));

    await consumer.consumeOnce();
    await consumer.consumeOnce();

    expect(redis.xautoclaim.mock.calls[1][4]).toBe('2-0');
    expect(redis.xack).toHaveBeenCalledWith('praxis:domain-events', 'automation', '2-0');
  });
});
