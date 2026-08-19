import { validateRuleDefinition } from './rule-definition';

describe('validateRuleDefinition', () => {
  const base = {
    name: 'Mover al abrir PR',
    trigger: { type: 'GITHUB_PULL_REQUEST_OPENED', config: {} },
    conditions: [{ field: 'repositoryId', operator: 'EQUALS', value: '123' }],
    actions: [
      { type: 'MOVE_TASK', config: { targetColumnId: '00000000-0000-4000-8000-000000000001' } },
    ],
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
        actions: [
          { type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'PROJECT_MANAGER' } },
        ],
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
});
