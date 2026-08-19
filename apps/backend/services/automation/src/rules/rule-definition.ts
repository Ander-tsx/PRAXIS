import {
  AutomationActionType,
  AutomationRuleStatus,
  AutomationTriggerType,
  CreateAutomationRuleBodyDto,
} from '@praxis/contracts';

export type NormalizedRuleDefinition = Omit<
  CreateAutomationRuleBodyDto,
  'actions' | 'conditions'
> & {
  status: AutomationRuleStatus;
  conditions: Array<{ field: string; operator: string; value: unknown; position: number }>;
  actions: Array<{ type: AutomationActionType; config: Record<string, unknown>; position: number }>;
};

const hasOnlyKeys = (config: Record<string, unknown>, keys: string[]) =>
  Object.keys(config).every((key) => keys.includes(key));

const conditionFields: Partial<Record<AutomationTriggerType, readonly string[]>> = {
  [AutomationTriggerType.TASK_DUE_SOON]: ['priority', 'dueDate', 'assigneeCount'],
  [AutomationTriggerType.TASK_STALE]: ['staleDays', 'overdue', 'withoutHistory'],
};

const conditionOperators = ['EQUALS', 'NOT_EQUALS', 'IN'] as const;

const conditionValueValidators: Record<string, (value: unknown) => boolean> = {
  priority: (value) => typeof value === 'string' && value.length > 0,
  dueDate: (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value),
  assigneeCount: (value) => Number.isInteger(value) && Number(value) >= 0,
  staleDays: (value) => Number.isInteger(value) && Number(value) >= 0,
  overdue: (value) => typeof value === 'boolean',
  withoutHistory: (value) => typeof value === 'boolean',
};

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
  if (!input.trigger || !Object.values(AutomationTriggerType).includes(input.trigger.type)) {
    throw new Error('Trigger no soportado');
  }
  if (
    input.trigger.type !== AutomationTriggerType.TASK_DUE_SOON &&
    input.trigger.type !== AutomationTriggerType.TASK_STALE
  ) {
    throw new Error('Trigger no soportado en el MVP académico');
  }
  if (!Array.isArray(input.actions) || input.actions.length === 0) {
    throw new Error('La regla requiere al menos una acción');
  }
  if (input.actions.length > 5) throw new Error('Una regla admite como máximo cinco acciones');
  if (!Array.isArray(input.conditions)) throw new Error('Las condiciones deben ser una lista AND');

  const triggerConfig = input.trigger.config;
  if (
    (input.trigger.type === AutomationTriggerType.TASK_DUE_SOON &&
      (!hasOnlyKeys(triggerConfig, ['leadTimeMinutes']) ||
        !Number.isInteger(triggerConfig.leadTimeMinutes) ||
        Number(triggerConfig.leadTimeMinutes) < 1)) ||
    (input.trigger.type === AutomationTriggerType.TASK_STALE &&
      (!hasOnlyKeys(triggerConfig, ['days']) ||
        (triggerConfig.days !== undefined &&
          (!Number.isInteger(triggerConfig.days) || Number(triggerConfig.days) < 1))))
  ) {
    throw new Error('Configuración de trigger inválida');
  }

  const normalizedTrigger =
    input.trigger.type === AutomationTriggerType.TASK_STALE
      ? { ...input.trigger, config: { days: 7, ...input.trigger.config } }
      : input.trigger;
  const actions = input.actions.map((action, position) => {
    if (!Object.values(AutomationActionType).includes(action.type))
      throw new Error('Acción no soportada');
    if (action.type !== AutomationActionType.CREATE_NOTIFICATION) {
      throw new Error('Acción no soportada en el MVP académico');
    }
    const selectors =
      input.trigger.type === AutomationTriggerType.TASK_DUE_SOON
        ? ['ASSIGNEES']
        : ['PROJECT_OWNER'];
    if (
      typeof action.config.recipientSelector !== 'string' ||
      !selectors.includes(action.config.recipientSelector) ||
      !hasOnlyKeys(action.config, ['recipientSelector'])
    ) {
      throw new Error(`recipientSelector inválido para ${input.trigger.type}`);
    }
    return { ...action, position };
  });
  const conditions = input.conditions.map((condition, position) => {
    if (!condition.field || !condition.operator) throw new Error('Condición inválida');
    if (!conditionFields[input.trigger.type]?.includes(condition.field)) {
      throw new Error(`Campo de condición no soportado para ${input.trigger.type}`);
    }
    if (!conditionOperators.includes(condition.operator as (typeof conditionOperators)[number])) {
      throw new Error('Operador de condición no soportado');
    }
    const values = condition.operator === 'IN' ? condition.value : [condition.value];
    if (condition.operator === 'IN' && !Array.isArray(condition.value)) {
      throw new Error('El operador IN requiere una lista');
    }
    if (
      condition.operator !== 'IN' &&
      (Array.isArray(condition.value) ||
        (typeof condition.value === 'object' && condition.value !== null))
    ) {
      throw new Error(`${condition.operator} requiere un valor escalar`);
    }
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      !values.every(conditionValueValidators[condition.field])
    ) {
      throw new Error(`Valor de condición inválido para ${condition.field}`);
    }
    return { ...condition, position };
  });
  return {
    ...input,
    trigger: normalizedTrigger,
    name: input.name.trim(),
    status: input.status ?? AutomationRuleStatus.DISABLED,
    conditions,
    actions,
  };
}
