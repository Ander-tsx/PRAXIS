import { validateRuleDefinition } from './rule-definition';

describe('validateRuleDefinition', () => {
  const base = {
    name: 'Avisar vencimiento',
    trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 60 } },
    conditions: [{ field: 'priority', operator: 'EQUALS', value: 'HIGH' }],
    actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' } }],
  };

  it('acepta la definición MVP con condiciones AND y acción ordenada', () => {
    expect(validateRuleDefinition(base)).toEqual({
      ...base,
      status: 'DISABLED',
      conditions: [{ ...base.conditions[0], position: 0 }],
      actions: [{ ...base.actions[0], position: 0 }],
    });
  });

  it('rechaza más de cinco acciones', () => {
    expect(() =>
      validateRuleDefinition({
        ...base,
        actions: Array.from({ length: 6 }, () => base.actions[0]),
      }),
    ).toThrow('cinco acciones');
  });

  it('no permite que un cliente pause o invalide reglas', () => {
    expect(() => validateRuleDefinition({ ...base, status: 'PAUSED_SYSTEM' as never })).toThrow(
      'Solo el sistema',
    );
  });

  it('aplica siete días por defecto al trigger de tarea estancada', () => {
    expect(
      validateRuleDefinition({
        ...base,
        trigger: { type: 'TASK_STALE', config: {} },
        conditions: [],
        actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'PROJECT_OWNER' } }],
      }).trigger.config,
    ).toEqual({ days: 7 });
  });

  it('rechaza claves no catalogadas en configuraciones discriminadas', () => {
    expect(() =>
      validateRuleDefinition({
        ...base,
        trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 30, extra: true } },
      }),
    ).toThrow('Configuración de trigger inválida');
  });

  it('rechaza triggers y acciones que quedaron fuera del MVP académico', () => {
    expect(() =>
      validateRuleDefinition({
        ...base,
        trigger: { type: 'GITHUB_PULL_REQUEST_OPENED', config: {} },
      }),
    ).toThrow('Trigger no soportado en el MVP académico');

    expect(() =>
      validateRuleDefinition({
        ...base,
        actions: [
          {
            type: 'MOVE_TASK',
            config: { targetColumnId: '00000000-0000-4000-8000-000000000001' },
          },
        ],
      }),
    ).toThrow('Acción no soportada en el MVP académico');
  });

  it('solo admite destinatarios resolubles por los dos triggers académicos', () => {
    expect(() =>
      validateRuleDefinition({
        ...base,
        actions: [
          { type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'PROJECT_MANAGER' } },
        ],
      }),
    ).toThrow('recipientSelector');

    expect(
      validateRuleDefinition({
        ...base,
        trigger: { type: 'TASK_STALE', config: { days: 3 } },
        conditions: [],
        actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'PROJECT_OWNER' } }],
      }).actions[0],
    ).toMatchObject({ config: { recipientSelector: 'PROJECT_OWNER' } });
  });

  it('restringe campos y operadores al catálogo de cada trigger', () => {
    expect(() =>
      validateRuleDefinition({
        ...base,
        conditions: [{ field: 'staleDays', operator: 'EQUALS', value: 3 }],
      }),
    ).toThrow('Campo de condición no soportado');

    expect(() =>
      validateRuleDefinition({
        ...base,
        conditions: [{ field: 'priority', operator: 'GREATER_THAN', value: 'HIGH' }],
      }),
    ).toThrow('Operador de condición no soportado');

    expect(
      validateRuleDefinition({
        ...base,
        trigger: { type: 'TASK_STALE', config: { days: 3 } },
        conditions: [{ field: 'staleDays', operator: 'IN', value: [3, 4] }],
        actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'PROJECT_OWNER' } }],
      }).conditions[0],
    ).toMatchObject({ field: 'staleDays', operator: 'IN' });
  });

  it('valida la forma del operador y el tipo de valor del campo', () => {
    expect(() =>
      validateRuleDefinition({
        ...base,
        conditions: [{ field: 'priority', operator: 'IN', value: 'HIGH' }],
      }),
    ).toThrow('IN requiere una lista');

    expect(() =>
      validateRuleDefinition({
        ...base,
        trigger: { type: 'TASK_STALE', config: { days: 3 } },
        conditions: [{ field: 'overdue', operator: 'EQUALS', value: 'true' }],
        actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'PROJECT_OWNER' } }],
      }),
    ).toThrow('Valor de condición inválido');

    expect(() =>
      validateRuleDefinition({
        ...base,
        conditions: [{ field: 'assigneeCount', operator: 'EQUALS', value: [1] }],
      }),
    ).toThrow('EQUALS requiere un valor escalar');
  });
});
