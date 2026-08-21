/// <reference types="jest" />
import { ProjectsService } from './projects.service';

describe('ProjectsService status outbox', () => {
  it('guarda cambio de estado y outbox pendiente juntos', async () => {
    const committed: any[] = [];
    const project = { id: 'p1', ownerId: 'o1', status: 'ACTIVE', members: [] };
    const prisma = {
      project: { findUnique: async () => project },
      $transaction: async (callback: any) =>
        callback({
          project: {
            findUnique: async () => ({ status: 'ACTIVE' }),
            update: async () => ({ ...project, status: 'SUSPENDED', _count: {} }),
          },
          domainOutbox: {
            create: async ({ data }: any) => {
              committed.push(data);
              return data;
            },
          },
        }),
    };
    const service = new ProjectsService(prisma as never, { del: jest.fn() } as never);
    const result = await service.setStatus({
      id: 'p1',
      status: 'SUSPENDED',
      reason: 'Motivo',
      actorId: 'u1',
    });
    expect(result.previousStatus).toBe('ACTIVE');
    expect(committed).toEqual([
      expect.objectContaining({
        type: 'project.status-changed.v1',
        projectId: 'p1',
        subjectId: 'p1',
        actorId: 'u1',
        publishedAt: null,
        causationId: undefined,
        correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        payload: { previousStatus: 'ACTIVE', status: 'SUSPENDED', reason: 'Motivo' },
      }),
    ]);
  });

  it('hace rollback de estado y outbox si falla la inserción durable', async () => {
    const before = { id: 'p1', ownerId: 'o1', status: 'ACTIVE', members: [] };
    const committed = { status: before.status, outbox: [] as unknown[] };
    const prisma = {
      project: { findUnique: async () => before },
      $transaction: async (callback: any) => {
        let pendingStatus = before.status;
        const pendingOutbox: unknown[] = [];
        const result = await callback({
          project: {
            findUnique: async () => ({ status: 'ACTIVE' }),
            update: async () => ({ ...before, status: (pendingStatus = 'SUSPENDED'), _count: {} }),
          },
          domainOutbox: {
            create: async ({ data }: any) => {
              pendingOutbox.push(data);
              throw new Error('outbox');
            },
          },
        });
        committed.status = pendingStatus;
        committed.outbox.push(...pendingOutbox);
        return result;
      },
    };
    const service = new ProjectsService(prisma as never, { del: jest.fn() } as never);
    await expect(
      service.setStatus({ id: 'p1', status: 'SUSPENDED', actorId: 'u1' }),
    ).rejects.toThrow('outbox');
    expect(committed).toEqual({ status: 'ACTIVE', outbox: [] });
  });

  it('usa estado observado dentro del tx y no crea outbox en no-op', async () => {
    const project = { id: 'p1', ownerId: 'o1', members: [] };
    const outbox = jest.fn();
    const prisma = {
      project: { findUnique: async () => project },
      $transaction: async (callback: any) =>
        callback({
          project: {
            findUnique: async () => ({ status: 'SUSPENDED' }),
            findUniqueOrThrow: async () => ({ ...project, status: 'SUSPENDED', _count: {} }),
            update: jest.fn(),
          },
          domainOutbox: { create: outbox },
        }),
    };
    const service = new ProjectsService(prisma as never, { del: jest.fn() } as never);
    const result = await service.setStatus({ id: 'p1', status: 'SUSPENDED', actorId: 'u1' });
    expect(result.previousStatus).toBe('SUSPENDED');
    expect(outbox).not.toHaveBeenCalled();
  });

  it('conserva contexto causal confiable en el outbox', async () => {
    const outbox: any[] = [];
    const project = { id: 'p1', ownerId: 'o1', members: [] };
    const prisma = {
      project: { findUnique: async () => project },
      $transaction: async (callback: any) =>
        callback({
          project: {
            findUnique: async () => ({ status: 'ACTIVE' }),
            update: async () => ({ ...project, status: 'SUSPENDED', _count: {} }),
          },
          domainOutbox: {
            create: async ({ data }: any) => {
              outbox.push(data);
              return data;
            },
          },
        }),
    };
    const service = new ProjectsService(prisma as never, { del: jest.fn() } as never);

    await service.setStatus({
      id: 'p1',
      status: 'SUSPENDED',
      actorId: 'u1',
      correlationId: '00000000-0000-4000-8000-000000000001',
      causationId: '00000000-0000-4000-8000-000000000002',
    } as never);

    expect(outbox).toEqual([
      expect.objectContaining({
        correlationId: '00000000-0000-4000-8000-000000000001',
        causationId: '00000000-0000-4000-8000-000000000002',
      }),
    ]);
  });

  it('aísla cambio de estado y outbox del segundo proyecto', async () => {
    const projects: Record<string, any> = {
      p1: { id: 'p1', ownerId: 'o1', status: 'ACTIVE', members: [] },
      p2: { id: 'p2', ownerId: 'o2', status: 'ACTIVE', members: [] },
    };
    const outbox: any[] = [];
    const prisma = {
      project: { findUnique: async ({ where }: any) => projects[where.id] ?? null },
      $transaction: async (callback: any) =>
        callback({
          project: {
            findUnique: async ({ where }: any) =>
              projects[where.id] ? { status: projects[where.id].status } : null,
            update: async ({ where, data }: any) => {
              projects[where.id] = { ...projects[where.id], ...data };
              return { ...projects[where.id], _count: {} };
            },
          },
          domainOutbox: {
            create: async ({ data }: any) => {
              outbox.push(data);
              return data;
            },
          },
        }),
    };
    const service = new ProjectsService(prisma as never, { del: jest.fn() } as never);

    await service.setStatus({
      id: 'p1',
      status: 'SUSPENDED',
      actorId: 'u1',
      projectId: 'p2',
    } as never);

    expect(projects.p1.status).toBe('SUSPENDED');
    expect(projects.p2.status).toBe('ACTIVE');
    expect(outbox).toEqual([expect.objectContaining({ projectId: 'p1', subjectId: 'p1' })]);
  });
});
