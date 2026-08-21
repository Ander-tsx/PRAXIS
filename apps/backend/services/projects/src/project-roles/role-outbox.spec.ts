/// <reference types="jest" />
import { ProjectRolesService } from './project-roles.service';

describe('ProjectRolesService outbox', () => {
  const role = { id: 'r1', projectId: 'p1', members: [] };
  const serviceFor = (fail = false) => {
    const committed: any[] = [];
    const prisma = {
      projectRole: { findUnique: async () => role },
      $transaction: async (callback: any) =>
        callback({
          projectRole: { findUniqueOrThrow: async () => role, delete: async () => role },
          domainOutbox: {
            create: async ({ data }: any) => {
              if (fail) throw new Error('outbox');
              committed.push(data);
              return data;
            },
          },
        }),
    };
    return {
      committed,
      service: new ProjectRolesService(prisma as never, { del: jest.fn() } as never),
    };
  };
  it('persiste rol eliminado pendiente con actor confiable', async () => {
    const { committed, service } = serviceFor();
    await service.deleteProjectRole('r1', 'p1', 'u1');
    expect(committed).toEqual([
      expect.objectContaining({
        type: 'project.role-deleted.v1',
        projectId: 'p1',
        subjectId: 'r1',
        actorId: 'u1',
        publishedAt: null,
        causationId: undefined,
        correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    ]);
  });
  it('rechaza rol de otro proyecto antes de tx', async () => {
    const { service } = serviceFor();
    await expect(service.deleteProjectRole('r1', 'p2', 'u1')).rejects.toMatchObject({
      error: { statusCode: 403 },
    });
  });
  it('conserva contexto causal confiable en el outbox', async () => {
    const { committed, service } = serviceFor();

    await service.deleteProjectRole('r1', 'p1', 'u1', {
      correlationId: '00000000-0000-4000-8000-000000000005',
      causationId: '00000000-0000-4000-8000-000000000006',
    });

    expect(committed).toEqual([
      expect.objectContaining({
        correlationId: '00000000-0000-4000-8000-000000000005',
        causationId: '00000000-0000-4000-8000-000000000006',
      }),
    ]);
  });
  it('aísla eliminación y outbox del segundo proyecto', async () => {
    const roles: Record<string, any> = {
      r1: { id: 'r1', projectId: 'p1', members: [] },
      r2: { id: 'r2', projectId: 'p2', members: [] },
    };
    const outbox: any[] = [];
    const prisma = {
      projectRole: { findUnique: async ({ where }: any) => roles[where.id] ?? null },
      $transaction: async (callback: any) =>
        callback({
          projectRole: {
            findUniqueOrThrow: async ({ where }: any) => roles[where.id],
            delete: async ({ where }: any) => {
              const role = roles[where.id];
              delete roles[where.id];
              return role;
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
    const service = new ProjectRolesService(prisma as never, { del: jest.fn() } as never);

    await service.deleteProjectRole('r1', 'p1', 'u1');

    expect(roles.r1).toBeUndefined();
    expect(roles.r2).toEqual({ id: 'r2', projectId: 'p2', members: [] });
    expect(outbox).toEqual([expect.objectContaining({ projectId: 'p1', subjectId: 'r1' })]);
  });
  it('rechaza rol de otro proyecto sin efectos parciales', async () => {
    const roles = {
      r1: { id: 'r1', projectId: 'p1', members: [] },
      r2: { id: 'r2', projectId: 'p2', members: [] },
    };
    const outbox: any[] = [];
    const remove = jest.fn();
    const prisma = {
      projectRole: { findUnique: async () => roles.r2 },
      $transaction: async (callback: any) =>
        callback({
          projectRole: { findUniqueOrThrow: async () => roles.r2, delete: remove },
          domainOutbox: {
            create: async ({ data }: any) => {
              outbox.push(data);
              return data;
            },
          },
        }),
    };
    const service = new ProjectRolesService(prisma as never, { del: jest.fn() } as never);

    await expect(service.deleteProjectRole('r1', 'p1', 'u1')).rejects.toMatchObject({
      error: { statusCode: 403 },
    });

    expect(roles).toEqual({
      r1: { id: 'r1', projectId: 'p1', members: [] },
      r2: { id: 'r2', projectId: 'p2', members: [] },
    });
    expect(remove).not.toHaveBeenCalled();
    expect(outbox).toEqual([]);
  });
  it('hace rollback de rol y outbox si falla inserción durable', async () => {
    const role = { id: 'r1', projectId: 'p1', members: [] };
    const committed = { roleExists: true, outbox: [] as unknown[] };
    const prisma = {
      projectRole: { findUnique: async () => role },
      $transaction: async (callback: any) => {
        let roleExists = true;
        const outbox: unknown[] = [];
        const result = await callback({
          projectRole: {
            findUniqueOrThrow: async () => role,
            delete: async () => {
              roleExists = false;
              return role;
            },
          },
          domainOutbox: {
            create: async ({ data }: any) => {
              outbox.push(data);
              throw new Error('outbox');
            },
          },
        });
        committed.roleExists = roleExists;
        committed.outbox.push(...outbox);
        return result;
      },
    };
    const service = new ProjectRolesService(prisma as never, { del: jest.fn() } as never);

    await expect(service.deleteProjectRole('r1', 'p1', 'u1')).rejects.toThrow('outbox');

    expect(committed).toEqual({ roleExists: true, outbox: [] });
  });
});
