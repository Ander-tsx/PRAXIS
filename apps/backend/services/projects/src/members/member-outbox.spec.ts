/// <reference types="jest" />
import { MembersService } from './members.service';

describe('MembersService outbox', () => {
  it('elimina miembro y persiste evento pendiente con actor confiable', async () => {
    const outbox: any[] = [];
    const member = { id: 'm1', projectId: 'p1', userId: 'u2' };
    const prisma = {
      projectMember: { findUnique: async () => member }, project: { findUnique: async () => ({ name: 'Proyecto' }) },
      $transaction: async (callback: any) => callback({ projectMember: { findUniqueOrThrow: async () => member, delete: async () => member }, domainOutbox: { create: async ({ data }: any) => { outbox.push(data); return data; } } }),
    };
    const service = new MembersService(prisma as never, { del: jest.fn() } as never, { invalidatePermissionCache: jest.fn() } as never, { emit: jest.fn() } as never);
    await service.removeMember({ projectId: 'p1', userId: 'u2', requesterId: 'u1' } as never);
    expect(outbox).toEqual([expect.objectContaining({ type: 'project.member-removed.v1', projectId: 'p1', subjectType: 'PROJECT_MEMBER', subjectId: 'm1', actorId: 'u1', payload: { userId: 'u2' }, publishedAt: null })]);
  });

  it('hace rollback de miembro y outbox si falla inserción durable', async () => {
    const member = { id: 'm1', projectId: 'p1', userId: 'u2' };
    const committed = { deleted: false, outbox: [] as unknown[] };
    const prisma = {
      projectMember: { findUnique: async () => member }, project: { findUnique: async () => ({ name: 'Proyecto' }) },
      $transaction: async (callback: any) => {
        let deleted = false;
        const outbox: unknown[] = [];
        const result = await callback({
          projectMember: { findUniqueOrThrow: async () => member, delete: async () => { deleted = true; return member; } },
          domainOutbox: { create: async ({ data }: any) => { outbox.push(data); throw new Error('outbox'); } },
        });
        committed.deleted = deleted;
        committed.outbox.push(...outbox);
        return result;
      },
    };
    const service = new MembersService(prisma as never, { del: jest.fn() } as never, { invalidatePermissionCache: jest.fn() } as never, { emit: jest.fn() } as never);
    await expect(service.removeMember({ projectId: 'p1', userId: 'u2', requesterId: 'u1' } as never)).rejects.toThrow('outbox');
    expect(committed).toEqual({ deleted: false, outbox: [] });
  });
});
