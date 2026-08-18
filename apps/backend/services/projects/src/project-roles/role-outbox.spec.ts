/// <reference types="jest" />
import { ProjectRolesService } from './project-roles.service';

describe('ProjectRolesService outbox', () => {
  const role = { id: 'r1', projectId: 'p1', members: [] };
  const serviceFor = (fail = false) => {
    const committed: any[] = [];
    const prisma = { projectRole: { findUnique: async () => role }, $transaction: async (callback: any) => callback({ projectRole: { findUniqueOrThrow: async () => role, delete: async () => role }, domainOutbox: { create: async ({ data }: any) => { if (fail) throw new Error('outbox'); committed.push(data); return data; } } }) };
    return { committed, service: new ProjectRolesService(prisma as never, { del: jest.fn() } as never) };
  };
  it('persiste rol eliminado pendiente con actor confiable', async () => {
    const { committed, service } = serviceFor();
    await service.deleteProjectRole('r1', 'p1', 'u1');
    expect(committed).toEqual([expect.objectContaining({ type: 'project.role-deleted.v1', projectId: 'p1', subjectId: 'r1', actorId: 'u1', publishedAt: null })]);
  });
  it('rechaza rol de otro proyecto antes de tx', async () => {
    const { service } = serviceFor();
    await expect(service.deleteProjectRole('r1', 'p2', 'u1')).rejects.toMatchObject({ error: { statusCode: 403 } });
  });
});
