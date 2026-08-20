import { of } from 'rxjs';

import {
  AutomationEngineService,
  executeSequentially,
  executionCauseKey,
  runWithOneRetry,
} from './direct-execution';

const DUENO = '00000000-0000-4000-8000-000000000100';
const ANA = '00000000-0000-4000-8000-000000000101';
const LUIS = '00000000-0000-4000-8000-000000000102';
const AUTOR = '00000000-0000-4000-8000-0000000001aa';
const COLUMNA_HECHO = '00000000-0000-4000-8000-0000000002cc';

const manana = () => {
  const fecha = new Date();
  fecha.setUTCDate(fecha.getUTCDate() + 1);
  return fecha.toISOString().slice(0, 10);
};

const ayer = (dias = 1) => {
  const fecha = new Date();
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return fecha.toISOString().slice(0, 10);
};

/** Un banco de pruebas con las tres dependencias del motor ya de mentira. */
function montar(opciones: {
  rules: unknown[];
  tasks?: unknown[];
  stale?: unknown[];
  task?: unknown;
  columnas?: unknown[];
  ejecucionesRecientes?: number;
  crearFalla?: () => never;
  project?: Record<string, unknown> | null;
}) {
  const updates: Array<Record<string, unknown>> = [];
  const creadas: Array<Record<string, unknown>> = [];
  const enviados: Array<{ cmd: string; payload: unknown }> = [];
  const reglasActualizadas: Array<Record<string, unknown>> = [];

  const prisma = {
    automationRule: {
      findMany: jest.fn(async () => opciones.rules),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        reglasActualizadas.push(data);
        return data;
      }),
    },
    ruleExecution: {
      count: jest.fn(async () => opciones.ejecucionesRecientes ?? 0),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (opciones.crearFalla) opciones.crearFalla();
        creadas.push(data);
        return { id: `execution-${creadas.length}` };
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return data;
      }),
    },
  };

  const tasksClient = {
    send: jest.fn(({ cmd }: { cmd: string }, payload: unknown) => {
      enviados.push({ cmd, payload });
      if (cmd === 'task_find_by_project') return of(opciones.tasks ?? []);
      if (cmd === 'task_stats_stale') return of(opciones.stale ?? []);
      if (cmd === 'task_find_one') return of(opciones.task ?? null);
      return of({ ok: true });
    }),
  };

  const projectsClient = {
    send: jest.fn(({ cmd }: { cmd: string }, payload: unknown) => {
      enviados.push({ cmd, payload });
      if (cmd === 'project_find_one') {
        return of(
          opciones.project === undefined
            ? { id: 'project-a', name: 'Proyecto A', ownerId: DUENO, status: 'ACTIVE' }
            : opciones.project,
        );
      }
      if (cmd === 'column_find_by_ids') return of(opciones.columnas ?? []);
      return of({ created: 1 });
    }),
  };

  return {
    servicio: new AutomationEngineService(
      prisma as never,
      tasksClient as never,
      projectsClient as never,
    ),
    prisma,
    updates,
    creadas,
    enviados,
    reglasActualizadas,
    avisos: () => enviados.filter((envio) => envio.cmd === 'notification_create'),
  };
}

const reglaAviso = (extra: Record<string, unknown> = {}) => ({
  id: 'rule-due',
  projectId: 'project-a',
  name: 'Vence pronto',
  version: 1,
  createdBy: AUTOR,
  status: 'ENABLED',
  trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 2880 } },
  conditions: [{ field: 'priority', operator: 'EQUALS', value: 'HIGH', position: 0 }],
  actions: [
    { type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' }, position: 0 },
  ],
  ...extra,
});

const tarea = (extra: Record<string, unknown> = {}) => ({
  id: 'task-a',
  title: 'Entregar reporte',
  priority: 'HIGH',
  dueDate: manana(),
  columnId: '00000000-0000-4000-8000-0000000002aa',
  boardId: '00000000-0000-4000-8000-0000000002bb',
  completedAt: null,
  createdAt: ayer(3),
  assignees: [{ userId: ANA }],
  labels: [],
  ...extra,
});

describe('reintentos y orden de las acciones', () => {
  it('reintenta una sola vez una acción fallida', async () => {
    let intentos = 0;
    const resultado = await runWithOneRetry(
      async () => {
        intentos += 1;
        if (intentos === 1) throw new Error('fallo temporal');
        return 'entregado';
      },
      async () => undefined,
    );
    expect(resultado).toEqual({ status: 'SUCCEEDED', attempts: 2, value: 'entregado' });
  });

  it('registra el segundo fallo y no intenta una tercera vez', async () => {
    let intentos = 0;
    const resultado = await runWithOneRetry(
      async () => {
        intentos += 1;
        throw new Error('servicio fuera de línea');
      },
      async () => undefined,
    );
    expect(intentos).toBe(2);
    expect(resultado).toMatchObject({ status: 'FAILED', attempts: 2 });
  });

  it('ejecuta en orden y continúa con la siguiente tras un fallo definitivo', async () => {
    const orden: string[] = [];
    const resultados = await executeSequentially(
      [
        async () => {
          orden.push('primera');
          throw new Error('no entregada');
        },
        async () => {
          orden.push('segunda');
          return 'ok';
        },
      ],
      async () => undefined,
    );
    expect(orden).toEqual(['primera', 'primera', 'segunda']);
    expect(resultados).toMatchObject([{ status: 'FAILED' }, { status: 'SUCCEEDED' }]);
  });
});

describe('la clave de una causa', () => {
  const regla = { id: 'rule-a', version: 2 };
  const candidata = { task: { id: 'task-a' }, context: { priority: 'HIGH' } };

  it('es estable para la misma causa', () =>
    expect(executionCauseKey(regla, candidata)).toBe(executionCauseKey(regla, candidata)));

  it('cambia si cambia el contexto', () =>
    expect(executionCauseKey(regla, candidata)).not.toBe(
      executionCauseKey(regla, { ...candidata, context: { priority: 'LOW' } }),
    ));

  /** Editar una regla sube su versión, y eso reabre lo ya visto. */
  it('cambia si cambia la versión de la regla', () =>
    expect(executionCauseKey(regla, candidata)).not.toBe(
      executionCauseKey({ ...regla, version: 3 }, candidata),
    ));

  /** Un barrido y un hecho sobre la misma tarea son dos causas distintas. */
  it('distingue el barrido del evento', () =>
    expect(executionCauseKey(regla, candidata, 'manual')).not.toBe(
      executionCauseKey(regla, candidata, 'event'),
    ));
});

describe('revisión de barrido', () => {
  it('aplica las condiciones y avisa solo a quien toca', async () => {
    const banco = montar({
      rules: [reglaAviso()],
      tasks: [
        tarea(),
        tarea({
          id: 'task-b',
          title: 'Sin urgencia',
          priority: 'LOW',
          assignees: [{ userId: LUIS }],
        }),
      ],
    });

    await expect(banco.servicio.reviewProject('project-a')).resolves.toEqual({
      rules: 1,
      candidates: 2,
      succeeded: 1,
      failed: 0,
      filtered: 1,
      repeated: 0,
    });

    expect(banco.avisos()).toHaveLength(1);
    expect(banco.avisos()[0].payload).toMatchObject({
      notifications: [{ userId: ANA, type: 'AUTOMATION_TASK_DUE_SOON', taskId: 'task-a' }],
    });
  });

  /**
   * 🔴 El resumen decía «0 avisos» tanto si las condiciones no se cumplían como
   * si ya se había avisado ayer. Son dos situaciones opuestas.
   */
  it('cuenta aparte las filtradas y las repetidas', async () => {
    const banco = montar({
      rules: [reglaAviso()],
      tasks: [tarea(), tarea({ id: 'task-b', priority: 'LOW' })],
      crearFalla: () => {
        throw Object.assign(new Error('duplicado'), { code: 'P2002' });
      },
    });

    await expect(banco.servicio.reviewProject('project-a')).resolves.toMatchObject({
      repeated: 2,
      succeeded: 0,
      filtered: 0,
    });
  });

  /**
   * 🔴 **El aviso decía a quién se le contaba, no lo que había pasado.**
   *
   * El tipo salía de `recipientSelector`: «avisar a quien lleva el proyecto»
   * mandaba siempre `AUTOMATION_TASK_STALE`. Con «cuando se cree una tarea»,
   * eso es un aviso que dice «lleva varios días sin movimiento» sobre una tarea
   * de hace un segundo. Ahora el motivo lo pone el disparador y el destinatario
   * sigue siendo cosa de la regla.
   */
  it('el aviso lo decide el disparador, no el destinatario', async () => {
    const banco = montar({
      rules: [
        reglaAviso({
          trigger: { type: 'TASK_OVERDUE', config: { minDaysOverdue: 0 } },
          conditions: [],
          actions: [
            {
              type: 'CREATE_NOTIFICATION',
              config: { recipientSelector: 'PROJECT_OWNER' },
              position: 0,
            },
          ],
        }),
      ],
      tasks: [tarea({ dueDate: ayer(3) })],
    });

    await banco.servicio.reviewProject('project-a');

    expect(banco.avisos()[0].payload).toMatchObject({
      notifications: [{ userId: DUENO, type: 'AUTOMATION_TASK_OVERDUE' }],
    });
  });

  it('guarda en la ejecución qué tarea fue y qué la disparó', async () => {
    const banco = montar({ rules: [reglaAviso()], tasks: [tarea()] });
    await banco.servicio.reviewProject('project-a');

    expect(banco.creadas[0]).toMatchObject({
      triggerType: 'TASK_DUE_SOON',
      subjectId: 'task-a',
      subjectTitle: 'Entregar reporte',
    });
  });

  /** Guardaba la regla entera —condiciones, acciones, configuración— por fila. */
  it('guarda un resumen de la regla, no un volcado entero', async () => {
    const banco = montar({ rules: [reglaAviso()], tasks: [tarea()] });
    await banco.servicio.reviewProject('project-a');

    expect(banco.creadas[0].ruleSnapshot).toEqual({
      id: 'rule-due',
      name: 'Vence pronto',
      version: 1,
      trigger: 'TASK_DUE_SOON',
      actions: ['CREATE_NOTIFICATION'],
    });
  });

  it('una regla reactiva no entra en el barrido', async () => {
    const banco = montar({
      rules: [reglaAviso({ trigger: { type: 'TASK_MOVED', config: {} }, conditions: [] })],
      tasks: [tarea()],
    });
    await expect(banco.servicio.reviewProject('project-a')).resolves.toMatchObject({
      rules: 0,
      candidates: 0,
    });
  });

  describe('disparadores nuevos', () => {
    it('vencida: elige solo las que ya pasaron su fecha y respeta el mínimo', async () => {
      const banco = montar({
        rules: [
          reglaAviso({
            trigger: { type: 'TASK_OVERDUE', config: { minDaysOverdue: 2 } },
            conditions: [],
          }),
        ],
        tasks: [
          tarea({ id: 'vencida-hace-5', dueDate: ayer(5) }),
          tarea({ id: 'vencida-hoy', dueDate: ayer(0) }),
          tarea({ id: 'aun-no', dueDate: manana() }),
        ],
      });

      await expect(banco.servicio.reviewProject('project-a')).resolves.toMatchObject({
        candidates: 1,
        succeeded: 1,
      });
      expect(banco.creadas[0]).toMatchObject({ subjectId: 'vencida-hace-5' });
    });

    it('sin encargado: solo las que no tienen a nadie', async () => {
      const banco = montar({
        rules: [
          reglaAviso({
            trigger: { type: 'TASK_UNASSIGNED', config: { minAgeDays: 1 } },
            conditions: [],
            actions: [
              {
                type: 'CREATE_NOTIFICATION',
                config: { recipientSelector: 'PROJECT_OWNER' },
                position: 0,
              },
            ],
          }),
        ],
        tasks: [tarea({ id: 'huerfana', assignees: [] }), tarea({ id: 'con-dueno' })],
      });

      await expect(banco.servicio.reviewProject('project-a')).resolves.toMatchObject({
        candidates: 1,
      });
      expect(banco.avisos()[0].payload).toMatchObject({
        notifications: [{ userId: DUENO, taskId: 'huerfana' }],
      });
    });

    it('estancada: cruza el historial con la tarea y avisa al dueño si no hay encargados', async () => {
      const banco = montar({
        rules: [
          reglaAviso({
            trigger: { type: 'TASK_STALE', config: { days: 5 } },
            conditions: [{ field: 'staleDays', operator: 'GTE', value: 8, position: 0 }],
            actions: [
              {
                type: 'CREATE_NOTIFICATION',
                config: { recipientSelector: 'PROJECT_OWNER' },
                position: 0,
              },
            ],
          }),
        ],
        tasks: [tarea({ id: 'task-stale', title: 'Revisión', assignees: [] })],
        stale: [{ taskId: 'task-stale', diasParada: 8, vencida: false }],
      });

      await banco.servicio.reviewProject('project-a');
      expect(banco.avisos()[0].payload).toMatchObject({
        notifications: [{ userId: DUENO, type: 'AUTOMATION_TASK_STALE', taskId: 'task-stale' }],
      });
    });
  });

  it('un proyecto suspendido no se revisa', async () => {
    const banco = montar({
      rules: [reglaAviso()],
      project: { id: 'project-a', ownerId: DUENO, status: 'SUSPENDED' },
    });
    await expect(banco.servicio.reviewProject('project-a')).rejects.toBeDefined();
  });
});

describe('reacción a un hecho de dominio', () => {
  const reglaMovida = reglaAviso({
    id: 'rule-moved',
    trigger: { type: 'TASK_MOVED', config: {} },
    conditions: [{ field: 'toColumnId', operator: 'EQUALS', value: COLUMNA_HECHO, position: 0 }],
  });

  it('evalúa la regla que escucha ese hecho y usa lo que trae el payload', async () => {
    const banco = montar({ rules: [reglaMovida], task: tarea() });

    await expect(
      banco.servicio.handleTaskEvent({
        type: 'task.moved.v1',
        projectId: 'project-a',
        subjectId: 'task-a',
        payload: { fromColumnId: 'x', toColumnId: COLUMNA_HECHO },
      }),
    ).resolves.toEqual({ evaluadas: 1, ejecutadas: 1 });

    expect(banco.avisos()).toHaveLength(1);
  });

  it('si la condición mira la columna de destino y no coincide, no actúa', async () => {
    const banco = montar({ rules: [reglaMovida], task: tarea() });

    await expect(
      banco.servicio.handleTaskEvent({
        type: 'task.moved.v1',
        projectId: 'project-a',
        subjectId: 'task-a',
        payload: { fromColumnId: 'x', toColumnId: 'otra' },
      }),
    ).resolves.toEqual({ evaluadas: 1, ejecutadas: 0 });
  });

  it('una regla de barrido no reacciona a ningún hecho', async () => {
    const banco = montar({ rules: [reglaAviso()], task: tarea() });
    await expect(
      banco.servicio.handleTaskEvent({
        type: 'task.moved.v1',
        projectId: 'project-a',
        subjectId: 'task-a',
        payload: {},
      }),
    ).resolves.toEqual({ evaluadas: 0, ejecutadas: 0 });
  });

  it('una tarea que ya no existe se da por atendida sin fallar', async () => {
    const banco = montar({ rules: [reglaMovida], task: null });
    await expect(
      banco.servicio.handleTaskEvent({
        type: 'task.moved.v1',
        projectId: 'project-a',
        subjectId: 'task-a',
        payload: { toColumnId: COLUMNA_HECHO },
      }),
    ).resolves.toEqual({ evaluadas: 1, ejecutadas: 0 });
  });
});

describe('acciones que escriben', () => {
  const conAccion = (accion: Record<string, unknown>) =>
    reglaAviso({ conditions: [], actions: [{ ...accion, position: 0 }] });

  it('mover resuelve antes si la columna de destino es de cierre', async () => {
    const banco = montar({
      rules: [conAccion({ type: 'MOVE_TASK', config: { targetColumnId: COLUMNA_HECHO } })],
      tasks: [tarea()],
      columnas: [{ id: COLUMNA_HECHO, name: 'Hecho', color: 'success' }],
    });

    await banco.servicio.reviewProject('project-a');

    const movimiento = banco.enviados.find((envio) => envio.cmd === 'task_move');
    expect(movimiento?.payload).toMatchObject({
      id: 'task-a',
      columnId: COLUMNA_HECHO,
      status: 'Hecho',
      isClosingColumn: true,
      /* 🔴 La identidad con la que escribe: quien creó la regla. Es lo que hace
         que `tasks-service` compruebe sus permisos y que una regla no pueda
         hacer nada que su autor no pudiera hacer a mano. */
      requesterId: AUTOR,
    });
  });

  it('asignar acumula en vez de sustituir la lista entera', async () => {
    const banco = montar({
      rules: [conAccion({ type: 'ASSIGN_TASK', config: { assigneeId: LUIS } })],
      tasks: [tarea()],
    });

    await banco.servicio.reviewProject('project-a');

    const asignacion = banco.enviados.find((envio) => envio.cmd === 'task_assign');
    expect(asignacion?.payload).toMatchObject({ assigneeIds: [ANA, LUIS] });
  });

  it('no repite un movimiento que ya estaba hecho', async () => {
    const banco = montar({
      rules: [conAccion({ type: 'MOVE_TASK', config: { targetColumnId: COLUMNA_HECHO } })],
      tasks: [tarea({ columnId: COLUMNA_HECHO })],
    });

    await banco.servicio.reviewProject('project-a');
    expect(banco.enviados.some((envio) => envio.cmd === 'task_move')).toBe(false);
  });

  it('el texto del chat admite {tarea} y {proyecto}', async () => {
    const banco = montar({
      rules: [conAccion({ type: 'POST_CHAT_MESSAGE', config: { text: '{tarea} en {proyecto}' } })],
      tasks: [tarea()],
    });

    await banco.servicio.reviewProject('project-a');
    const mensaje = banco.enviados.find((envio) => envio.cmd === 'chat_project_send');
    expect(mensaje?.payload).toMatchObject({ body: 'Entregar reporte en Proyecto A' });
  });

  /**
   * 🔴 Una regla que mueve produce un hecho de movimiento, que despierta a las
   * reglas de movimiento. El fusible existe para que eso no gire para siempre.
   */
  it('el freno de bucle para la regla y lo deja escrito', async () => {
    const banco = montar({
      rules: [conAccion({ type: 'MOVE_TASK', config: { targetColumnId: COLUMNA_HECHO } })],
      tasks: [tarea()],
      columnas: [{ id: COLUMNA_HECHO, name: 'Hecho', color: 'primary' }],
      ejecucionesRecientes: 999,
    });

    await expect(banco.servicio.reviewProject('project-a')).resolves.toMatchObject({ failed: 1 });
    expect(banco.enviados.some((envio) => envio.cmd === 'task_move')).toBe(false);
    expect(banco.updates.at(-1)).toMatchObject({
      status: 'FAILED',
      error: { message: expect.stringContaining('Freno de bucle') },
    });
  });

  /**
   * Un 403 no es un fallo pasajero: es una regla que ya no puede hacer lo que
   * promete. Reintentarla en cada revisión llenaría la auditoría sin arreglar
   * nada, porque lo que cambió es el rol de una persona.
   */
  it('un fallo de permisos pausa la regla con su motivo', async () => {
    const banco = montar({
      rules: [conAccion({ type: 'SET_PRIORITY', config: { priority: 'HIGH' } })],
      tasks: [tarea()],
    });
    /* `task_update` responde 403: quien creó la regla perdió `canEditTask`. */
    (
      banco.servicio as never as { tasksClient: { send: jest.Mock } }
    ).tasksClient.send.mockImplementation(({ cmd }: { cmd: string }) => {
      if (cmd === 'task_find_by_project') return of([tarea()]);
      throw new Error('Forbidden');
    });

    await banco.servicio.reviewProject('project-a');

    expect(banco.reglasActualizadas.at(-1)).toMatchObject({
      status: 'PAUSED_SYSTEM',
      pauseReason: expect.stringContaining('permiso'),
    });
  });
});
