import { describe, expect, it } from 'vitest';

import type { AutomationCatalog } from './automation-catalog';
import { type RuleDraft, emptyDraft } from './automation-draft';
import { validateAutomationDraft } from './validation';

const COLUMNA = '00000000-0000-4000-8000-0000000000c1';

const CATALOGO: AutomationCatalog = {
  operators: ['EQUALS', 'NOT_EQUALS', 'IN', 'GT', 'GTE', 'LT', 'LTE', 'CONTAINS'],
  triggers: [
    {
      type: 'TASK_DUE_SOON',
      kind: 'sweep',
      label: 'Una tarea va a vencer',
      sentence: 'una tarea esté a punto de vencer',
      description: '',
      config: [
        {
          key: 'leadTimeMinutes',
          label: 'Margen',
          kind: 'integer',
          min: 1,
          required: true,
          defaultValue: 1440,
        },
      ],
      fields: [
        {
          field: 'priority',
          label: 'Prioridad',
          kind: 'enum',
          operators: ['EQUALS', 'IN'],
          options: [{ value: 'HIGH', label: 'Alta' }],
        },
        {
          field: 'assigneeCount',
          label: 'Número de encargados',
          kind: 'integer',
          operators: ['EQUALS', 'GT'],
          min: 0,
        },
        {
          field: 'columnId',
          label: 'Columna',
          kind: 'uuid',
          operators: ['EQUALS'],
          source: 'columns',
        },
        { field: 'overdue', label: 'Está vencida', kind: 'boolean', operators: ['EQUALS'] },
      ],
    },
  ],
  actions: [
    {
      type: 'CREATE_NOTIFICATION',
      label: 'Avisar',
      sentence: 'avisa a',
      requires: null,
      config: [
        {
          key: 'recipientSelector',
          label: 'A quién',
          kind: 'enum',
          required: true,
          options: [{ value: 'ASSIGNEES', label: 'los encargados' }],
        },
      ],
    },
    {
      type: 'MOVE_TASK',
      label: 'Mover la tarea',
      sentence: 'muévela a',
      requires: 'canEditTask',
      config: [
        {
          key: 'targetColumnId',
          label: 'Columna',
          kind: 'uuid',
          required: true,
          source: 'columns',
        },
      ],
    },
    {
      type: 'ADD_COMMENT',
      label: 'Comentar',
      sentence: 'comenta',
      requires: 'canComment',
      config: [{ key: 'text', label: 'Comentario', kind: 'text', required: true, maxLength: 500 }],
    },
  ],
};

function reglaValida(): RuleDraft {
  const draft = emptyDraft(CATALOGO, 'TASK_DUE_SOON');
  draft.name = 'Avisar vencimiento';
  return draft;
}

const validar = (draft: RuleDraft) => validateAutomationDraft(CATALOGO, draft);

describe('validateAutomationDraft', () => {
  it('acepta una regla mínima válida', () => expect(validar(reglaValida())).toBeNull());

  describe('nombre y descripción', () => {
    it('rechaza un nombre vacío', () => {
      const draft = reglaValida();
      draft.name = '  ';
      expect(validar(draft)?.mensaje).toMatch(/nombre/i);
    });

    it('rechaza un nombre de más de 120 caracteres', () => {
      const draft = reglaValida();
      draft.name = 'x'.repeat(121);
      expect(validar(draft)?.mensaje).toMatch(/120/);
    });

    it('rechaza una descripción de más de 1000 caracteres', () => {
      const draft = reglaValida();
      draft.description = 'x'.repeat(1001);
      expect(validar(draft)?.mensaje).toMatch(/1000/);
    });

    /**
     * ⚠️ El ámbito existe para colocar el mensaje bajo el campo que falla: sin
     * él, un fallo en una condición marcaba en rojo el campo «Nombre» y mandaba
     * a corregir donde no estaba el problema.
     */
    it('el ámbito señala qué parte del formulario falla', () => {
      const draft = reglaValida();
      draft.name = '';
      expect(validar(draft)?.ambito).toBe('name');
    });
  });

  describe('disparador', () => {
    it('rechaza uno que no está en el catálogo', () => {
      const draft = reglaValida();
      draft.triggerType = 'LO_QUE_SEA';
      expect(validar(draft)?.ambito).toBe('trigger');
    });

    it('rechaza una configuración obligatoria que falta', () => {
      const draft = reglaValida();
      draft.triggerConfig = {};
      expect(validar(draft)?.mensaje).toMatch(/obligatorio/i);
    });

    it('rechaza un valor por debajo del mínimo', () => {
      const draft = reglaValida();
      draft.triggerConfig = { leadTimeMinutes: 0 };
      expect(validar(draft)?.mensaje).toMatch(/1 o más/);
    });
  });

  describe('acciones', () => {
    it('rechaza quedarse sin ninguna: el contrato exige al menos una', () => {
      const draft = reglaValida();
      draft.actions = [];
      expect(validar(draft)?.ambito).toBe('actions');
    });

    it('rechaza más de cinco', () => {
      const draft = reglaValida();
      draft.actions = Array.from({ length: 6 }, () => ({
        type: 'CREATE_NOTIFICATION',
        config: { recipientSelector: 'ASSIGNEES' },
      }));
      expect(validar(draft)?.mensaje).toMatch(/cinco/);
    });

    /**
     * ⚠️ Sin esto, una acción a medio configurar viaja y vuelve como un 400
     * sobre una clave interna que no aparece en ninguna etiqueta de la pantalla.
     */
    it('rechaza una acción con un campo obligatorio sin rellenar, y lo nombra', () => {
      const draft = reglaValida();
      draft.actions = [{ type: 'MOVE_TASK', config: {} }];
      expect(validar(draft)?.mensaje).toMatch(/Columna/);
    });

    it('rechaza un id que no es un id', () => {
      const draft = reglaValida();
      draft.actions = [{ type: 'MOVE_TASK', config: { targetColumnId: 'la de hecho' } }];
      expect(validar(draft)?.ambito).toBe('actions');
    });

    it('acepta una acción bien configurada', () => {
      const draft = reglaValida();
      draft.actions = [{ type: 'MOVE_TASK', config: { targetColumnId: COLUMNA } }];
      expect(validar(draft)).toBeNull();
    });

    it('rechaza un texto que pasa del máximo', () => {
      const draft = reglaValida();
      draft.actions = [{ type: 'ADD_COMMENT', config: { text: 'x'.repeat(501) } }];
      expect(validar(draft)?.mensaje).toMatch(/500/);
    });

    it('rechaza una acción que no existe', () => {
      const draft = reglaValida();
      draft.actions = [{ type: 'ENVIAR_PALOMA', config: {} }];
      expect(validar(draft)?.ambito).toBe('actions');
    });
  });

  describe('condiciones', () => {
    it('rechaza un campo que ese disparador no ofrece', () => {
      const draft = reglaValida();
      draft.conditions = [{ field: 'staleDays', operator: 'GTE', value: 3 }];
      expect(validar(draft)?.ambito).toBe('conditions');
    });

    /**
     * ⚠️ Contra los operadores **de ese campo**, no contra la lista entera:
     * `GT` existe, pero no sobre un booleano. Es la misma regla que aplica el
     * servidor, y comprobarla aquí la explica antes y con el nombre del campo.
     */
    it('rechaza un operador que ese campo no admite', () => {
      const draft = reglaValida();
      draft.conditions = [{ field: 'overdue', operator: 'GT', value: true }];
      expect(validar(draft)?.mensaje).toMatch(/no admite ese operador/);
    });

    it('acepta un operador de comparación sobre un entero', () => {
      const draft = reglaValida();
      draft.conditions = [{ field: 'assigneeCount', operator: 'GT', value: 1 }];
      expect(validar(draft)).toBeNull();
    });

    it('rechaza un valor fuera del catálogo de un enum', () => {
      const draft = reglaValida();
      draft.conditions = [{ field: 'priority', operator: 'EQUALS', value: 'ALTÍSIMA' }];
      expect(validar(draft)?.mensaje).toMatch(/catálogo/);
    });

    it('rechaza un id que no es un id', () => {
      const draft = reglaValida();
      draft.conditions = [{ field: 'columnId', operator: 'EQUALS', value: 'la primera' }];
      expect(validar(draft)?.mensaje).toMatch(/elige un valor/i);
    });

    it('con IN exige una lista con algo dentro', () => {
      const draft = reglaValida();
      draft.conditions = [{ field: 'priority', operator: 'IN', value: [] }];
      expect(validar(draft)?.mensaje).toMatch(/al menos un valor/);
    });

    it('con un operador suelto rechaza una lista', () => {
      const draft = reglaValida();
      draft.conditions = [{ field: 'priority', operator: 'EQUALS', value: ['HIGH'] }];
      expect(validar(draft)?.mensaje).toMatch(/un único valor/);
    });

    it('un entero que llega como texto se rechaza', () => {
      const draft = reglaValida();
      draft.conditions = [{ field: 'assigneeCount', operator: 'EQUALS', value: '2' }];
      expect(validar(draft)?.mensaje).toMatch(/número entero/);
    });

    it('un booleano que llega como texto se rechaza', () => {
      const draft = reglaValida();
      draft.conditions = [{ field: 'overdue', operator: 'EQUALS', value: 'true' }];
      expect(validar(draft)?.mensaje).toMatch(/sí o no/);
    });
  });
});
