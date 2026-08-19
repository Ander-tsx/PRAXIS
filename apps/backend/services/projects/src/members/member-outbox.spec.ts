/// <reference types="jest" />
import { MembersService } from './members.service';

describe('MembersService outbox', () => {
  it('elimina miembro y persiste evento pendiente con actor confiable', async () => {
    const outbox: any[] = [];
    const member = { id: 'm1', projectId: 'p1', userId: 'u2' };
    const prisma = {
      projectMember: { findUnique: async () => member },
      project: { findUnique: async () => ({ name: 'Proyecto' }) },
      $transaction: async (callback: any) =>
        callback({
          projectMember: { findUniqueOrThrow: async () => member, delete: async () => member },
          domainOutbox: {
            create: async ({ data }: any) => {
              outbox.push(data);
              return data;
            },
          },
        }),
    };
    const service = new MembersService(
      prisma as never,
      { del: jest.fn() } as never,
      { invalidatePermissionCache: jest.fn() } as never,
      { emit: jest.fn() } as never,
    );
    await service.removeMember({ projectId: 'p1', userId: 'u2', requesterId: 'u1' } as never);
    expect(outbox).toEqual([
      expect.objectContaining({
        type: 'project.member-removed.v1',
        projectId: 'p1',
        subjectType: 'PROJECT_MEMBER',
        subjectId: 'm1',
        actorId: 'u1',
        payload: { userId: 'u2' },
        publishedAt: null,
        causationId: undefined,
        correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    ]);
  });

  it('hace rollback de miembro y outbox si falla inserción durable', async () => {
    const member = { id: 'm1', projectId: 'p1', userId: 'u2' };
    const committed = { deleted: false, outbox: [] as unknown[] };
    const prisma = {
      projectMember: { findUnique: async () => member },
      project: { findUnique: async () => ({ name: 'Proyecto' }) },
      $transaction: async (callback: any) => {
        let deleted = false;
        const outbox: unknown[] = [];
        const result = await callback({
          projectMember: {
            findUniqueOrThrow: async () => member,
            delete: async () => {
              deleted = true;
              return member;
            },
          },
          domainOutbox: {
            create: async ({ data }: any) => {
              outbox.push(data);
              throw new Error('outbox');
            },
          },
        });
        committed.deleted = deleted;
        committed.outbox.push(...outbox);
        return result;
      },
    };
    const service = new MembersService(
      prisma as never,
      { del: jest.fn() } as never,
      { invalidatePermissionCache: jest.fn() } as never,
      { emit: jest.fn() } as never,
    );
    await expect(
      service.removeMember({ projectId: 'p1', userId: 'u2', requesterId: 'u1' } as never),
    ).rejects.toThrow('outbox');
    expect(committed).toEqual({ deleted: false, outbox: [] });
  });

  it('conserva contexto causal confiable en el outbox', async () => {
    const outbox: any[] = [];
    const member = { id: 'm1', projectId: 'p1', userId: 'u2' };
    const prisma = {
      projectMember: { findUnique: async () => member },
      project: { findUnique: async () => ({ name: 'Proyecto' }) },
      $transaction: async (callback: any) =>
        callback({
          projectMember: { findUniqueOrThrow: async () => member, delete: async () => member },
          domainOutbox: {
            create: async ({ data }: any) => {
              outbox.push(data);
              return data;
            },
          },
        }),
    };
    const service = new MembersService(
      prisma as never,
      { del: jest.fn() } as never,
      { invalidatePermissionCache: jest.fn() } as never,
      { emit: jest.fn() } as never,
    );

    await service.removeMember({
      projectId: 'p1',
      userId: 'u2',
      requesterId: 'u1',
      correlationId: '00000000-0000-4000-8000-000000000003',
      causationId: '00000000-0000-4000-8000-000000000004',
    } as never);

    expect(outbox).toEqual([
      expect.objectContaining({
        correlationId: '00000000-0000-4000-8000-000000000003',
        causationId: '00000000-0000-4000-8000-000000000004',
      }),
    ]);
  });

  it('aísla eliminación y outbox del segundo proyecto', async () => {
    const members: Record<string, any> = {
      m1: { id: 'm1', projectId: 'p1', userId: 'u2' },
      m2: { id: 'm2', projectId: 'p2', userId: 'u3' },
    };
    const outbox: any[] = [];
    const prisma = {
      projectMember: {
        findUnique: async ({ where }: any) =>
          Object.values(members).find(
            (member: any) =>
              member.projectId === where.projectId_userId.projectId &&
              member.userId === where.projectId_userId.userId,
          ) ?? null,
      },
      project: { findUnique: async () => ({ name: 'Proyecto' }) },
      $transaction: async (callback: any) =>
        callback({
          projectMember: {
            findUniqueOrThrow: async ({ where }: any) => members[where.id],
            delete: async ({ where }: any) => {
              const member = members[where.id];
              delete members[where.id];
              return member;
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
    const service = new MembersService(
      prisma as never,
      { del: jest.fn() } as never,
      { invalidatePermissionCache: jest.fn() } as never,
      { emit: jest.fn() } as never,
    );

    await service.removeMember({ projectId: 'p1', userId: 'u2', requesterId: 'u1' } as never);

    expect(members.m1).toBeUndefined();
    expect(members.m2).toEqual({ id: 'm2', projectId: 'p2', userId: 'u3' });
    expect(outbox).toEqual([expect.objectContaining({ projectId: 'p1', subjectId: 'm1' })]);
  });

  it('rechaza miembro de otro proyecto sin efectos parciales', async () => {
    const members = {
      m1: { id: 'm1', projectId: 'p1', userId: 'u2' },
      m2: { id: 'm2', projectId: 'p2', userId: 'u3' },
    };
    const outbox: any[] = [];
    const remove = jest.fn();
    const prisma = {
      projectMember: { findUnique: async () => members.m2 },
      project: { findUnique: async () => ({ name: 'Proyecto A' }) },
      $transaction: async (callback: any) =>
        callback({
          projectMember: { findUniqueOrThrow: async () => members.m2, delete: remove },
          domainOutbox: {
            create: async ({ data }: any) => {
              outbox.push(data);
              return data;
            },
          },
        }),
    };
    const service = new MembersService(
      prisma as never,
      { del: jest.fn() } as never,
      { invalidatePermissionCache: jest.fn() } as never,
      { emit: jest.fn() } as never,
    );

    await expect(
      service.removeMember({ projectId: 'p1', userId: 'u2', requesterId: 'u1' } as never),
    ).rejects.toMatchObject({ error: { statusCode: 403 } });

    expect(members).toEqual({
      m1: { id: 'm1', projectId: 'p1', userId: 'u2' },
      m2: { id: 'm2', projectId: 'p2', userId: 'u3' },
    });
    expect(remove).not.toHaveBeenCalled();
    expect(outbox).toEqual([]);
  });
});
