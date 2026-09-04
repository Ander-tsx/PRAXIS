import type { AutomationRule } from '@praxis/commons/api/domain';
import { describe, expect, it } from 'vitest';

import type { AutomationCatalog } from './automation-catalog';
import {
  bodyFromDraft,
  coerceConditionValue,
  describeAction,
  describeConditions,
  describeExecutionContext,
  describeReviewSummary,
  describeRule,
  draftFromFormData,
  draftFromRule,
  emptyDraft,
} from './automation-draft';

const COLUMNA = '00000000-0000-4000-8000-0000000000c1';

const CATALOGO: AutomationCatalog = {
  operators: ['EQUALS', 'NOT_EQUALS', 'IN', 'GT', 'GTE', 'LT', 'LTE', 'CONTAINS'],
  triggers: [
    {
      type: 'TASK_DUE_SOON',
      kind: 'sweep',
      label: 'Una tarea va a vencer',
      sentence: 'una tarea esté a punto de vencer',
      description: 'Con vencimiento dentro del margen.',
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
          options: [
            { value: 'HIGH', label: 'Alta' },
            { value: 'LOW', label: 'Baja' },
          ],
        },
        {
          field: 'assigneeCount',
          label: 'Número de encargados',
          kind: 'integer',
          operators: ['EQUALS', 'GT'],
          min: 0,
        },
      ],
    },
    {
      type: 'TASK_STALE',
      kind: 'sweep',
      label: 'Una tarea lleva parada',
      sentence: 'una tarea lleve demasiado sin moverse',
      description: 'Sin movimiento.',
      config: [
        { key: 'days', label: 'Días', kind: 'integer', min: 1, required: false, defaultValue: 7 },
      ],
      fields: [
        { field: 'staleDays', label: 'Días parada', kind: 'integer', operators: ['GTE'], min: 0 },
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
          options: [
            { value: 'ASSIGNEES', label: 'los encargados' },
            { value: 'PROJECT_OWNER', label: 'quien lleva el proyecto' },
          ],
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
  ],
};

const PROYECTO = {
  columns: [{ value: COLUMNA, label: 'Hecho' }],
  labels: [],
  members: [],
};

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

describe('emptyDraft', () => {
  it('siembra la configuración con los valores por defecto del catálogo', () =>
    expect(emptyDraft(CATALOGO, 'TASK_DUE_SOON').triggerConfig).toEqual({
      leadTimeMinutes: 1440,
    }));

  it('arranca deshabilitado, como el valor por defecto del servidor', () =>
    expect(emptyDraft(CATALOGO, 'TASK_DUE_SOON').status).toBe('DISABLED'));

  it('arranca con una acción, no con ninguna: el contrato exige al menos una', () =>
    expect(emptyDraft(CATALOGO, 'TASK_DUE_SOON').actions).toHaveLength(1));
});

describe('draftFromRule', () => {
  it('conserva condiciones y acciones ordenadas por posición', () => {
    const draft = draftFromRule({
      ...reglaVencimiento,
      conditions: [
        { field: 'assigneeCount', operator: 'GT', value: 1, position: 1 },
        { field: 'priority', operator: 'EQUALS', value: 'HIGH', position: 0 },
      ],
    });
    expect(draft.conditions.map((una) => una.field)).toEqual(['priority', 'assigneeCount']);
  });

  /**
   * ⚠️ `PAUSED_SYSTEM` e `INVALID` los pone el sistema; reenviarlos da 400. Se
   * colapsan a `DISABLED`, la única forma editable de «no está corriendo».
   */
  it('colapsa un estado que el cliente no puede mandar', () =>
    expect(draftFromRule({ ...reglaVencimiento, status: 'PAUSED_SYSTEM' as never }).status).toBe(
      'DISABLED',
    ));

  it('conserva la configuración de cada acción', () =>
    expect(
      draftFromRule({
        ...reglaVencimiento,
        actions: [{ type: 'MOVE_TASK', config: { targetColumnId: COLUMNA }, position: 0 }],
      }).actions[0],
    ).toEqual({ type: 'MOVE_TASK', config: { targetColumnId: COLUMNA } }));
});

describe('bodyFromDraft', () => {
  it('no manda descripción cuando está vacía: un campo de más es un 400', () => {
    const body = bodyFromDraft({ ...emptyDraft(CATALOGO, 'TASK_DUE_SOON'), name: '  Regla  ' });
    expect(body).not.toHaveProperty('description');
    expect(body.name).toBe('Regla');
  });

  it('manda todas las acciones con su configuración', () => {
    const draft = emptyDraft(CATALOGO, 'TASK_DUE_SOON');
    draft.actions = [
      { type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' } },
      { type: 'MOVE_TASK', config: { targetColumnId: COLUMNA } },
    ];
    expect(bodyFromDraft(draft).actions).toEqual([
      { type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' } },
      { type: 'MOVE_TASK', config: { targetColumnId: COLUMNA } },
    ]);
  });
});

describe('draftFromFormData', () => {
  function formulario(entradas: Array<[string, string]>): FormData {
    const data = new FormData();
    for (const [clave, valor] of entradas) data.append(clave, valor);
    return data;
  }

  it('recompone las condiciones por posición y coacciona cada valor', () => {
    const draft = draftFromFormData(
      CATALOGO,
      formulario([
        ['name', 'Regla'],
        ['description', ''],
        ['triggerType', 'TASK_STALE'],
        ['triggerConfig.days', '5'],
        ['conditionField', 'staleDays'],
        ['conditionOperator', 'GTE'],
        ['conditionValue', '3'],
        ['conditionField', 'overdue'],
        ['conditionOperator', 'EQUALS'],
        ['conditionValue', 'true'],
        ['actionType', 'CREATE_NOTIFICATION'],
        ['actionConfig', '{"recipientSelector":"PROJECT_OWNER"}'],
      ]),
    );

    expect(draft.triggerConfig).toEqual({ days: 5 });
    expect(draft.conditions).toEqual([
      { field: 'staleDays', operator: 'GTE', value: 3 },
      { field: 'overdue', operator: 'EQUALS', value: true },
    ]);
    expect(draft.actions).toEqual([
      { type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'PROJECT_OWNER' } },
    ]);
  });

  /**
   * 🔴 La alineación por posición es la invariante de este formato: si una fila
   * dejara de emitir uno de sus tres campos, todas las de abajo se
   * desplazarían y la regla se guardaría con condiciones que nadie escribió.
   */
  it('mantiene la alineación con varias acciones de distinta configuración', () => {
    const draft = draftFromFormData(
      CATALOGO,
      formulario([
        ['triggerType', 'TASK_DUE_SOON'],
        ['actionType', 'CREATE_NOTIFICATION'],
        ['actionConfig', '{"recipientSelector":"ASSIGNEES"}'],
        ['actionType', 'MOVE_TASK'],
        ['actionConfig', `{"targetColumnId":"${COLUMNA}"}`],
      ]),
    );
    expect(draft.actions).toEqual([
      { type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' } },
      { type: 'MOVE_TASK', config: { targetColumnId: COLUMNA } },
    ]);
  });

  it('una configuración con JSON roto se queda vacía en vez de reventar', () => {
    const draft = draftFromFormData(
      CATALOGO,
      formulario([
        ['triggerType', 'TASK_DUE_SOON'],
        ['actionType', 'MOVE_TASK'],
        ['actionConfig', '{no es json'],
      ]),
    );
    expect(draft.actions[0]?.config).toEqual({});
  });

  it('la casilla marcada es lo único que habilita la regla', () => {
    const base: Array<[string, string]> = [['triggerType', 'TASK_DUE_SOON']];
    expect(draftFromFormData(CATALOGO, formulario(base)).status).toBe('DISABLED');
    expect(draftFromFormData(CATALOGO, formulario([...base, ['enabled', 'on']])).status).toBe(
      'ENABLED',
    );
  });
});

describe('coerceConditionValue', () => {
  it('un entero llega como número, no como texto', () =>
    expect(coerceConditionValue(CATALOGO, 'TASK_STALE', 'staleDays', 'GTE', '4')).toBe(4));

  it('un booleano llega como booleano', () =>
    expect(coerceConditionValue(CATALOGO, 'TASK_STALE', 'overdue', 'EQUALS', 'false')).toBe(false));

  it('con IN, la lista JSON se coacciona elemento a elemento', () =>
    expect(
      coerceConditionValue(CATALOGO, 'TASK_DUE_SOON', 'priority', 'IN', '["HIGH","LOW"]'),
    ).toEqual(['HIGH', 'LOW']));

  it('con IN y JSON roto, lista vacía: el validador dirá que falta un valor', () =>
    expect(coerceConditionValue(CATALOGO, 'TASK_DUE_SOON', 'priority', 'IN', 'roto')).toEqual([]));
});

describe('cómo se lee una regla', () => {
  it('la frase entera usa el lenguaje del constructor', () =>
    expect(describeRule(CATALOGO, reglaVencimiento, PROYECTO)).toBe(
      'Cuando una tarea esté a punto de vencer, si prioridad es Alta, entonces avisa a los encargados.',
    ));

  it('sin condiciones no inventa una cláusula «si»', () =>
    expect(describeRule(CATALOGO, { ...reglaVencimiento, conditions: [] }, PROYECTO)).toBe(
      'Cuando una tarea esté a punto de vencer, entonces avisa a los encargados.',
    ));

  it('las condiciones también se leen sueltas, para escanearlas', () =>
    expect(describeConditions(CATALOGO, reglaVencimiento, PROYECTO)).toEqual([
      'prioridad es Alta',
    ]));

  it('los operadores nuevos se leen en castellano', () =>
    expect(
      describeConditions(
        CATALOGO,
        {
          ...reglaVencimiento,
          conditions: [{ field: 'assigneeCount', operator: 'GT', value: 2, position: 0 }],
        },
        PROYECTO,
      ),
    ).toEqual(['número de encargados es mayor que 2']));

  /** ⚠️ Un id crudo en la frase la vuelve inservible para comprobar nada. */
  it('una acción con un id lo enseña con su nombre', () =>
    expect(
      describeAction(
        CATALOGO,
        { type: 'MOVE_TASK', config: { targetColumnId: COLUMNA } },
        PROYECTO,
      ),
    ).toBe('muévela a hecho'));

  it('sin catálogo no revienta: enseña el tipo crudo', () =>
    expect(describeAction(null, { type: 'MOVE_TASK', config: {} })).toBe('MOVE_TASK'));
});

describe('el contexto de una ejecución', () => {
  it('se lee con las etiquetas del catálogo', () =>
    expect(
      describeExecutionContext(CATALOGO, { priority: 'HIGH', assigneeCount: 2 }, PROYECTO),
    ).toBe('prioridad Alta, número de encargados 2'));

  it('un contexto vacío lo dice en vez de quedarse en blanco', () =>
    expect(describeExecutionContext(CATALOGO, {}, PROYECTO)).toBe('Sin contexto.'));
});

describe('el resumen de una revisión', () => {
  it('cuenta lo que hubo, sin escribir los ceros', () =>
    expect(
      describeReviewSummary({
        rules: 1,
        candidates: 3,
        succeeded: 1,
        failed: 0,
        filtered: 2,
        repeated: 0,
      }),
    ).toBe('1 regla revisada · 3 candidatas · 1 acción · 2 sin cumplir las condiciones'));

  /**
   * 🔴 Antes solo decía «éxitos» y «fallos», así que una revisión sin acciones
   * se leía igual tanto si las condiciones no se cumplían como si ya se había
   * actuado ayer. Dos situaciones opuestas y el mismo número.
   */
  it('distingue «no cumplía» de «ya estaba atendida»', () =>
    expect(
      describeReviewSummary({
        rules: 2,
        candidates: 5,
        succeeded: 0,
        failed: 0,
        filtered: 0,
        repeated: 5,
      }),
    ).toBe('2 reglas revisadas · 5 candidatas · 0 acciones · 5 ya atendidas'));
});
