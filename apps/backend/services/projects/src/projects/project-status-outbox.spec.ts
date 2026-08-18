/// <reference types="jest" />
import { ProjectsService } from './projects.service';

describe('ProjectsService status outbox', () => {
  it('guarda cambio de estado y outbox pendiente juntos', async () => {
    const committed: any[] = [];
    const project = { id: 'p1', ownerId: 'o1', status: 'ACTIVE', members: [] };
    const prisma = {
      project: { findUnique: async () => project },
      $transaction: async (callback: any) => callback({
        project: { update: async () => ({ ...project, status: 'SUSPENDED', _count: {} }) },
        domainOutbox: { create: async ({ data }: any) => { committed.push(data); return data; } },
      }),
    };
    const service = new ProjectsService(prisma as never, { del: jest.fn() } as never);
    const result = await service.setStatus({ id: 'p1', status: 'SUSPENDED', reason: 'Motivo', actorId: 'u1' });
    expect(result.previousStatus).toBe('ACTIVE');
    expect(committed).toEqual([expect.objectContaining({ type: 'project.status-changed.v1', projectId: 'p1', subjectId: 'p1', actorId: 'u1', publishedAt: null, payload: { previousStatus: 'ACTIVE', status: 'SUSPENDED', reason: 'Motivo' } })]);
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
          project: { update: async () => ({ ...before, status: (pendingStatus = 'SUSPENDED'), _count: {} }) },
          domainOutbox: { create: async ({ data }: any) => { pendingOutbox.push(data); throw new Error('outbox'); } },
        });
        committed.status = pendingStatus;
        committed.outbox.push(...pendingOutbox);
        return result;
      },
    };
    const service = new ProjectsService(prisma as never, { del: jest.fn() } as never);
    await expect(service.setStatus({ id: 'p1', status: 'SUSPENDED', actorId: 'u1' })).rejects.toThrow('outbox');
    expect(committed).toEqual({ status: 'ACTIVE', outbox: [] });
  });
});
