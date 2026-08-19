/// <reference types="jest" />

import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { TaskDomainOutboxPublisher } from '../../../tasks/src/domain-events/domain-outbox.publisher';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { InboundEventConsumer } from './inbound-event.consumer';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://praxis:praxis123@localhost:5432/praxis?schema=automation';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

const domainEvent = (projectId: string, taskId: string, id = randomUUID()) => ({
  id,
  type: 'task.created.v1',
  source: 'tasks-service',
  occurredAt: '2026-08-18T00:00:00.000Z',
  projectId,
  subject: { type: 'TASK', id: taskId },
  actor: { type: 'USER', id: 'user-a' },
  correlationId: randomUUID(),
  payload: { taskId, boardId: 'board-a', columnId: 'column-a' },
});

describe('InboundEventConsumer integration', () => {
  let prisma: PrismaService;
  let redis: RedisService;
  let client: Redis;

  beforeAll(async () => {
    const config = { getOrThrow: <T>() => databaseUrl };
    prisma = new PrismaService(config as never);
    await prisma.onModuleInit();
    redis = new RedisService({ getOrThrow: <T>() => redisUrl } as never);
    redis.onModuleInit();
    client = new Redis(redisUrl);
  });

  afterAll(async () => {
    await redis.onModuleDestroy();
    await prisma.onModuleDestroy();
    await client.quit();
  });

  const consumerFor = (stream: string, group: string, name: string) =>
    new InboundEventConsumer(prisma, redis, {
      get: <T>(key: string, fallback: T) =>
        (({
          DOMAIN_EVENTS_STREAM: stream,
          DOMAIN_EVENTS_CONSUMER_GROUP: group,
          DOMAIN_EVENTS_CONSUMER_NAME: name,
          DOMAIN_EVENTS_CLAIM_IDLE_MS: 1,
        })[key] ?? fallback) as T,
    } as never);

  it('recibe dos proyectos del stream y conserva su contexto aislado', async () => {
    const stream = `praxis:test:inbound:${randomUUID()}`;
    const group = `automation-${randomUUID()}`;
    const first = domainEvent(`project-${randomUUID()}`, `task-${randomUUID()}`);
    const second = domainEvent(`project-${randomUUID()}`, `task-${randomUUID()}`);
    const consumer = consumerFor(stream, group, 'consumer-a');

    try {
      await client.xadd(stream, '*', 'event', JSON.stringify(first));
      await client.xadd(stream, '*', 'event', JSON.stringify(second));

      await consumer.consumeOnce();

      const stored = await prisma.inboundEvent.findMany({
        where: { eventId: { in: [first.id, second.id] } },
        orderBy: { eventId: 'asc' },
      });
      expect(stored).toHaveLength(2);
      expect(stored).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventId: first.id,
            projectId: first.projectId,
            subjectId: first.subject.id,
            actorId: first.actor.id,
            payload: first.payload,
          }),
          expect.objectContaining({
            eventId: second.id,
            projectId: second.projectId,
            subjectId: second.subject.id,
            actorId: second.actor.id,
            payload: second.payload,
          }),
        ]),
      );
    } finally {
      await prisma.inboundEvent.deleteMany({ where: { eventId: { in: [first.id, second.id] } } });
      await client.del(stream);
    }
  });

  it('recorre outbox de tasks, Redis Stream e inbox de automation', async () => {
    const stream = `praxis:test:inbound:${randomUUID()}`;
    const group = `automation-${randomUUID()}`;
    const item = domainEvent(`project-${randomUUID()}`, `task-${randomUUID()}`);
    const outbox = {
      ...item,
      id: `outbox-${randomUUID()}`,
      eventId: item.id,
      subjectType: item.subject.type,
      subjectId: item.subject.id,
      actorType: item.actor.type,
      actorId: item.actor.id,
      occurredAt: new Date(item.occurredAt),
      publishedAt: null as Date | null,
      createdAt: new Date(item.occurredAt),
    };
    const taskPrisma = {
      domainOutbox: {
        findMany: jest.fn(async () => (outbox.publishedAt ? [] : [outbox])),
        count: jest.fn(async () => (outbox.publishedAt ? 0 : 1)),
        findFirst: jest.fn(async () =>
          outbox.publishedAt ? null : { createdAt: outbox.createdAt },
        ),
        updateMany: jest.fn(async () => {
          outbox.publishedAt = new Date();
          return { count: 1 };
        }),
      },
    };
    const publisher = new TaskDomainOutboxPublisher(
      taskPrisma as never,
      {
        xadd: (target: string, fields: Record<string, string>) =>
          client.xadd(target, '*', ...Object.entries(fields).flat()),
      } as never,
      {
        get: <T>(key: string, fallback: T) =>
          (key === 'DOMAIN_OUTBOX_STREAM' ? stream : fallback) as T,
      } as never,
    );
    const consumer = consumerFor(stream, group, 'consumer-a');

    try {
      await publisher.publishPending();
      await consumer.consumeOnce();

      expect(outbox.publishedAt).toBeInstanceOf(Date);
      await expect(prisma.inboundEvent.count({ where: { eventId: item.id } })).resolves.toBe(1);
    } finally {
      await prisma.inboundEvent.deleteMany({ where: { eventId: item.id } });
      await client.del(stream);
    }
  });

  it('deduplica dos sobres distintos que representan el mismo hecho causal', async () => {
    const stream = `praxis:test:inbound:${randomUUID()}`;
    const group = `automation-${randomUUID()}`;
    const first = domainEvent(`project-${randomUUID()}`, `task-${randomUUID()}`);
    const duplicate = { ...first, id: randomUUID() };
    const consumer = consumerFor(stream, group, 'consumer-a');

    try {
      await client.xadd(stream, '*', 'event', JSON.stringify(first));
      await client.xadd(stream, '*', 'event', JSON.stringify(duplicate));

      await consumer.consumeOnce();

      await expect(
        prisma.inboundEvent.count({ where: { eventId: { in: [first.id, duplicate.id] } } }),
      ).resolves.toBe(1);
      expect(consumer.getMetrics()).toMatchObject({ deduplicated: 1 });
    } finally {
      await prisma.inboundEvent.deleteMany({
        where: { eventId: { in: [first.id, duplicate.id] } },
      });
      await client.del(stream);
    }
  });

  it('reclama con XAUTOCLAIM una entrega abandonada y la confirma tras persistir', async () => {
    const stream = `praxis:test:inbound:${randomUUID()}`;
    const group = `automation-${randomUUID()}`;
    const item = domainEvent(`project-${randomUUID()}`, `task-${randomUUID()}`);
    const consumer = consumerFor(stream, group, 'reclaimer');

    try {
      await client.xadd(stream, '*', 'event', JSON.stringify(item));
      await client.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
      await client.xreadgroup(
        'GROUP',
        group,
        'abandoned-consumer',
        'COUNT',
        1,
        'STREAMS',
        stream,
        '>',
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      await consumer.consumeOnce();

      await expect(prisma.inboundEvent.count({ where: { eventId: item.id } })).resolves.toBe(1);
      expect((await client.xpending(stream, group))[0]).toBe(0);
      expect(consumer.getMetrics()).toMatchObject({ reclaimed: 1, accepted: 1 });
    } finally {
      await prisma.inboundEvent.deleteMany({ where: { eventId: item.id } });
      await client.del(stream);
    }
  });

  it('no duplica la fila lógica si cae después de persistir y antes de XACK', async () => {
    const stream = `praxis:test:inbound:${randomUUID()}`;
    const group = `automation-${randomUUID()}`;
    const item = domainEvent(`project-${randomUUID()}`, `task-${randomUUID()}`);
    const consumer = consumerFor(stream, group, 'consumer-a');
    const acknowledge = jest.spyOn(redis, 'xack');
    acknowledge.mockRejectedValueOnce(new Error('Redis unavailable before XACK'));

    try {
      await client.xadd(stream, '*', 'event', JSON.stringify(item));

      await consumer.consumeOnce();
      expect(await prisma.inboundEvent.count({ where: { eventId: item.id } })).toBe(1);
      expect((await client.xpending(stream, group))[0]).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 10));
      await consumer.consumeOnce();

      expect(await prisma.inboundEvent.count({ where: { eventId: item.id } })).toBe(1);
      expect((await client.xpending(stream, group))[0]).toBe(0);
      expect(consumer.getMetrics()).toMatchObject({ deduplicated: 1, errors: 0 });
    } finally {
      acknowledge.mockRestore();
      await prisma.inboundEvent.deleteMany({ where: { eventId: item.id } });
      await client.del(stream);
    }
  });

  it('se recupera tras una desconexión real de Redis', async () => {
    const stream = `praxis:test:inbound:${randomUUID()}`;
    const group = `automation-${randomUUID()}`;
    const item = domainEvent(`project-${randomUUID()}`, `task-${randomUUID()}`);
    const consumer = consumerFor(stream, group, 'consumer-a');
    (redis as unknown as { client: Redis }).client.disconnect();

    try {
      await consumer.consumeOnce();
      expect(consumer.getMetrics()).toMatchObject({ errors: 1 });

      redis.onModuleInit();
      await client.xadd(stream, '*', 'event', JSON.stringify(item));
      await consumer.consumeOnce();
      await expect(prisma.inboundEvent.count({ where: { eventId: item.id } })).resolves.toBe(1);
    } finally {
      await prisma.inboundEvent.deleteMany({ where: { eventId: item.id } });
      await client.del(stream);
    }
  });
});
