/// <reference types="jest" />
import { ProjectDomainOutboxFactory } from './project-domain-outbox.factory';

describe('ProjectDomainOutboxFactory', () => {
  it('persiste evento pendiente sólo desde contexto confiable', async () => {
    let data: any;
    await new ProjectDomainOutboxFactory().persist(
      { domainOutbox: { create: async ({ data: value }: any) => { data = value; return value; } } } as never,
      { projectId: 'project-1', subject: { type: 'PROJECT', id: 'project-1' }, actor: { type: 'USER', id: 'user-1' }, correlationId: 'c-1' },
      { type: 'project.status-changed.v1', payload: { previousStatus: 'ACTIVE', status: 'SUSPENDED' } } as never,
    );
    expect(data).toMatchObject({ projectId: 'project-1', subjectId: 'project-1', actorId: 'user-1', publishedAt: null });
  });
});
