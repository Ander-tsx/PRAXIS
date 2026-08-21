import {
  AutomationActionType,
  AutomationRuleStatus,
  type CreateAutomationRuleBodyDto,
} from '@praxis/contracts';

import { type ConditionField, type ConditionOperator, actionSpec, triggerSpec } from './catalog';

export type NormalizedRuleDefinition = Omit<
  CreateAutomationRuleBodyDto,
  'actions' | 'conditions'
> & {
  status: AutomationRuleStatus;
  conditions: Array<{ field: string; operator: string; value: unknown; position: number }>;
  actions: Array<{ type: AutomationActionType; config: Record<string, unknown>; position: number }>;
};

/**
 * Valida una regla contra el catálogo.
 *
 * ## Lo que este archivo dejó de hacer
 *
 * Antes tenía la lista de disparadores, la de campos por disparador y la de
 * operadores escritas a mano, y cada una era una copia de lo que el motor y el
 * frontend creían por su cuenta. Ahora todo eso vive en `catalog.ts` y aquí solo
 * queda **la comprobación**: que lo que llega existe en el catálogo, que encaja
 * con lo que ese campo admite, y que no sobra nada.
 *
 * ## Las tres reglas que no se relajan
 *
 * 1. **Ni un campo de sobra.** `hasOnlyKeys` en la configuración del disparador
 *    y de cada acción. Un campo que nadie lee es un campo que alguien creerá que
 *    se está usando.
 * 2. **El operador tiene que tener sentido sobre ese campo.** `GT` sobre un
 *    booleano se guarda tan ricamente y luego no se puede evaluar: la regla
 *    queda muda y nadie sabe por qué.
 * 3. **`PAUSED_SYSTEM` e `INVALID` no los pone nadie desde fuera.** Son estados
 *    que el sistema usa para explicar por qué dejó de ejecutar algo; dejar que
 *    el cliente los escriba sería dejarle fabricar la coartada.
 */

const hasOnlyKeys = (config: Record<string, unknown>, keys: string[]) =>
  Object.keys(config).every((key) => keys.includes(key));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Si un valor suelto encaja con la clase del campo. */
function valorValido(campo: ConditionField, valor: unknown): boolean {
  switch (campo.kind) {
    case 'enum':
      return (
        typeof valor === 'string' &&
        (campo.options?.some((opcion) => opcion.value === valor) ?? valor.length > 0)
      );
    case 'integer':
      return Number.isInteger(valor) && Number(valor) >= (campo.min ?? Number.MIN_SAFE_INTEGER);
    case 'date':
      return typeof valor === 'string' && FECHA.test(valor);
    case 'boolean':
      return typeof valor === 'boolean';
    case 'text':
      return typeof valor === 'string' && valor.trim().length > 0 && valor.length <= 200;
    case 'uuid':
    case 'uuidList':
      return typeof valor === 'string' && UUID.test(valor);
  }
}

export function validateRuleDefinition(
  input: CreateAutomationRuleBodyDto,
): NormalizedRuleDefinition {
  if (!input.name?.trim()) throw new Error('El nombre de la regla es obligatorio');
  if (
    input.status !== undefined &&
    input.status !== AutomationRuleStatus.ENABLED &&
    input.status !== AutomationRuleStatus.DISABLED
  ) {
    throw new Error('Solo el sistema puede pausar o invalidar una regla');
  }

  const disparador = input.trigger && triggerSpec(input.trigger.type);
  if (!disparador) throw new Error('Trigger no soportado');

  if (!Array.isArray(input.actions) || input.actions.length === 0) {
    throw new Error('La regla requiere al menos una acción');
  }
  if (input.actions.length > 5) throw new Error('Una regla admite como máximo cinco acciones');
  if (!Array.isArray(input.conditions)) throw new Error('Las condiciones deben ser una lista AND');
  if (input.conditions.length > 10) {
    throw new Error('Una regla admite como máximo diez condiciones');
  }

  /* ─── Configuración del disparador ─────────────────────────────────────── */
  const configEntrante = input.trigger.config ?? {};
  const claves = disparador.config.map((campo) => campo.key);
  if (!hasOnlyKeys(configEntrante, claves)) {
    throw new Error('Configuración de trigger inválida');
  }
  const config: Record<string, unknown> = {};
  for (const campo of disparador.config) {
    const valor = configEntrante[campo.key];
    if (valor === undefined) {
      if (campo.required) throw new Error(`Falta "${campo.label}" en el trigger`);
      /* El defecto se **guarda**, no se aplica al ejecutar: así la regla dice
         qué hace sin que haya que conocer el catálogo para leerla. */
      config[campo.key] = campo.defaultValue;
      continue;
    }
    if (!Number.isInteger(valor) || Number(valor) < campo.min) {
      throw new Error(`"${campo.label}" tiene que ser un entero de ${campo.min} en adelante`);
    }
    config[campo.key] = valor;
  }

  /* ─── Acciones ─────────────────────────────────────────────────────────── */
  const actions = input.actions.map((accion, position) => {
    const spec = actionSpec(accion.type);
    if (!spec) throw new Error('Acción no soportada');

    const entrante = accion.config ?? {};
    if (
      !hasOnlyKeys(
        entrante,
        spec.config.map((campo) => campo.key),
      )
    ) {
      throw new Error(`Configuración inválida para ${spec.label}`);
    }
    const configuracion: Record<string, unknown> = {};
    for (const campo of spec.config) {
      const valor = entrante[campo.key];
      if (valor === undefined || valor === null || valor === '') {
        if (campo.required) throw new Error(`Falta "${campo.label}" en la acción ${spec.label}`);
        continue;
      }
      const encaja =
        campo.kind === 'enum'
          ? typeof valor === 'string' && campo.options?.some((opcion) => opcion.value === valor)
          : campo.kind === 'uuid'
            ? typeof valor === 'string' && UUID.test(valor)
            : typeof valor === 'string' &&
              valor.trim().length > 0 &&
              valor.length <= (campo.maxLength ?? 500);
      if (!encaja) throw new Error(`"${campo.label}" no es válido en la acción ${spec.label}`);
      configuracion[campo.key] = typeof valor === 'string' ? valor.trim() : valor;
    }
    return { type: accion.type, config: configuracion, position };
  });

  /* ─── Condiciones ──────────────────────────────────────────────────────── */
  const conditions = input.conditions.map((condicion, position) => {
    if (!condicion.field || !condicion.operator) throw new Error('Condición inválida');

    const campo = disparador.fields.find((uno) => uno.field === condicion.field);
    if (!campo) {
      throw new Error(`Campo de condición no soportado para ${disparador.label}`);
    }
    const operador = condicion.operator as ConditionOperator;
    if (!campo.operators.includes(operador)) {
      throw new Error(`El operador no se puede usar sobre "${campo.label}"`);
    }

    if (operador === 'IN') {
      if (!Array.isArray(condicion.value) || condicion.value.length === 0) {
        throw new Error('El operador "es alguno de" necesita una lista con algo dentro');
      }
      if (!condicion.value.every((valor) => valorValido(campo, valor))) {
        throw new Error(`Valor de condición inválido para ${campo.label}`);
      }
    } else {
      if (
        Array.isArray(condicion.value) ||
        (typeof condicion.value === 'object' && condicion.value !== null)
      ) {
        throw new Error(`"${campo.label}" espera un valor suelto, no una lista`);
      }
      if (!valorValido(campo, condicion.value)) {
        throw new Error(`Valor de condición inválido para ${campo.label}`);
      }
    }

    return {
      field: condicion.field,
      operator: condicion.operator,
      value: condicion.value,
      position,
    };
  });

  return {
    ...input,
    trigger: { type: input.trigger.type, config },
    name: input.name.trim(),
    status: input.status ?? AutomationRuleStatus.DISABLED,
    conditions,
    actions,
  };
}

/**
 * Los permisos que hacen falta para poder guardar esta regla.
 *
 * ⚠️ **No se comprueban aquí**, y es a propósito: este archivo no habla con
 * nadie. Los devuelve para que `RulesService` los cruce con el mapa efectivo de
 * quien guarda, que es quien tiene esa información. Ver D2 del plan.
 */
export function permisosQueExige(acciones: Array<{ type: AutomationActionType }>): string[] {
  const permisos = new Set<string>();
  for (const accion of acciones) {
    const spec = actionSpec(accion.type);
    if (spec?.requires) permisos.add(spec.requires);
  }
  return [...permisos];
}
