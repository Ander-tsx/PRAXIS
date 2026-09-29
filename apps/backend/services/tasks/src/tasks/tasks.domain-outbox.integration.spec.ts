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

function createHarness(
  options: {
    assigneeIds?: string[];
    beforeAssigneeIds?: string[];
    existingTask?: typeof task;
    failOutbox?: boolean;
    movedColumnId?: string;
    updatedTask?: typeof task & { assignees?: { userId: string }[]; dueDate?: Date | null };
  } = {},
) {
  const committed: CommittedWrites = { tasks: [], taskEvents: [], outbox: [] };
  /* `delByPrefix` es como se invalida el listado del tablero (trampa 26 de
     CLAUDE.md). Sin él en el doble, once pruebas morían con «is not a
     function» antes de llegar a lo que comprueban. */
  const redis = {
    del: jest.fn().mockResolvedValue(undefined),
    delByPrefix: jest.fn().mockResolvedValue(undefined),
  };
  const createdTask = { ...task };
  const movedTask = options.updatedTask ?? {
    ...task,
    columnId: options.movedColumnId ?? 'column-2',
  };

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
          findUniqueOrThrow: async () =>
            options.updatedTask ?? {
              ...(options.existingTask ?? task),
              assignees: (options.assigneeIds ?? []).map((userId) => ({ userId })),
            },
          delete: async (args: unknown) => {
            pending.tasks.push(args);
            return options.existingTask ?? task;
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
  jest.spyOn(service as any, 'resolveAssignees').mockResolvedValue(options.assigneeIds ?? []);
  jest.spyOn(service as any, 'resolveLabels').mockResolvedValue([]);
  jest.spyOn(service as any, 'notifyAssigneeChanges').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'loadTaskInProject').mockResolvedValue(options.existingTask ?? task);
  jest.spyOn(service as any, 'currentAssignees').mockResolvedValue(options.beforeAssigneeIds ?? []);
  jest.spyOn(service as any, 'replaceAssignees').mockResolvedValue(undefined);

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
    expect(redis.delByPrefix).not.toHaveBeenCalled();
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
    expect(redis.delByPrefix).not.toHaveBeenCalled();
  });

  it('persiste task.due-date-changed.v1 al cambiar realmente la fecha de vencimiento', async () => {
    const previousDueDate = new Date('2026-08-20T12:00:00.000Z');
    const dueDate = new Date('2026-08-25T12:00:00.000Z');
    const { committed, service } = createHarness({
      existingTask: { ...task, dueDate: previousDueDate } as typeof task,
      updatedTask: { ...task, dueDate },
    });

    await service.updateTask({
      requesterId: 'user-1',
      projectId: 'project-1',
      id: 'task-1',
      dueDate: dueDate.toISOString(),
    } as never);

    expect(committed.outbox).toEqual([
      expect.objectContaining({
        type: 'task.due-date-changed.v1',
        payload: {
          taskId: 'task-1',
          previousDueDate: previousDueDate.toISOString(),
          dueDate: dueDate.toISOString(),
        },
      }),
    ]);
  });

  it('no persiste DomainOutbox cuando dueDate no cambia realmente', async () => {
    const dueDate = new Date('2026-08-20T12:00:00.000Z');
    const { committed, service } = createHarness({
      existingTask: { ...task, dueDate } as typeof task,
      updatedTask: { ...task, dueDate },
    });

    await service.updateTask({
      requesterId: 'user-1',
      projectId: 'project-1',
      id: 'task-1',
      dueDate: dueDate.toISOString(),
    } as never);

    expect(committed.outbox).toEqual([]);
  });

  it('hace rollback del cambio de dueDate cuando falla el DomainOutbox', async () => {
    const { committed, service } = createHarness({
      existingTask: { ...task, dueDate: null } as typeof task,
      updatedTask: { ...task, dueDate: new Date('2026-08-20T12:00:00.000Z') },
      failOutbox: true,
    });

    await expect(
      service.updateTask({
        requesterId: 'user-1',
        projectId: 'project-1',
        id: 'task-1',
        dueDate: '2026-08-20T12:00:00.000Z',
      } as never),
    ).rejects.toThrow('outbox unavailable');

    expect(committed).toEqual({ tasks: [], taskEvents: [], outbox: [] });
  });

  it('un PATCH que mueve a cierre persiste los hechos de movimiento y completado', async () => {
    const completedAt = new Date('2026-08-20T12:00:00.000Z');
    const { committed, service } = createHarness({
      updatedTask: { ...task, columnId: 'column-2', completedAt },
    });

    await service.updateTask({
      requesterId: 'user-1',
      projectId: 'project-1',
      id: 'task-1',
      columnId: 'column-2',
      isClosingColumn: true,
    } as never);

    expect(committed.outbox).toEqual([
      expect.objectContaining({
        type: 'task.moved.v1',
        payload: { taskId: 'task-1', fromColumnId: 'column-1', toColumnId: 'column-2' },
      }),
      expect.objectContaining({
        type: 'task.completed.v1',
        payload: { taskId: 'task-1', completedAt: completedAt.toISOString() },
      }),
    ]);
  });

  it('hace rollback al completar si falla el DomainOutbox', async () => {
    const { committed, service } = createHarness({
      updatedTask: { ...task, columnId: 'column-2', completedAt: new Date() },
      failOutbox: true,
    });

    await expect(
      service.updateTask({
        requesterId: 'user-1',
        projectId: 'project-1',
        id: 'task-1',
        columnId: 'column-2',
        isClosingColumn: true,
      } as never),
    ).rejects.toThrow('outbox unavailable');

    expect(committed).toEqual({ tasks: [], taskEvents: [], outbox: [] });
  });

  it('un PATCH que reabre persiste los hechos de movimiento y reapertura', async () => {
    const { committed, service } = createHarness({
      existingTask: { ...task, completedAt: new Date('2026-08-19T12:00:00.000Z') },
      updatedTask: { ...task, columnId: 'column-2', completedAt: null },
    });

    await service.updateTask({
      requesterId: 'user-1',
      projectId: 'project-1',
      id: 'task-1',
      columnId: 'column-2',
      isClosingColumn: false,
    } as never);

    expect(committed.outbox).toEqual([
      expect.objectContaining({
        type: 'task.moved.v1',
        payload: { taskId: 'task-1', fromColumnId: 'column-1', toColumnId: 'column-2' },
      }),
      expect.objectContaining({
        type: 'task.reopened.v1',
        payload: { taskId: 'task-1' },
      }),
    ]);
  });

  it('hace rollback al reabrir si falla el DomainOutbox', async () => {
    const { committed, service } = createHarness({
      existingTask: { ...task, completedAt: new Date('2026-08-19T12:00:00.000Z') },
      updatedTask: { ...task, columnId: 'column-2', completedAt: null },
      failOutbox: true,
    });

    await expect(
      service.updateTask({
        requesterId: 'user-1',
        projectId: 'project-1',
        id: 'task-1',
        columnId: 'column-2',
        isClosingColumn: false,
      } as never),
    ).rejects.toThrow('outbox unavailable');

    expect(committed).toEqual({ tasks: [], taskEvents: [], outbox: [] });
  });

  it('conserva TaskEvent y task.deleted.v1 antes de eliminar la tarea', async () => {
    const { committed, service } = createHarness();

    await service.deleteTask({
      requesterId: 'user-1',
      projectId: 'project-1',
      id: 'task-1',
    } as never);

    expect(committed.tasks).toHaveLength(1);
    expect(committed.taskEvents).toEqual([
      expect.objectContaining({ data: [expect.objectContaining({ type: 'DELETED' })] }),
    ]);
    expect(committed.outbox).toEqual([
      expect.objectContaining({
        type: 'task.deleted.v1',
        projectId: 'project-1',
        subjectType: 'TASK',
        subjectId: 'task-1',
        actorType: 'USER',
        actorId: 'user-1',
        payload: { taskId: 'task-1' },
        publishedAt: null,
      }),
    ]);
  });

  it('hace rollback de eliminar cuando falla el DomainOutbox', async () => {
    const { committed, redis, service } = createHarness({ failOutbox: true });

    await expect(
      service.deleteTask({
        requesterId: 'user-1',
        projectId: 'project-1',
        id: 'task-1',
      } as never),
    ).rejects.toThrow('outbox unavailable');

    expect(committed).toEqual({ tasks: [], taskEvents: [], outbox: [] });
    expect(redis.del).not.toHaveBeenCalled();
    expect(redis.delByPrefix).not.toHaveBeenCalled();
  });

  it('asignar responsables conserva hechos individuales y un solo estado final agregado', async () => {
    const { committed, service } = createHarness({ assigneeIds: ['user-1', 'user-2'] });

    await service.assignTask({
      requesterId: 'manager-1',
      projectId: 'project-1',
      id: 'task-1',
      assigneeIds: ['user-1', 'user-2'],
    } as never);

    expect(committed.taskEvents[0]).toMatchObject({
      data: [
        expect.objectContaining({ type: 'ASSIGNED', subjectId: 'user-1' }),
        expect.objectContaining({ type: 'ASSIGNED', subjectId: 'user-2' }),
      ],
    });
    expect(committed.outbox).toEqual([
      expect.objectContaining({
        type: 'task.assignees-changed.v1',
        projectId: 'project-1',
        subjectType: 'TASK',
        subjectId: 'task-1',
        actorType: 'USER',
        actorId: 'manager-1',
        payload: { taskId: 'task-1', assigneeIds: ['user-1', 'user-2'] },
      }),
    ]);
  });

  it('desasignar responsables conserva un solo DomainEvent con el estado final', async () => {
    const { committed, service } = createHarness({
      beforeAssigneeIds: ['user-1', 'user-2'],
      assigneeIds: ['user-2'],
    });

    await service.assignTask({
      requesterId: 'manager-1',
      projectId: 'project-1',
      id: 'task-1',
      assigneeIds: ['user-2'],
    } as never);

    expect(committed.taskEvents[0]).toMatchObject({
      data: [expect.objectContaining({ type: 'UNASSIGNED', subjectId: 'user-1' })],
    });
    expect(committed.outbox).toEqual([
      expect.objectContaining({
        type: 'task.assignees-changed.v1',
        payload: { taskId: 'task-1', assigneeIds: ['user-2'] },
      }),
    ]);
  });

  it('una sustitución múltiple emite un único DomainEvent coherente y deduplicado', async () => {
    const { committed, service } = createHarness({
      beforeAssigneeIds: ['user-1', 'user-2'],
      assigneeIds: ['user-2', 'user-3', 'user-4'],
    });

    await service.assignTask({
      requesterId: 'manager-1',
      projectId: 'project-1',
      id: 'task-1',
      assigneeIds: ['user-2', 'user-3', 'user-4', 'user-3'],
    } as never);

    expect(committed.taskEvents[0]).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ type: 'UNASSIGNED', subjectId: 'user-1' }),
        expect.objectContaining({ type: 'ASSIGNED', subjectId: 'user-3' }),
        expect.objectContaining({ type: 'ASSIGNED', subjectId: 'user-4' }),
      ]),
    });
    expect(committed.outbox).toHaveLength(1);
    expect(committed.outbox[0]).toMatchObject({
      payload: { taskId: 'task-1', assigneeIds: ['user-2', 'user-3', 'user-4'] },
    });
  });

  it('no emite evento agregado si el estado final de responsables no cambia', async () => {
    const { committed, service } = createHarness({
      beforeAssigneeIds: ['user-1', 'user-2'],
      assigneeIds: ['user-2', 'user-1'],
    });

    await service.assignTask({
      requesterId: 'manager-1',
      projectId: 'project-1',
      id: 'task-1',
      assigneeIds: ['user-2', 'user-1'],
    } as never);

    expect(committed.outbox).toEqual([]);
  });

  it('hace rollback de responsables sin dejar TaskEvent ni DomainOutbox parcial', async () => {
    const { committed, redis, service } = createHarness({
      assigneeIds: ['user-1'],
      failOutbox: true,
    });

    await expect(
      service.assignTask({
        requesterId: 'manager-1',
        projectId: 'project-1',
        id: 'task-1',
        assigneeIds: ['user-1'],
      } as never),
    ).rejects.toThrow('outbox unavailable');

    expect(committed).toEqual({ tasks: [], taskEvents: [], outbox: [] });
    expect(redis.del).not.toHaveBeenCalled();
    expect(redis.delByPrefix).not.toHaveBeenCalled();
  });

  it('rechaza asignar responsables a una tarea de otro proyecto antes de la transacción', async () => {
    const transaction = jest.fn();
    const service = new TasksService(
      {
        task: { findUnique: async () => task },
        $transaction: transaction,
      } as never,
      { del: jest.fn(), delByPrefix: jest.fn() } as never,
      { get: jest.fn() } as never,
    );
    jest.spyOn(service as any, 'assertPermission').mockResolvedValue(undefined);

    await expect(
      service.assignTask({
        requesterId: 'manager-1',
        projectId: 'project-2',
        id: 'task-1',
        assigneeIds: ['user-1'],
      } as never),
    ).rejects.toMatchObject({ error: { statusCode: 403 } });

    expect(transaction).not.toHaveBeenCalled();
  });
});
