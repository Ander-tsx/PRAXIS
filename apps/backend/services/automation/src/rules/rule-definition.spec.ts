import { ACTIONS, TRIGGERS } from './catalog';
import { permisosQueExige, validateRuleDefinition } from './rule-definition';

const COLUMNA = '00000000-0000-4000-8000-000000000001';
const ETIQUETA = '00000000-0000-4000-8000-000000000002';

describe('validateRuleDefinition', () => {
  const base = {
    name: 'Avisar vencimiento',
    trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 60 } },
    conditions: [{ field: 'priority', operator: 'EQUALS', value: 'HIGH' }],
    actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' } }],
  } as never;

  const con = (extra: Record<string, unknown>) => ({ ...(base as object), ...extra }) as never;

  it('acepta una definición y coloca cada pieza en su posición', () => {
    const definicion = validateRuleDefinition(base);
    expect(definicion.status).toBe('DISABLED');
    expect(definicion.conditions).toEqual([
      { field: 'priority', operator: 'EQUALS', value: 'HIGH', position: 0 },
    ]);
    expect(definicion.actions).toEqual([
      { type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' }, position: 0 },
    ]);
  });

  it('rechaza más de cinco acciones', () =>
    expect(() =>
      validateRuleDefinition(con({ actions: Array.from({ length: 6 }, () => (base as never)[0]) })),
    ).toThrow());

  it('no permite que un cliente pause o invalide reglas', () =>
    expect(() => validateRuleDefinition(con({ status: 'PAUSED_SYSTEM' }))).toThrow(
      'Solo el sistema',
    ));

  it('guarda el valor por defecto de un campo opcional del disparador', () =>
    expect(
      validateRuleDefinition(con({ trigger: { type: 'TASK_STALE', config: {} }, conditions: [] }))
        .trigger.config,
    ).toEqual({ days: 7 }));

  it('rechaza una clave que el disparador no declara', () =>
    expect(() =>
      validateRuleDefinition(
        con({ trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 30, extra: true } } }),
      ),
    ).toThrow('Configuración de trigger inválida'));

  it('rechaza un disparador que no está en el catálogo', () =>
    expect(() =>
      validateRuleDefinition(con({ trigger: { type: 'GITHUB_PULL_REQUEST_OPENED', config: {} } })),
    ).toThrow('Trigger no soportado'));

  describe('campos y operadores, contra el catálogo del disparador', () => {
    it('un campo que ese disparador no ofrece se rechaza', () =>
      expect(() =>
        validateRuleDefinition(
          con({ conditions: [{ field: 'staleDays', operator: 'EQUALS', value: 3 }] }),
        ),
      ).toThrow('Campo de condición no soportado'));

    /**
     * ⚠️ Antes se admitía cualquier operador de la lista sobre cualquier campo.
     * `GT` sobre un booleano se guardaba tan feliz y luego el motor no podía
     * evaluarlo: la regla quedaba muda y nadie sabía por qué.
     */
    it('un operador que no tiene sentido sobre ese campo se rechaza', () =>
      expect(() =>
        validateRuleDefinition(
          con({
            trigger: { type: 'TASK_STALE', config: { days: 3 } },
            conditions: [{ field: 'overdue', operator: 'GT', value: true }],
          }),
        ),
      ).toThrow('no se puede usar sobre'));

    it('los operadores nuevos sí se aceptan donde encajan', () =>
      expect(
        validateRuleDefinition(
          con({
            trigger: { type: 'TASK_STALE', config: { days: 3 } },
            conditions: [{ field: 'staleDays', operator: 'GTE', value: 3 }],
          }),
        ).conditions[0],
      ).toMatchObject({ field: 'staleDays', operator: 'GTE' }));

    it('IN necesita una lista con algo dentro', () => {
      expect(() =>
        validateRuleDefinition(
          con({ conditions: [{ field: 'priority', operator: 'IN', value: 'HIGH' }] }),
        ),
      ).toThrow('lista');
      expect(() =>
        validateRuleDefinition(
          con({ conditions: [{ field: 'priority', operator: 'IN', value: [] }] }),
        ),
      ).toThrow('lista');
    });

    it('un operador suelto no admite una lista', () =>
      expect(() =>
        validateRuleDefinition(
          con({ conditions: [{ field: 'assigneeCount', operator: 'EQUALS', value: [1] }] }),
        ),
      ).toThrow('valor suelto'));

    it('el tipo del valor tiene que encajar con el campo', () => {
      expect(() =>
        validateRuleDefinition(
          con({
            trigger: { type: 'TASK_STALE', config: { days: 3 } },
            conditions: [{ field: 'overdue', operator: 'EQUALS', value: 'true' }],
          }),
        ),
      ).toThrow('Valor de condición inválido');

      expect(() =>
        validateRuleDefinition(
          con({ conditions: [{ field: 'priority', operator: 'EQUALS', value: 'ALTÍSIMA' }] }),
        ),
      ).toThrow('Valor de condición inválido');

      expect(() =>
        validateRuleDefinition(
          con({ conditions: [{ field: 'columnId', operator: 'EQUALS', value: 'no-es-un-uuid' }] }),
        ),
      ).toThrow('Valor de condición inválido');
    });

    it('rechaza más de diez condiciones', () =>
      expect(() =>
        validateRuleDefinition(
          con({
            conditions: Array.from({ length: 11 }, () => ({
              field: 'priority',
              operator: 'EQUALS',
              value: 'HIGH',
            })),
          }),
        ),
      ).toThrow('diez condiciones'));
  });

  describe('acciones nuevas', () => {
    it('mover admite una columna y exige que sea un UUID', () => {
      expect(
        validateRuleDefinition(
          con({ actions: [{ type: 'MOVE_TASK', config: { targetColumnId: COLUMNA } }] }),
        ).actions[0],
      ).toMatchObject({ type: 'MOVE_TASK', config: { targetColumnId: COLUMNA } });

      expect(() =>
        validateRuleDefinition(
          con({ actions: [{ type: 'MOVE_TASK', config: { targetColumnId: 'la de hecho' } }] }),
        ),
      ).toThrow('no es válido');
    });

    it('un campo obligatorio que falta se dice con su nombre', () =>
      expect(() =>
        validateRuleDefinition(con({ actions: [{ type: 'ADD_LABEL', config: {} }] })),
      ).toThrow('Falta "Etiqueta"'));

    it('una clave que la acción no declara se rechaza', () =>
      expect(() =>
        validateRuleDefinition(
          con({ actions: [{ type: 'ADD_LABEL', config: { labelId: ETIQUETA, color: 'rojo' } }] }),
        ),
      ).toThrow('Configuración inválida'));

    it('un texto se recorta de espacios y se guarda', () =>
      expect(
        validateRuleDefinition(
          con({
            actions: [{ type: 'POST_CHAT_MESSAGE', config: { text: '  Revisar {tarea}  ' } }],
          }),
        ).actions[0],
      ).toMatchObject({ config: { text: 'Revisar {tarea}' } }));

    it('un destinatario que no existe se rechaza', () =>
      expect(() =>
        validateRuleDefinition(
          con({
            actions: [
              { type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'PROJECT_MANAGER' } },
            ],
          }),
        ),
      ).toThrow('no es válido'));
  });

  describe('permisos que exige una regla', () => {
    it('avisar no exige ninguno: no escribe nada del proyecto', () =>
      expect(permisosQueExige([{ type: 'CREATE_NOTIFICATION' } as never])).toEqual([]));

    it('las que escriben exigen el suyo, sin repetirlo', () =>
      expect(
        permisosQueExige([
          { type: 'MOVE_TASK' },
          { type: 'SET_PRIORITY' },
          { type: 'POST_CHAT_MESSAGE' },
        ] as never),
      ).toEqual(['canEditTask', 'canComment']));
  });

  /**
   * 🔴 **El catálogo es lo que ve quien rellena el formulario.** Un disparador
   * sin campos ofrecería un desplegable de condiciones vacío, y uno cuya
   * configuración obligatoria no tenga valor por defecto haría que el
   * formulario arrancara ya inválido sin decir por qué.
   */
  describe('coherencia del catálogo', () => {
    it('todo disparador ofrece al menos un campo para filtrar', () => {
      for (const trigger of TRIGGERS) expect(trigger.fields.length).toBeGreaterThan(0);
    });

    it('ningún campo se ofrece sin operadores', () => {
      for (const trigger of TRIGGERS) {
        for (const campo of trigger.fields) expect(campo.operators.length).toBeGreaterThan(0);
      }
    });

    /**
     * 🔴 **El aviso salía del destinatario elegido, no de lo ocurrido.**
     *
     * Con dos disparadores coincidía por casualidad. Con diez, «cuando se cree
     * una tarea, avisa a quien lleva el proyecto» mandaba un aviso que decía
     * «lleva varios días sin movimiento» sobre una tarea recién creada. Cada
     * disparador declara el suyo, y esta prueba impide que uno nuevo se quede
     * sin él o reutilice el de otro.
     */
    it('cada disparador declara su propio tipo de aviso, y no lo comparte', () => {
      const tipos = TRIGGERS.map((trigger) => trigger.notificationType);
      for (const tipo of tipos) expect(tipo).toBeTruthy();
      expect(new Set(tipos).size).toBe(TRIGGERS.length);
    });

    /**
     * ⚠️ Los comentarios se retiraron de la interfaz de la tarea. Una acción
     * que los escribiera los dejaría donde ya nadie los lee.
     */
    it('no se ofrece comentar en la tarea', () =>
      expect(ACTIONS.some((accion) => accion.type === 'ADD_COMMENT')).toBe(false));

    it('un campo de tipo lista declara de dónde salen sus valores', () => {
      for (const trigger of TRIGGERS) {
        for (const campo of trigger.fields) {
          if (campo.kind === 'uuid' || campo.kind === 'uuidList') {
            expect(campo.source).toBeDefined();
          }
        }
      }
    });
  });
});
