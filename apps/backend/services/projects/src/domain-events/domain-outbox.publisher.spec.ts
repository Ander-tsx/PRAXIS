/// <reference types="jest" />
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { ProjectDomainOutboxPublisher } from './domain-outbox.publisher';

const row = () => ({
  id: 'row-1',
  eventId: '00000000-0000-4000-8000-000000000011',
  type: 'project.status-changed.v1',
  source: 'projects-service',
  occurredAt: new Date('2026-08-18T00:00:00.000Z'),
  projectId: 'project-1',
  subjectType: 'PROJECT',
  subjectId: 'project-1',
  actorType: 'USER',
  actorId: 'user-1',
  correlationId: '00000000-0000-4000-8000-000000000012',
  causationId: null as string | null,
  payload: { previousStatus: 'ACTIVE', status: 'SUSPENDED', reason: 'reason' },
  publishedAt: null as Date | null,
  createdAt: new Date('2026-08-18T00:00:00.000Z'),
});

const publisherFor = (stored = row()) => {
  const redis = { xadd: jest.fn(async () => '1-0') };
  const prisma = {
    domainOutbox: {
      findMany: jest.fn(async () => (stored.publishedAt ? [] : [stored])),
      count: jest.fn(async () => (stored.publishedAt ? 0 : 1)),
      findFirst: jest.fn(async () => (stored.publishedAt ? null : { createdAt: stored.createdAt })),
      updateMany: jest.fn(async () => {
        stored.publishedAt = new Date();
        return { count: 1 };
      }),
    },
  };
  const config = { get: <T>(_key: string, fallback: T) => fallback };
  const logger = { info: jest.fn(), warn: jest.fn() };
  return {
    stored,
    redis,
    prisma,
    logger,
    publisher: new ProjectDomainOutboxPublisher(
      prisma as never,
      redis as never,
      config as never,
      logger as never,
    ),
  };
};

describe('ProjectDomainOutboxPublisher', () => {
  it('entrega fila pendiente a Redis Stream real', async () => {
    const stream = `praxis:test:domain-outbox:${randomUUID()}`;
    const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    const stored = row();
    stored.causationId = '00000000-0000-4000-8000-000000000013';
    const prisma = {
      domainOutbox: {
        findMany: async () => (stored.publishedAt ? [] : [stored]),
        count: async () => (stored.publishedAt ? 0 : 1),
        findFirst: async () => (stored.publishedAt ? null : { createdAt: stored.createdAt }),
        updateMany: async () => {
          stored.publishedAt = new Date();
          return { count: 1 };
        },
      },
    };
    const config = {
      get: <T>(key: string, fallback: T) => (key === 'DOMAIN_OUTBOX_STREAM' ? stream : fallback),
    };
    const redis = {
      xadd: (target: string, fields: Record<string, string>) =>
        client.xadd(target, '*', ...Object.entries(fields).flat()),
    };
    const publisher = new ProjectDomainOutboxPublisher(
      prisma as never,
      redis as never,
      config as never,
    );

    try {
      await publisher.publishPending();
      const [[, fields]] = await client.xrange(stream, '-', '+');
      const event = JSON.parse(fields[fields.indexOf('event') + 1]);
      expect(event).toEqual({
        id: stored.eventId,
        type: stored.type,
        source: stored.source,
        occurredAt: stored.occurredAt.toISOString(),
        projectId: stored.projectId,
        subject: { type: stored.subjectType, id: stored.subjectId },
        actor: { type: stored.actorType, id: stored.actorId },
        correlationId: stored.correlationId,
        causationId: stored.causationId,
        payload: stored.payload,
      });
      expect(stored.publishedAt).toBeInstanceOf(Date);
    } finally {
      await client.del(stream);
      await client.quit();
    }
  });

  it('conserva pendiente durante caída de conexión Redis y publica tras recuperar', async () => {
    const stream = `praxis:test:domain-outbox:${randomUUID()}`;
    const stored = row();
    const prisma = {
      domainOutbox: {
        findMany: async () => (stored.publishedAt ? [] : [stored]),
        count: async () => (stored.publishedAt ? 0 : 1),
        findFirst: async () => (stored.publishedAt ? null : { createdAt: stored.createdAt }),
        updateMany: async () => {
          stored.publishedAt = new Date();
          return { count: 1 };
        },
      },
    };
    const config = {
      get: <T>(key: string, fallback: T) =>
        (key === 'DOMAIN_OUTBOX_STREAM'
          ? stream
          : key === 'DOMAIN_OUTBOX_RETRY_DELAY_MS'
            ? 0
            : fallback) as T,
    };
    const disconnected = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    disconnected.disconnect();
    const failedPublisher = new ProjectDomainOutboxPublisher(
      prisma as never,
      {
        xadd: (target: string, fields: Record<string, string>) =>
          disconnected.xadd(target, '*', ...Object.entries(fields).flat()),
      } as never,
      config as never,
    );

    await failedPublisher.publishPending();
    expect(stored.publishedAt).toBeNull();

    const recovered = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    const recoveredPublisher = new ProjectDomainOutboxPublisher(
      prisma as never,
      {
        xadd: (target: string, fields: Record<string, string>) =>
          recovered.xadd(target, '*', ...Object.entries(fields).flat()),
      } as never,
      config as never,
    );
    try {
      await recoveredPublisher.publishPending();
      expect(stored.publishedAt).toBeInstanceOf(Date);
      expect(await recovered.xlen(stream)).toBe(1);
    } finally {
      await recovered.del(stream);
      await recovered.quit();
    }
  });

  it('publica sobre íntegro y marca fila solo después de XADD', async () => {
    const { publisher, redis, prisma, stored } = publisherFor();

    await publisher.publishPending();

    expect(JSON.parse(redis.xadd.mock.calls[0][1].event)).toMatchObject({
      id: stored.eventId,
      type: stored.type,
      projectId: stored.projectId,
      subject: { type: 'PROJECT', id: 'project-1' },
      actor: { type: 'USER', id: 'user-1' },
      correlationId: stored.correlationId,
    });
    expect(prisma.domainOutbox.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: stored.id, publishedAt: null },
      }),
    );
    expect(stored.publishedAt).toBeInstanceOf(Date);
  });

  it('conserva fila pendiente cuando Redis falla antes de XADD', async () => {
    const { publisher, redis, prisma, stored } = publisherFor();
    redis.xadd.mockRejectedValue(new Error('ECONNREFUSED redis down'));

    const stats = await publisher.publishPending();

    expect(prisma.domainOutbox.updateMany).not.toHaveBeenCalled();
    expect(stored.publishedAt).toBeNull();
    expect(redis.xadd).toHaveBeenCalledTimes(3);
    expect(stats).toMatchObject({ pending: 1, published: 0, errors: 1 });
    expect(publisher.getMetrics()).toMatchObject({ pending: 1, published: 0, errors: 1 });
  });

  it('no reintenta error Redis permanente', async () => {
    const { publisher, redis, prisma, stored } = publisherFor();
    redis.xadd.mockRejectedValue(
      new Error('WRONGTYPE Operation against a key holding the wrong kind of value'),
    );

    await publisher.publishPending();

    expect(redis.xadd).toHaveBeenCalledTimes(1);
    expect(prisma.domainOutbox.updateMany).not.toHaveBeenCalled();
    expect(stored.publishedAt).toBeNull();
  });

  it('mide todo el backlog pendiente aunque publique solo un lote', async () => {
    const first = row();
    const redis = { xadd: jest.fn(async () => '1-0') };
    const prisma = {
      domainOutbox: {
        findMany: jest.fn(async () => [first]),
        count: jest.fn(async () => 2),
        findFirst: jest.fn(async () => ({ createdAt: first.createdAt })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const config = {
      get: <T>(key: string, fallback: T) =>
        (key === 'DOMAIN_OUTBOX_BATCH_SIZE' ? 1 : fallback) as T,
    };
    const publisher = new ProjectDomainOutboxPublisher(
      prisma as never,
      redis as never,
      config as never,
    );

    const stats = await publisher.publishPending();

    expect(stats.pending).toBe(2);
    expect(stats.oldestPendingAgeMs).toEqual(expect.any(Number));
    expect(redis.xadd).toHaveBeenCalledTimes(1);
    expect(prisma.domainOutbox.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
  });

  it('reentrega mismo eventId tras caída entre XADD y marcado', async () => {
    const { publisher, redis, prisma, stored } = publisherFor();
    prisma.domainOutbox.updateMany.mockRejectedValueOnce(new Error('db down'));

    await publisher.publishPending();
    expect(stored.publishedAt).toBeNull();

    await publisher.publishPending();
    expect(redis.xadd).toHaveBeenCalledTimes(2);
    expect(JSON.parse(redis.xadd.mock.calls[0][1].event).id).toBe(stored.eventId);
    expect(JSON.parse(redis.xadd.mock.calls[1][1].event).id).toBe(stored.eventId);
    expect(stored.publishedAt).toBeInstanceOf(Date);
  });
});
