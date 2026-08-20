import type {
  AutomationActionType,
  AutomationRule,
  AutomationRuleStatus,
  AutomationTriggerType,
} from '@praxis/commons/api/domain';
import {
  type ConditionFieldSpec,
  conditionFieldSpecFor,
  triggerSpecFor,
} from './automation-catalog';

export interface ConditionDraft {
  field: string;
  operator: string;
  /** Ya coaccionado al tipo correcto: número, booleano, texto o lista (para `IN`). */
  value: unknown;
}

export interface ActionDraft {
  type: AutomationActionType;
}

/**
 * El estado editable del constructor guiado. Vive en `useState` del lado del
 * cliente; `bodyFromDraft` es el único sitio que sabe traducirlo al cuerpo
 * exacto del contrato — D5 del plan.
 */
export interface RuleDraft {
  name: string;
  description: string;
  triggerType: AutomationTriggerType;
  triggerConfig: Record<string, number>;
  conditions: ConditionDraft[];
  actions: ActionDraft[];
  status: AutomationRuleStatus;
}

/** Un borrador nuevo, con los valores por defecto del catálogo. */
export function emptyDraft(triggerType: AutomationTriggerType): RuleDraft {
  const spec = triggerSpecFor(triggerType);
  const triggerConfig: Record<string, number> = {};
  for (const field of spec?.configFields ?? []) {
    triggerConfig[field.key] = field.defaultValue;
  }
  return {
    name: '',
    description: '',
    triggerType,
    triggerConfig,
    conditions: [],
    /**
     * El MVP tiene una sola acción posible por trigger y su config la fija el
     * catálogo (D4) — D7 explica por qué no se ofrece «añadir» todavía.
     */
    actions: spec ? [{ type: spec.actions[0].type }] : [],
    /** Igual que el valor por defecto del servidor cuando se omite `status`. */
    status: 'DISABLED',
  };
}

/**
 * Una regla guardada, lista para editarse. Quita `id`, `ruleId`, `position` y
 * cualquier otro campo que el DTO de escritura no acepte.
 */
export function draftFromRule(rule: AutomationRule): RuleDraft {
  return {
    name: rule.name,
    description: rule.description ?? '',
    triggerType: rule.trigger.type,
    triggerConfig: rule.trigger.config as Record<string, number>,
    conditions: [...rule.conditions]
      .sort((a, b) => a.position - b.position)
      .map(({ field, operator, value }) => ({ field, operator, value })),
    actions: rule.actions.length > 0 ? [{ type: rule.actions[0].type }] : [],
    /**
     * `PAUSED_SYSTEM` e `INVALID` los pone el sistema y el cliente no puede
     * reenviarlos — un `PATCH` con cualquiera de los dos da 400. Guardar sin
     * tocar el estado sobre una regla en uno de esos dos colapsa a
     * `DISABLED`, la lectura segura: es la única forma editable de "esta
     * regla no está corriendo ahora mismo".
     */
    status: rule.status === 'ENABLED' ? 'ENABLED' : 'DISABLED',
  };
}

/** El cuerpo exacto que espera `POST`/`PATCH /automations` — ni un campo de más. */
export function bodyFromDraft(draft: RuleDraft) {
  const spec = triggerSpecFor(draft.triggerType);
  const action = spec?.actions.find((candidate) => candidate.type === draft.actions[0]?.type);
  const description = draft.description.trim();
  return {
    name: draft.name.trim(),
    ...(description && { description }),
    trigger: { type: draft.triggerType, config: draft.triggerConfig },
    conditions: draft.conditions.map(({ field, operator, value }) => ({
      field,
      operator,
      value,
    })),
    actions: action ? [{ type: action.type, config: action.config }] : [],
    status: draft.status,
  };
}

/**
 * Reconstruye el borrador desde el `FormData` que emite `RuleDialog`.
 *
 * Las condiciones viajan en tres arrays paralelos —`conditionField`,
 * `conditionOperator`, `conditionValue`— y se recomponen por posición: la
 * entrada `i` de cada uno pertenece a la misma fila. Esa alineación depende
 * de que `ConditionsSection` emita **siempre los tres** por fila, incluso
 * cuando el valor es un booleano en «No» — D4. `triggerConfig` solo lee las
 * claves que declara el catálogo del trigger elegido, así que un campo de
 * configuración de otro trigger que quedara en el formulario no se cuela.
 */
export function draftFromFormData(formData: FormData): RuleDraft {
  const triggerType = String(formData.get('triggerType') ?? '') as AutomationTriggerType;
  const spec = triggerSpecFor(triggerType);

  const triggerConfig: Record<string, number> = {};
  for (const field of spec?.configFields ?? []) {
    const raw = formData.get(`triggerConfig.${field.key}`);
    if (raw !== null && String(raw).trim() !== '') triggerConfig[field.key] = Number(raw);
  }

  const fields = formData.getAll('conditionField').map(String);
  const operators = formData.getAll('conditionOperator').map(String);
  const rawValues = formData.getAll('conditionValue').map(String);
  const conditions: ConditionDraft[] = fields.map((field, index) => {
    const operator = operators[index] ?? '';
    return {
      field,
      operator,
      value: coerceConditionValue(triggerType, field, operator, rawValues[index] ?? ''),
    };
  });

  const actionTypes = formData.getAll('actionType').map(String) as AutomationActionType[];

  return {
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    triggerType,
    triggerConfig,
    conditions,
    actions: actionTypes.map((type) => ({ type })),
    status: formData.get('enabled') === 'on' ? 'ENABLED' : 'DISABLED',
  };
}

function coerceScalar(kind: ConditionFieldSpec['kind'] | undefined, raw: string): unknown {
  if (kind === 'integer') return Number(raw);
  if (kind === 'boolean') return raw === 'true';
  return raw;
}

/**
 * Traduce lo que emite un campo de formulario (siempre texto, D3) al valor
 * tipado que el contrato espera. Con `IN`, `raw` es un array JSON producido
 * por el propio formulario — D4: un `<select multiple>` rompería la
 * invariante de los arrays paralelos de `FormData`, así que la lista viaja
 * como una sola cadena.
 */
export function coerceConditionValue(
  triggerType: string,
  field: string,
  operator: string,
  raw: string,
): unknown {
  const kind = conditionFieldSpecFor(triggerType, field)?.kind;
  if (operator === 'IN') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((item) => coerceScalar(kind, String(item))) : [];
    } catch {
      return [];
    }
  }
  return coerceScalar(kind, raw);
}

function describeValue(fieldSpec: ConditionFieldSpec | undefined, value: unknown): string {
  if (fieldSpec?.kind === 'enum' && fieldSpec.options) {
    const lookup = new Map(fieldSpec.options.map((option) => [option.value, option.label]));
    if (Array.isArray(value)) {
      return value.map((item) => lookup.get(String(item)) ?? String(item)).join(', ');
    }
    return lookup.get(String(value)) ?? String(value);
  }
  if (fieldSpec?.kind === 'boolean') return value ? 'sí' : 'no';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function describeCondition(
  triggerType: string,
  condition: { field: string; operator: string; value: unknown },
): string {
  const fieldSpec = conditionFieldSpecFor(triggerType, condition.field);
  const label = (fieldSpec?.label ?? condition.field).toLowerCase();
  const verb =
    condition.operator === 'NOT_EQUALS'
      ? 'no es'
      : condition.operator === 'IN'
        ? 'es alguno de'
        : 'es';
  return `${label} ${verb} ${describeValue(fieldSpec, condition.value)}`;
}

/**
 * «Cuando …, si …, entonces avisa …» — el mismo lenguaje Cuando/Si/Entonces
 * que usa el constructor guiado, para que la tarjeta y el formulario cuenten
 * la misma historia.
 */
export function describeRule(rule: AutomationRule): string {
  const spec = triggerSpecFor(rule.trigger.type);
  const triggerLabel = (spec?.label ?? rule.trigger.type).toLowerCase();
  const conditionsText =
    rule.conditions.length > 0
      ? `, si ${rule.conditions
          .map((condition) => describeCondition(rule.trigger.type, condition))
          .join(' y ')}`
      : '';
  const action = spec?.actions.find((candidate) => candidate.type === rule.actions[0]?.type);
  const recipientText = action ? `, entonces avisa ${action.recipientLabel}` : '';
  return `Cuando ${triggerLabel}${conditionsText}${recipientText}.`;
}
