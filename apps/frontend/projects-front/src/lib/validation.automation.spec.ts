import { describe, expect, it } from 'vitest';
import { coerceConditionValue, emptyDraft } from './automation-draft';
import { validateAutomationDraft } from './validation';

function reglaValida() {
  const draft = emptyDraft('TASK_DUE_SOON');
  draft.name = 'Avisar vencimiento';
  return draft;
}

describe('validateAutomationDraft', () => {
  it('acepta una regla mínima válida', () => {
    expect(validateAutomationDraft(reglaValida())).toBeNull();
  });

  it('rechaza un nombre vacío', () => {
    const draft = reglaValida();
    draft.name = '  ';
    expect(validateAutomationDraft(draft)?.mensaje).toMatch(/nombre/i);
  });

  it('rechaza un nombre de más de 120 caracteres', () => {
    const draft = reglaValida();
    draft.name = 'x'.repeat(121);
    expect(validateAutomationDraft(draft)?.mensaje).toMatch(/120/);
  });

  it('rechaza una descripción de más de 1000 caracteres', () => {
    const draft = reglaValida();
    draft.description = 'x'.repeat(1001);
    expect(validateAutomationDraft(draft)?.mensaje).toMatch(/1000/);
  });

  it('rechaza leadTimeMinutes ausente en TASK_DUE_SOON', () => {
    const draft = reglaValida();
    // biome-ignore lint/performance/noDelete: simula un campo requerido que no llegó
    delete (draft.triggerConfig as Record<string, unknown>).leadTimeMinutes;
    expect(validateAutomationDraft(draft)?.mensaje).toMatch(/[Ll]ead|antelaci/);
  });

  it('rechaza leadTimeMinutes menor a 1', () => {
    const draft = reglaValida();
    draft.triggerConfig.leadTimeMinutes = 0;
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('acepta days ausente en TASK_STALE (opcional, el servidor pone 7)', () => {
    const draft = emptyDraft('TASK_STALE');
    draft.name = 'Avisar estancamiento';
    // biome-ignore lint/performance/noDelete: days es opcional
    delete (draft.triggerConfig as Record<string, unknown>).days;
    expect(validateAutomationDraft(draft)).toBeNull();
  });

  it('rechaza cero acciones', () => {
    const draft = reglaValida();
    draft.actions = [];
    expect(validateAutomationDraft(draft)?.mensaje).toMatch(/acci/i);
  });

  it('rechaza seis acciones', () => {
    const draft = reglaValida();
    draft.actions = Array(6).fill({ type: 'CREATE_NOTIFICATION' });
    expect(validateAutomationDraft(draft)?.mensaje).toMatch(/cinco/i);
  });

  it('rechaza un campo de condición del otro trigger', () => {
    const draft = reglaValida();
    draft.conditions = [{ field: 'staleDays', operator: 'EQUALS', value: 3 }];
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('rechaza IN con un valor escalar (no lista)', () => {
    const draft = reglaValida();
    draft.conditions = [{ field: 'priority', operator: 'IN', value: 'HIGH' }];
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('rechaza EQUALS con una lista (no escalar)', () => {
    const draft = reglaValida();
    draft.conditions = [{ field: 'priority', operator: 'EQUALS', value: ['HIGH', 'URGENT'] }];
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('rechaza un entero no entero en assigneeCount', () => {
    const draft = reglaValida();
    draft.conditions = [{ field: 'assigneeCount', operator: 'EQUALS', value: 1.5 }];
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('rechaza un valor no booleano en overdue (TASK_STALE)', () => {
    const draft = emptyDraft('TASK_STALE');
    draft.name = 'Avisar estancamiento';
    draft.conditions = [{ field: 'overdue', operator: 'EQUALS', value: 'sí' }];
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('rechaza una fecha con formato inválido en dueDate', () => {
    const draft = reglaValida();
    draft.conditions = [{ field: 'dueDate', operator: 'EQUALS', value: '21/08/2026' }];
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('rechaza un valor de enum no reconocido en priority', () => {
    const draft = reglaValida();
    draft.conditions = [{ field: 'priority', operator: 'EQUALS', value: 'CASI_URGENTE' }];
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('acepta condiciones válidas combinadas por AND', () => {
    const draft = reglaValida();
    draft.conditions = [
      { field: 'priority', operator: 'EQUALS', value: 'HIGH' },
      { field: 'assigneeCount', operator: 'IN', value: [1, 2, 3] },
    ];
    expect(validateAutomationDraft(draft)).toBeNull();
  });

  /**
   * ⚠️ **La costura que estaba rota: lo que `coerceConditionValue` produce,
   * `validateAutomationDraft` lo tiene que aceptar.**
   *
   * `ConditionDraft.value` está documentado como «ya coaccionado», y la
   * validación lo comprueba con `Number.isInteger`, `typeof === 'boolean'` y
   * `Array.isArray`. Pero `ConditionsSection` guardaba el texto crudo del
   * campo —`'2'`, `'true'`, `'["3","5","8"]'`—, y un string nunca es ninguna
   * de esas tres cosas: **enteros, booleanos y listas no se podían guardar
   * desde la interfaz**, bloqueados por la validación de cliente antes de
   * llegar al servidor. Solo pasaban los enum y las fechas, que se validan
   * como texto y colaban por casualidad — que era justo el único tipo con
   * prueba.
   *
   * Esta prueba recorre los cinco tipos del catálogo con los dos operadores
   * que cambian la forma del valor, y es la que impide que la costura se
   * vuelva a abrir.
   */
  describe('lo que coerceConditionValue produce, la validación lo acepta', () => {
    const casos: Array<{ trigger: 'TASK_DUE_SOON' | 'TASK_STALE'; field: string; crudo: string }> =
      [
        { trigger: 'TASK_DUE_SOON', field: 'priority', crudo: 'HIGH' },
        { trigger: 'TASK_DUE_SOON', field: 'dueDate', crudo: '2026-08-21' },
        { trigger: 'TASK_DUE_SOON', field: 'assigneeCount', crudo: '2' },
        { trigger: 'TASK_STALE', field: 'staleDays', crudo: '30' },
        { trigger: 'TASK_STALE', field: 'overdue', crudo: 'true' },
        { trigger: 'TASK_STALE', field: 'withoutHistory', crudo: 'false' },
      ];

    for (const { trigger, field, crudo } of casos) {
      it(`${field} con EQUALS`, () => {
        const draft = emptyDraft(trigger);
        draft.name = 'Regla';
        draft.conditions = [
          {
            field,
            operator: 'EQUALS',
            value: coerceConditionValue(trigger, field, 'EQUALS', crudo),
          },
        ];
        expect(validateAutomationDraft(draft)).toBeNull();
      });
    }

    it('una lista escrita a mano con IN', () => {
      const draft = emptyDraft('TASK_STALE');
      draft.name = 'Regla';
      draft.conditions = [
        {
          field: 'staleDays',
          operator: 'IN',
          value: coerceConditionValue('TASK_STALE', 'staleDays', 'IN', '["3","5","8"]'),
        },
      ];
      expect(validateAutomationDraft(draft)).toBeNull();
    });

    it('una lista marcada por casillas con IN', () => {
      const draft = reglaValida();
      draft.conditions = [
        {
          field: 'priority',
          operator: 'IN',
          value: coerceConditionValue('TASK_DUE_SOON', 'priority', 'IN', '["HIGH","URGENT"]'),
        },
      ];
      expect(validateAutomationDraft(draft)).toBeNull();
    });
  });

  /**
   * Cada error dice **de qué parte del formulario habla**.
   *
   * Sin esto, `RuleDialog` no tenía forma de saberlo y los pintaba todos bajo
   * el campo «Nombre»: un error sobre una condición marcaba en rojo un campo
   * que estaba perfectamente bien, y quien lo leía buscaba el fallo donde no
   * estaba.
   */
  describe('el ámbito del error', () => {
    it('un nombre inválido es del nombre', () => {
      const draft = reglaValida();
      draft.name = '';
      expect(validateAutomationDraft(draft)?.ambito).toBe('name');
    });

    it('una descripción demasiado larga es de la descripción', () => {
      const draft = reglaValida();
      draft.description = 'x'.repeat(1001);
      expect(validateAutomationDraft(draft)?.ambito).toBe('description');
    });

    it('una configuración de trigger inválida es del trigger', () => {
      const draft = reglaValida();
      draft.triggerConfig.leadTimeMinutes = 0;
      expect(validateAutomationDraft(draft)?.ambito).toBe('trigger');
    });

    it('un valor de condición inválido es de las condiciones', () => {
      const draft = reglaValida();
      draft.conditions = [{ field: 'assigneeCount', operator: 'EQUALS', value: 1.5 }];
      expect(validateAutomationDraft(draft)?.ambito).toBe('conditions');
    });

    it('quedarse sin acciones es de las acciones', () => {
      const draft = reglaValida();
      draft.actions = [];
      expect(validateAutomationDraft(draft)?.ambito).toBe('actions');
    });
  });
});
