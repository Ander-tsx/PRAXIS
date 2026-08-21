import { TRIGGERS } from '../rules/catalog';
import { matchesAllConditions, matchesTrigger } from './rule-matcher';

const evento = (type: string) => ({ type }) as never;

describe('matcher de reglas', () => {
  describe('qué hecho despierta a qué disparador', () => {
    it('un disparador reactivo responde a su hecho', () =>
      expect(matchesTrigger('TASK_CREATED', evento('task.created.v1'))).toBe(true));

    it('y a ningún otro', () =>
      expect(matchesTrigger('TASK_CREATED', evento('task.moved.v1'))).toBe(false));

    /**
     * ⚠️ **Esta es la que importa.** El mapa anterior decía que `TASK_DUE_SOON`
     * reaccionaba a cinco hechos —creada, vencimiento cambiado, completada,
     * reabierta, borrada— y es un disparador **de barrido**: describe un estado,
     * no un instante. Con el flujo conectado, esa entrada habría hecho que
     * «va a vencer» se disparara al crear cualquier tarea, tuviera fecha o no.
     */
    it('un disparador de barrido NO reacciona a ningún hecho', () => {
      for (const hecho of ['task.created.v1', 'task.moved.v1', 'task.completed.v1']) {
        expect(matchesTrigger('TASK_DUE_SOON', evento(hecho))).toBe(false);
        expect(matchesTrigger('TASK_STALE', evento(hecho))).toBe(false);
      }
    });

    it('un disparador que no existe no responde a nada', () =>
      expect(matchesTrigger('LO_QUE_SEA', evento('task.created.v1'))).toBe(false));

    /**
     * 🔴 **El cruce que evita la avería más cara del catálogo.**
     *
     * Un disparador reactivo cuyo `eventType` no coincida con lo que
     * `tasks-service` escribe de verdad se guarda, se ve habilitado en la
     * pantalla y **no se dispara nunca**, sin un solo error en ningún log. Esta
     * lista es la de `tasks.service.ts`; si alguien añade un disparador con un
     * nombre inventado, esta prueba lo dice antes de que llegue a nadie.
     */
    it('todo disparador reactivo apunta a un hecho que alguien emite', () => {
      const emitidos = [
        'task.created.v1',
        'task.moved.v1',
        'task.due-date-changed.v1',
        'task.completed.v1',
        'task.reopened.v1',
        'task.assignees-changed.v1',
        'task.deleted.v1',
      ];
      const reactivos = TRIGGERS.filter((trigger) => trigger.kind === 'reactive');
      expect(reactivos.length).toBeGreaterThan(0);
      for (const trigger of reactivos) {
        expect(emitidos).toContain(trigger.eventType);
      }
    });

    it('y ningún disparador de barrido lleva hecho asociado', () => {
      for (const trigger of TRIGGERS.filter((uno) => uno.kind === 'sweep')) {
        expect(trigger.eventType).toBeUndefined();
      }
    });
  });

  describe('condiciones', () => {
    it('son una Y: basta con que una falle', () =>
      expect(
        matchesAllConditions(
          [
            { field: 'closed', operator: 'EQUALS', value: false },
            { field: 'priority', operator: 'EQUALS', value: 'HIGH' },
          ],
          { closed: false, priority: 'LOW' },
        ),
      ).toBe(false));

    it('sin condiciones, se cumple siempre', () =>
      expect(matchesAllConditions([], { priority: 'LOW' })).toBe(true));

    /**
     * ⚠️ La trampa clásica: `undefined !== 'HIGH'` es cierto en JavaScript, así
     * que una condición sobre un campo mal escrito pasaría **siempre** y la
     * regla actuaría sobre el proyecto entero.
     */
    it('un campo que no existe no se cumple, ni siquiera negado', () => {
      expect(
        matchesAllConditions([{ field: 'inventado', operator: 'EQUALS', value: 'x' }], {}),
      ).toBe(false);
      expect(
        matchesAllConditions([{ field: 'inventado', operator: 'NOT_EQUALS', value: 'x' }], {}),
      ).toBe(false);
    });

    it('un operador desconocido no se cumple, y no revienta', () =>
      expect(
        matchesAllConditions([{ field: 'priority', operator: 'PARECIDO_A', value: 'HIGH' }], {
          priority: 'HIGH',
        }),
      ).toBe(false));

    describe('comparaciones numéricas', () => {
      const contexto = { staleDays: 10 };
      it.each([
        ['GT', 5, true],
        ['GT', 10, false],
        ['GTE', 10, true],
        ['LT', 20, true],
        ['LTE', 10, true],
        ['LT', 3, false],
      ])('%s %d → %s', (operator, value, esperado) =>
        expect(matchesAllConditions([{ field: 'staleDays', operator, value }], contexto)).toBe(
          esperado,
        ),
      );
    });

    describe('fechas', () => {
      it('compara por instante y no por texto', () =>
        expect(
          matchesAllConditions([{ field: 'dueDate', operator: 'LT', value: '2026-09-01' }], {
            dueDate: '2026-08-30',
          }),
        ).toBe(true));

      it('una fecha ilegible no se cumple', () =>
        expect(
          matchesAllConditions([{ field: 'dueDate', operator: 'GT', value: 'mañana' }], {
            dueDate: '2026-08-30',
          }),
        ).toBe(false));
    });

    describe('listas', () => {
      const conEtiquetas = { labelIds: ['a1', 'b2'] };
      it('CONTAINS pregunta por pertenencia', () =>
        expect(
          matchesAllConditions(
            [{ field: 'labelIds', operator: 'CONTAINS', value: 'b2' }],
            conEtiquetas,
          ),
        ).toBe(true));

      it('NOT_EQUALS sobre una lista significa «no la lleva»', () =>
        expect(
          matchesAllConditions(
            [{ field: 'labelIds', operator: 'NOT_EQUALS', value: 'zz' }],
            conEtiquetas,
          ),
        ).toBe(true));

      it('una lista vacía no contiene nada', () =>
        expect(
          matchesAllConditions([{ field: 'labelIds', operator: 'CONTAINS', value: 'a1' }], {
            labelIds: [],
          }),
        ).toBe(false));
    });

    describe('texto', () => {
      it('CONTAINS no distingue mayúsculas', () =>
        expect(
          matchesAllConditions([{ field: 'title', operator: 'CONTAINS', value: 'REVISAR' }], {
            title: 'Hay que revisar el contrato',
          }),
        ).toBe(true));
    });

    describe('IN', () => {
      it('se cumple si el valor está en la lista', () =>
        expect(
          matchesAllConditions([{ field: 'priority', operator: 'IN', value: ['HIGH', 'URGENT'] }], {
            priority: 'URGENT',
          }),
        ).toBe(true));
    });
  });
});
