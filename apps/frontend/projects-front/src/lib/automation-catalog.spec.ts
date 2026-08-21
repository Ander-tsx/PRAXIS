import { describe, expect, it } from 'vitest';

import {
  type AutomationCatalog,
  conditionFieldByName,
  conditionFieldFor,
  etiquetaDeValor,
  opcionesDe,
  triggerSpecFor,
} from './automation-catalog';

/**
 * El catálogo ya no vive aquí: lo sirve el servicio en
 * `GET /projects/:id/automations/catalog`. Lo que se prueba son **las lecturas
 * sobre él**, que es lo único que quedó en el cliente.
 */
const CATALOGO: AutomationCatalog = {
  operators: ['EQUALS', 'NOT_EQUALS', 'IN', 'GT', 'GTE', 'LT', 'LTE', 'CONTAINS'],
  triggers: [
    {
      type: 'TASK_MOVED',
      kind: 'reactive',
      label: 'Se mueve una tarea',
      sentence: 'alguien mueva una tarea de columna',
      description: 'Al cambiar de columna.',
      eventType: 'task.moved.v1',
      config: [],
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
          field: 'toColumnId',
          label: 'Columna de destino',
          kind: 'uuid',
          operators: ['EQUALS'],
          source: 'columns',
        },
      ],
    },
    {
      type: 'TASK_STALE',
      kind: 'sweep',
      label: 'Una tarea lleva parada',
      sentence: 'una tarea lleve demasiado sin moverse',
      description: 'Sin movimiento en N días.',
      config: [
        { key: 'days', label: 'Días', kind: 'integer', min: 1, required: false, defaultValue: 7 },
      ],
      fields: [
        { field: 'staleDays', label: 'Días parada', kind: 'integer', operators: ['GTE'], min: 0 },
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
          options: [{ value: 'ASSIGNEES', label: 'A los encargados' }],
        },
      ],
    },
  ],
};

const PROYECTO = {
  columns: [{ value: 'col-1', label: 'Diseño · Hecho' }],
  labels: [{ value: 'lab-1', label: 'Urgente' }],
  members: [{ value: 'user-1', label: 'Ana' }],
};

describe('lecturas del catálogo', () => {
  it('encuentra un disparador por su tipo', () =>
    expect(triggerSpecFor(CATALOGO, 'TASK_MOVED')?.label).toBe('Se mueve una tarea'));

  it('devuelve undefined para uno que no existe', () =>
    expect(triggerSpecFor(CATALOGO, 'LO_QUE_SEA')).toBeUndefined());

  it('sin catálogo no revienta: devuelve undefined', () =>
    expect(triggerSpecFor(null, 'TASK_MOVED')).toBeUndefined());

  it('encuentra un campo dentro de su disparador', () =>
    expect(conditionFieldFor(CATALOGO, 'TASK_MOVED', 'toColumnId')?.label).toBe(
      'Columna de destino',
    ));

  it('un campo de otro disparador no se encuentra en este', () =>
    expect(conditionFieldFor(CATALOGO, 'TASK_MOVED', 'staleDays')).toBeUndefined());

  /** Lo necesitan las ejecuciones, que no traen el disparador de la regla. */
  it('encuentra un campo sin saber el disparador', () =>
    expect(conditionFieldByName(CATALOGO, 'staleDays')?.label).toBe('Días parada'));
});

describe('de dónde salen las opciones de un campo', () => {
  it('un enum las trae dentro', () =>
    expect(opcionesDe(CATALOGO.triggers[0]!.fields[0]!, PROYECTO)).toHaveLength(2));

  /**
   * ⚠️ El catálogo **no trae** las columnas ni las etiquetas: son de cada
   * proyecto y cambian. Solo dice de qué lista salen.
   */
  it('un campo con `source` las toma de las listas del proyecto', () =>
    expect(opcionesDe(CATALOGO.triggers[0]!.fields[1]!, PROYECTO)).toEqual(PROYECTO.columns));

  it('un campo sin opciones ni `source` no ofrece ninguna', () =>
    expect(opcionesDe({}, PROYECTO)).toEqual([]));
});

describe('cómo se lee un valor que es un id', () => {
  it('un id de columna se enseña con su nombre', () =>
    expect(etiquetaDeValor(CATALOGO.triggers[0]!.fields[1]!, 'col-1', PROYECTO)).toBe(
      'Diseño · Hecho',
    ));

  /**
   * ⚠️ Un id que ya no está en la lista —una columna borrada— se enseña tal
   * cual y no se oculta: una regla que apunta a algo que no existe tiene que
   * poder verse, aunque sea feo.
   */
  it('un id desconocido se enseña tal cual', () =>
    expect(etiquetaDeValor(CATALOGO.triggers[0]!.fields[1]!, 'col-borrada', PROYECTO)).toBe(
      'col-borrada',
    ));

  it('un valor de enum se enseña con su etiqueta', () =>
    expect(etiquetaDeValor(CATALOGO.triggers[0]!.fields[0]!, 'HIGH', PROYECTO)).toBe('Alta'));
});
