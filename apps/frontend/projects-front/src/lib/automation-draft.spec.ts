import type { AutomationRule } from '@praxis/commons/api/domain';
import { describe, expect, it } from 'vitest';
import {
  bodyFromDraft,
  coerceConditionValue,
  describeRule,
  draftFromFormData,
  draftFromRule,
  emptyDraft,
} from './automation-draft';

const reglaVencimiento: AutomationRule = {
  id: 'rule-1',
  projectId: 'project-1',
  name: 'Avisar vencimiento',
  description: null,
  status: 'ENABLED',
  version: 2,
  createdBy: 'user-1',
  trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 4320 } },
  conditions: [{ field: 'priority', operator: 'EQUALS', value: 'HIGH', position: 0 }],
  actions: [
    { type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' }, position: 0 },
  ],
  createdAt: '2026-08-19T00:00:00.000Z',
  updatedAt: '2026-08-19T00:00:00.000Z',
};

const reglaEstancada: AutomationRule = {
  ...reglaVencimiento,
  id: 'rule-2',
  name: 'Avisar estancamiento',
  trigger: { type: 'TASK_STALE', config: { days: 5 } },
  conditions: [],
  actions: [
    { type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'PROJECT_OWNER' }, position: 0 },
  ],
};

describe('emptyDraft', () => {
  it('rellena triggerConfig con los valores por defecto del catálogo', () => {
    expect(emptyDraft('TASK_DUE_SOON').triggerConfig).toEqual({ leadTimeMinutes: 1440 });
    expect(emptyDraft('TASK_STALE').triggerConfig).toEqual({ days: 7 });
  });

  it('nace sin condiciones y con la única acción del trigger', () => {
    const draft = emptyDraft('TASK_DUE_SOON');
    expect(draft.conditions).toEqual([]);
    expect(draft.actions).toEqual([{ type: 'CREATE_NOTIFICATION' }]);
  });

  it('nace en DISABLED, igual que el valor por defecto del servidor', () => {
    expect(emptyDraft('TASK_DUE_SOON').status).toBe('DISABLED');
  });
});

describe('draftFromRule ⇄ bodyFromDraft', () => {
  it('ida y vuelta sin pérdida para una regla con condiciones', () => {
    const draft = draftFromRule(reglaVencimiento);
    const body = bodyFromDraft(draft);
    expect(body).toEqual({
      name: 'Avisar vencimiento',
      trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 4320 } },
      conditions: [{ field: 'priority', operator: 'EQUALS', value: 'HIGH' }],
      actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' } }],
      status: 'ENABLED',
    });
  });

  it('ida y vuelta sin pérdida para una regla sin condiciones', () => {
    const draft = draftFromRule(reglaEstancada);
    const body = bodyFromDraft(draft);
    expect(body).toEqual({
      name: 'Avisar estancamiento',
      trigger: { type: 'TASK_STALE', config: { days: 5 } },
      conditions: [],
      actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'PROJECT_OWNER' } }],
      status: 'ENABLED',
    });
  });

  it('bodyFromDraft no emite ninguna clave que el DTO no declare', () => {
    const body = bodyFromDraft(draftFromRule(reglaVencimiento));
    expect(Object.keys(body).sort()).toEqual(
      ['actions', 'conditions', 'name', 'status', 'trigger'].sort(),
    );
  });

  it('description solo se envía si tiene contenido', () => {
    const conDescripcion = draftFromRule({ ...reglaVencimiento, description: 'Nota' });
    expect(bodyFromDraft(conDescripcion)).toMatchObject({ description: 'Nota' });

    const sinDescripcion = draftFromRule({ ...reglaVencimiento, description: null });
    expect(bodyFromDraft(sinDescripcion)).not.toHaveProperty('description');
  });

  it('un status de solo lectura del servidor (PAUSED_SYSTEM/INVALID) colapsa a DISABLED en el borrador', () => {
    const draft = draftFromRule({ ...reglaVencimiento, status: 'PAUSED_SYSTEM' });
    expect(draft.status).toBe('DISABLED');
  });
});

describe('coerceConditionValue', () => {
  it('coacciona un entero', () => {
    expect(coerceConditionValue('TASK_DUE_SOON', 'assigneeCount', 'EQUALS', '3')).toBe(3);
  });

  it('coacciona un booleano', () => {
    expect(coerceConditionValue('TASK_STALE', 'overdue', 'EQUALS', 'true')).toBe(true);
    expect(coerceConditionValue('TASK_STALE', 'overdue', 'EQUALS', 'false')).toBe(false);
  });

  it('deja una fecha y un enum como texto', () => {
    expect(coerceConditionValue('TASK_DUE_SOON', 'dueDate', 'EQUALS', '2026-08-21')).toBe(
      '2026-08-21',
    );
    expect(coerceConditionValue('TASK_DUE_SOON', 'priority', 'EQUALS', 'HIGH')).toBe('HIGH');
  });

  it('con IN, parsea una lista JSON y coacciona cada elemento', () => {
    expect(coerceConditionValue('TASK_DUE_SOON', 'priority', 'IN', '["HIGH","URGENT"]')).toEqual([
      'HIGH',
      'URGENT',
    ]);
    expect(coerceConditionValue('TASK_STALE', 'staleDays', 'IN', '[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('con IN y una entrada que no es JSON válido, no truena: devuelve una lista vacía', () => {
    expect(coerceConditionValue('TASK_DUE_SOON', 'priority', 'IN', 'no-es-json')).toEqual([]);
  });
});

describe('describeRule', () => {
  it('describe una regla con condición en una frase legible', () => {
    expect(describeRule(reglaVencimiento)).toBe(
      'Cuando tarea próxima a vencer, si prioridad es Alta, entonces avisa a los responsables de la tarea.',
    );
  });

  it('describe una regla sin condiciones, sin la cláusula "si"', () => {
    expect(describeRule(reglaEstancada)).toBe(
      'Cuando tarea estancada, entonces avisa al dueño del proyecto.',
    );
  });
});

/** Construye el `FormData` que emite `RuleDialog`, sin depender del DOM real. */
function formDataDe(entradas: Array<[string, string]>): FormData {
  const formData = new FormData();
  for (const [nombre, valor] of entradas) formData.append(nombre, valor);
  return formData;
}

describe('draftFromFormData', () => {
  it('reconstruye nombre, descripción, trigger y config', () => {
    const draft = draftFromFormData(
      formDataDe([
        ['name', 'Avisar vencimiento'],
        ['description', 'Nota'],
        ['triggerType', 'TASK_DUE_SOON'],
        ['triggerConfig.leadTimeMinutes', '4320'],
        ['enabled', 'on'],
      ]),
    );
    expect(draft).toMatchObject({
      name: 'Avisar vencimiento',
      description: 'Nota',
      triggerType: 'TASK_DUE_SOON',
      triggerConfig: { leadTimeMinutes: 4320 },
      status: 'ENABLED',
    });
  });

  it('sin "enabled" en el FormData, el estado es DISABLED', () => {
    const draft = draftFromFormData(
      formDataDe([
        ['name', 'x'],
        ['triggerType', 'TASK_DUE_SOON'],
      ]),
    );
    expect(draft.status).toBe('DISABLED');
  });

  /**
   * ⚠️ **La invariante de D4.** Tres condiciones, la del medio booleana con
   * valor «No» — el caso exacto que un `<input type="checkbox">` sin marcar
   * rompería, porque un checkbox así **no se envía en el `FormData`** y
   * desplazaría la condición 3 al hueco de la 2. `ConditionsSection` usa un
   * `<Select>` para los booleanos justo para evitar esto; esta prueba fija
   * que la reconstrucción respeta el orden aunque el valor sea "falso".
   */
  it('tres condiciones con la del medio booleana en «No» se guardan cada una en su fila', () => {
    const draft = draftFromFormData(
      formDataDe([
        ['triggerType', 'TASK_STALE'],
        ['conditionField', 'staleDays'],
        ['conditionOperator', 'EQUALS'],
        ['conditionValue', '5'],
        ['conditionField', 'overdue'],
        ['conditionOperator', 'EQUALS'],
        ['conditionValue', 'false'],
        ['conditionField', 'withoutHistory'],
        ['conditionOperator', 'EQUALS'],
        ['conditionValue', 'true'],
      ]),
    );

    expect(draft.conditions).toEqual([
      { field: 'staleDays', operator: 'EQUALS', value: 5 },
      { field: 'overdue', operator: 'EQUALS', value: false },
      { field: 'withoutHistory', operator: 'EQUALS', value: true },
    ]);
  });

  it('reconstruye la única acción del trigger', () => {
    const draft = draftFromFormData(
      formDataDe([
        ['triggerType', 'TASK_DUE_SOON'],
        ['actionType', 'CREATE_NOTIFICATION'],
      ]),
    );
    expect(draft.actions).toEqual([{ type: 'CREATE_NOTIFICATION' }]);
  });

  it('sin condiciones en el FormData, el borrador nace con la lista vacía', () => {
    const draft = draftFromFormData(formDataDe([['triggerType', 'TASK_DUE_SOON']]));
    expect(draft.conditions).toEqual([]);
  });
});
