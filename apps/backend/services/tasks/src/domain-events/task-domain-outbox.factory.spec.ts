/// <reference types="jest" />
import { TaskDomainOutboxFactory } from './task-domain-outbox.factory';

describe('TaskDomainOutboxFactory', () => {
  it('persiste una entrada pendiente usando solo contexto confiable', async () => {
    let data: any;
    const row = await new TaskDomainOutboxFactory().persist(
      {
        domainOutbox: {
          create: async ({ data: value }: any) => {
            data = value;
            return value;
          },
        },
      } as never,
      {
        projectId: 'project-1',
        taskId: 'task-1',
        actor: { type: 'USER', id: 'user-1' },
        correlationId: 'c-1',
      },
      {
        type: 'task.created.v1',
        payload: { taskId: 'task-1', boardId: 'board-1', columnId: 'column-1' },
      } as never,
    );
    expect(row.publishedAt).toBeNull();
    expect(data.projectId).toBe('project-1');
    expect(data.subjectId).toBe('task-1');
    expect(data.actorId).toBe('user-1');
  });
});
