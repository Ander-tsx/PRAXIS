import type { Sprint, SprintMetricRow } from '@praxis/commons';
import { describe, expect, it } from 'vitest';
import { calcularBurndown, calcularVelocidad, unidadDe } from './burndown';

/**
 * El burndown y la velocidad son lógica pura, y los dos fallos que encontró la
 * auditoría (S1 y S10 de `docs/PLAN-SCRUM-KANBAN.md`) daban números falsos sin
 * ningún error. Estas pruebas son las que los habrían parado.
 */

function sprint(parcial: Partial<Sprint> = {}): Sprint {
  return {
    id: 's1',
    boardId: 'b1',
    name: 'Sprint 1',
    goal: null,
    status: 'ACTIVE',
    startDate: '2026-09-21T06:00:00.000Z',
    endDate: '2026-10-04T05:59:59.999Z',
    startedAt: '2026-09-21T17:00:00.000Z',
    createdAt: '2026-09-20T10:00:00.000Z',
    closedAt: null,
    ...parcial,
  };
}

function fila(parcial: Partial<SprintMetricRow>): SprintMetricRow {
  return {
    id: Math.random().toString(36).slice(2),
    sprintId: 's1',
    sprintAssignedAt: '2026-09-21T15:00:00.000Z',
    completedAt: null,
    estimatePoints: 3,
    ...parcial,
  };
}

const AHORA = new Date('2026-09-25T12:00:00.000Z');

describe('calcularBurndown', () => {
  it('lo planeado la misma mañana cuenta como compromiso, no como añadido (S1)', () => {
    /* `startDate` es la medianoche del día: lo que entró a las 15:00, antes de
       pulsar «Empezar» a las 17:00, era alcance original. */
    const b = calcularBurndown(sprint(), [fila({ estimatePoints: 5 }), fila({})], 'puntos', AHORA);
    expect(b?.alcanceOriginal).toBe(8);
    expect(b?.anadido).toBe(0);
  });

  it('lo que entra después de empezar es alcance añadido', () => {
    const b = calcularBurndown(
      sprint(),
      [fila({ estimatePoints: 5 }), fila({ sprintAssignedAt: '2026-09-23T10:00:00.000Z' })],
      'puntos',
      AHORA,
    );
    expect(b?.alcanceOriginal).toBe(5);
    expect(b?.anadido).toBe(3);
  });

  it('sin `startedAt` (sprints de antes) se da de gracia el primer día', () => {
    const b = calcularBurndown(
      sprint({ startedAt: null }),
      [fila({ sprintAssignedAt: '2026-09-21T23:00:00.000Z' })],
      'puntos',
      AHORA,
    );
    expect(b?.anadido).toBe(0);
  });

  it('la línea ideal parte del compromiso y llega a cero', () => {
    const b = calcularBurndown(sprint(), [fila({ estimatePoints: 13 })], 'puntos', AHORA);
    expect(b?.dias[0].ideal).toBe(13);
    expect(b?.dias.at(-1)?.ideal).toBe(0);
  });

  it('solo mira las filas de su sprint', () => {
    const b = calcularBurndown(sprint(), [fila({}), fila({ sprintId: 'otro' })], 'puntos', AHORA);
    expect(b?.alcanceOriginal).toBe(3);
  });
});

describe('unidadDe', () => {
  it('cuenta tareas si nadie estimó', () => {
    expect(unidadDe([{ estimatePoints: null }, { estimatePoints: null }])).toBe('tareas');
    expect(unidadDe([{ estimatePoints: null }, { estimatePoints: 2 }])).toBe('puntos');
  });
});

describe('calcularVelocidad', () => {
  const cerrado = (id: string) => sprint({ id, status: 'CLOSED' });

  it('no da media con un solo sprint terminado: sería un dato suelto (S10)', () => {
    const v = calcularVelocidad(
      [cerrado('a')],
      [fila({ sprintId: 'a', completedAt: '2026-09-22T00:00:00.000Z' })],
      'puntos',
    );
    expect(v.media).toBeNull();
  });

  it('no cuenta sprints en los que no se terminó nada', () => {
    const v = calcularVelocidad(
      [cerrado('a'), cerrado('b'), cerrado('c')],
      [
        fila({ sprintId: 'a', completedAt: '2026-09-22T00:00:00.000Z', estimatePoints: 10 }),
        fila({ sprintId: 'b', completedAt: '2026-09-22T00:00:00.000Z', estimatePoints: 20 }),
        fila({ sprintId: 'c' }),
      ],
      'puntos',
    );
    expect(v.media).toBe(15);
  });
});
