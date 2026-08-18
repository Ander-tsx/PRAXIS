/// <reference types="jest" />
import { TasksService } from './tasks.service';

type CommittedWrites = {
  tasks: unknown[];
  taskEvents: unknown[];
  outbox: unknown[];
};

const task = {
  id: 'task-1',
  projectId: 'project-1',
  boardId: 'board-1',
  columnId: 'column-1',
  title: 'Preparar entrega',
  priority: 'MEDIUM',
  completedAt: null,
};

function createHarness(options: { failOutbox?: boolean; movedColumnId?: string } = {}) {
  const committed: CommittedWrites = { tasks: [], taskEvents: [], outbox: [] };
  const redis = { del: jest.fn().mockResolvedValue(undefined) };
  const createdTask = { ...task };
  const movedTask = { ...task, columnId: options.movedColumnId ?? 'column-2' };

  const prisma = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      const pending: CommittedWrites = { tasks: [], taskEvents: [], outbox: [] };
      const tx = {
        task: {
          create: async (args: unknown) => {
            pending.tasks.push(args);
            return createdTask;
          },
          update: async (args: unknown) => {
            pending.tasks.push(args);
            return movedTask;
          },
        },
        taskEvent: {
          createMany: async (args: unknown) => {
            pending.taskEvents.push(args);
          },
        },
        domainOutbox: {
          create: async ({ data }: { data: unknown }) => {
            if (options.failOutbox) throw new Error('outbox unavailable');
            pending.outbox.push(data);
            return data;
          },
        },
      };

      const result = await callback(tx);
      committed.tasks.push(...pending.tasks);
      committed.taskEvents.push(...pending.taskEvents);
      committed.outbox.push(...pending.outbox);
      return result;
    },
  };
  const service = new TasksService(prisma as never, redis as never, { get: jest.fn() } as never);
  jest.spyOn(service as any, 'assertPermission').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'assertColumnInBoard').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'resolveAssignees').mockResolvedValue([]);
  jest.spyOn(service as any, 'resolveLabels').mockResolvedValue([]);
  jest.spyOn(service as any, 'notifyAssigneeChanges').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'loadTaskInProject').mockResolvedValue(task);

  return { committed, redis, service };
}

describe('TasksService DomainOutbox transaction integration', () => {
  it('crea Task, TaskEvent y task.created.v1 en la misma transacción', async () => {
    const { committed, service } = createHarness();

    await service.createTask({
      requesterId: 'user-1',
      projectId: 'project-1',
      boardId: 'board-1',
      columnId: 'column-1',
      title: 'Preparar entrega',
      status: 'Por hacer',
      priority: 'MEDIUM',
    } as never);

    expect(committed.tasks).toHaveLength(1);
    expect(committed.taskEvents).toHaveLength(1);
    expect(committed.outbox).toHaveLength(1);
    expect(committed.outbox[0]).toMatchObject({
      type: 'task.created.v1',
      source: 'tasks-service',
      projectId: 'project-1',
      subjectType: 'TASK',
      subjectId: 'task-1',
      actorType: 'USER',
      actorId: 'user-1',
      payload: { taskId: 'task-1', boardId: 'board-1', columnId: 'column-1' },
      publishedAt: null,
    });
    expect(committed.taskEvents[0]).toMatchObject({
      data: [expect.objectContaining({ type: 'CREATED' })],
    });
    expect(committed.outbox[0]).toMatchObject({
      correlationId: expect.any(String),
      causationId: undefined,
    });
  });

  it('hace rollback de crear cuando no se puede insertar el DomainOutbox', async () => {
    const { committed, redis, service } = createHarness({ failOutbox: true });

    await expect(
      service.createTask({
        requesterId: 'user-1',
        projectId: 'project-1',
        boardId: 'board-1',
        columnId: 'column-1',
        title: 'Preparar entrega',
        status: 'Por hacer',
        priority: 'MEDIUM',
      } as never),
    ).rejects.toThrow('outbox unavailable');

    expect(committed).toEqual({ tasks: [], taskEvents: [], outbox: [] });
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('mueve Task, TaskEvent y task.moved.v1 en la misma transacción', async () => {
    const { committed, service } = createHarness();

    await service.moveTask({
      requesterId: 'user-1',
      projectId: 'project-1',
      id: 'task-1',
      columnId: 'column-2',
    } as never);

    expect(committed.tasks).toHaveLength(1);
    expect(committed.taskEvents).toHaveLength(1);
    expect(committed.outbox).toHaveLength(1);
    expect(committed.outbox[0]).toMatchObject({
      type: 'task.moved.v1',
      source: 'tasks-service',
      projectId: 'project-1',
      subjectType: 'TASK',
      subjectId: 'task-1',
      actorType: 'USER',
      actorId: 'user-1',
      payload: { taskId: 'task-1', fromColumnId: 'column-1', toColumnId: 'column-2' },
      publishedAt: null,
    });
    expect(committed.taskEvents[0]).toMatchObject({
      data: [expect.objectContaining({ type: 'MOVED' })],
    });
    expect(committed.outbox[0]).toMatchObject({
      correlationId: expect.any(String),
      causationId: undefined,
    });
  });

  it('hace rollback de mover cuando no se puede insertar el DomainOutbox', async () => {
    const { committed, redis, service } = createHarness({ failOutbox: true });

    await expect(
      service.moveTask({
        requesterId: 'user-1',
        projectId: 'project-1',
        id: 'task-1',
        columnId: 'column-2',
      } as never),
    ).rejects.toThrow('outbox unavailable');

    expect(committed).toEqual({ tasks: [], taskEvents: [], outbox: [] });
    expect(redis.del).not.toHaveBeenCalled();
  });
});
