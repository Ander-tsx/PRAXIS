import {
  AutomationEngineService,
  executeSequentially,
  executionCauseKey,
  runWithOneRetry,
} from './direct-execution';

describe('ejecución directa del MVP académico', () => {
  it('genera una causa estable para no repetir la misma ocurrencia', () => {
    const rule = { id: 'rule-a', version: 2 };
    const candidate = { taskId: 'task-a', context: { priority: 'HIGH' } };

    expect(executionCauseKey(rule, candidate)).toBe(executionCauseKey(rule, candidate));
    expect(executionCauseKey(rule, candidate)).not.toBe(
      executionCauseKey(rule, { ...candidate, context: { priority: 'LOW' } }),
    );
  });

  it('reintenta una sola vez una acción fallida', async () => {
    let attempts = 0;

    const result = await runWithOneRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('fallo temporal');
        return 'entregado';
      },
      async () => undefined,
    );

    expect(result).toEqual({ status: 'SUCCEEDED', attempts: 2, value: 'entregado' });
  });

  it('registra el segundo fallo y no intenta una tercera vez', async () => {
    let attempts = 0;

    const result = await runWithOneRetry(
      async () => {
        attempts += 1;
        throw new Error('servicio fuera de línea');
      },
      async () => undefined,
    );

    expect(attempts).toBe(2);
    expect(result).toEqual({
      status: 'FAILED',
      attempts: 2,
      error: { message: 'servicio fuera de línea' },
    });
  });

  it('ejecuta en orden y continúa con la siguiente acción tras un fallo definitivo', async () => {
    const order: string[] = [];

    const results = await executeSequentially(
      [
        async () => {
          order.push('primera');
          throw new Error('no entregada');
        },
        async () => {
          order.push('segunda');
          return 'ok';
        },
      ],
      async () => undefined,
    );

    expect(order).toEqual(['primera', 'primera', 'segunda']);
    expect(results).toMatchObject([
      { status: 'FAILED', attempts: 2 },
      { status: 'SUCCEEDED', attempts: 1 },
    ]);
  });

  it('revisa vencimientos, aplica AND y notifica a los responsables con auditoría', async () => {
    const today = new Date();
    today.setUTCDate(today.getUTCDate() + 1);
    const dueTomorrow = today.toISOString().slice(0, 10);
    const updates: Array<Record<string, unknown>> = [];
    const notifications: unknown[] = [];
    const prisma = {
      automationRule: {
        findMany: jest.fn(async () => [
          {
            id: 'rule-due',
            projectId: 'project-a',
            name: 'Vence pronto',
            version: 1,
            status: 'ENABLED',
            trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 2880 } },
            conditions: [{ field: 'priority', operator: 'EQUALS', value: 'HIGH', position: 0 }],
            actions: [
              {
                type: 'CREATE_NOTIFICATION',
                config: { recipientSelector: 'ASSIGNEES' },
                position: 0,
              },
            ],
          },
        ]),
      },
      ruleExecution: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }) => ({ id: 'execution-a', ...data })),
        update: jest.fn(async ({ data }) => {
          updates.push(data);
          return data;
        }),
      },
    };
    const tasksClient = {
      send: jest.fn(() =>
        require('rxjs').of({
          tareas: [
            {
              id: 'task-a',
              titulo: 'Entregar reporte',
              prioridad: 'HIGH',
              vence: dueTomorrow,
              cerrada: false,
              encargados: ['00000000-0000-4000-8000-000000000101'],
            },
            {
              id: 'task-b',
              titulo: 'Sin urgencia',
              prioridad: 'LOW',
              vence: dueTomorrow,
              cerrada: false,
              encargados: ['00000000-0000-4000-8000-000000000102'],
            },
          ],
          omitidas: 0,
        }),
      ),
    };
    const projectsClient = {
      send: jest.fn(({ cmd }: { cmd: string }, payload: unknown) => {
        if (cmd === 'project_find_one') {
          return require('rxjs').of({
            id: 'project-a',
            name: 'Proyecto A',
            ownerId: '00000000-0000-4000-8000-000000000100',
            status: 'ACTIVE',
          });
        }
        if (cmd === 'notification_create') {
          notifications.push(payload);
          return require('rxjs').of({ created: 1 });
        }
        throw new Error(`Comando inesperado: ${cmd}`);
      }),
    };
    const service = new AutomationEngineService(
      prisma as never,
      tasksClient as never,
      projectsClient as never,
    );

    await expect(service.reviewProject('project-a')).resolves.toEqual({
      rules: 1,
      candidates: 2,
      succeeded: 1,
      failed: 0,
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      notifications: [
        {
          userId: '00000000-0000-4000-8000-000000000101',
          type: 'AUTOMATION_TASK_DUE_SOON',
          taskId: 'task-a',
          taskTitle: 'Entregar reporte',
        },
      ],
    });
    expect(updates.at(-1)).toMatchObject({ status: 'SUCCEEDED' });
  });

  it('resuelve tareas estancadas desde historial y avisa al dueño del proyecto', async () => {
    const notifications: unknown[] = [];
    const prisma = {
      automationRule: {
        findMany: jest.fn(async () => [
          {
            id: 'rule-stale',
            projectId: 'project-a',
            name: 'Tarea estancada',
            version: 1,
            status: 'ENABLED',
            trigger: { type: 'TASK_STALE', config: { days: 5 } },
            conditions: [],
            actions: [
              {
                type: 'CREATE_NOTIFICATION',
                config: { recipientSelector: 'PROJECT_OWNER' },
                position: 0,
              },
            ],
          },
        ]),
      },
      ruleExecution: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }) => ({ id: 'execution-b', ...data })),
        update: jest.fn(async ({ data }) => data),
      },
    };
    const tasksClient = {
      send: jest.fn(({ cmd }: { cmd: string }, payload: unknown) => {
        expect(cmd).toBe('task_stats_stale');
        expect(payload).toEqual({ projectId: 'project-a', dias: 5 });
        return require('rxjs').of([
          { taskId: 'task-stale', titulo: 'Revisión', diasParada: 8, vencida: false },
        ]);
      }),
    };
    const projectsClient = {
      send: jest.fn(({ cmd }: { cmd: string }, payload: unknown) => {
        if (cmd === 'project_find_one') {
          return require('rxjs').of({
            id: 'project-a',
            name: 'Proyecto A',
            ownerId: '00000000-0000-4000-8000-000000000100',
            status: 'ACTIVE',
          });
        }
        notifications.push(payload);
        return require('rxjs').of({ created: 1 });
      }),
    };
    const service = new AutomationEngineService(
      prisma as never,
      tasksClient as never,
      projectsClient as never,
    );

    await service.reviewProject('project-a');

    expect(notifications[0]).toMatchObject({
      notifications: [
        {
          userId: '00000000-0000-4000-8000-000000000100',
          type: 'AUTOMATION_TASK_STALE',
          taskId: 'task-stale',
        },
      ],
    });
  });
});
