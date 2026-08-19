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

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const hasOnlyKeys = (config: Record<string, unknown>, keys: string[]) =>
  Object.keys(config).every((key) => keys.includes(key));

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
  if (!Array.isArray(input.actions) || input.actions.length === 0) {
    throw new Error('La regla requiere al menos una acción');
  }
  if (input.actions.length > 5) throw new Error('Una regla admite como máximo cinco acciones');
  if (!Array.isArray(input.conditions)) throw new Error('Las condiciones deben ser una lista AND');

  const triggerConfig = input.trigger.config;
  if (
    (input.trigger.type === AutomationTriggerType.GITHUB_PULL_REQUEST_OPENED &&
      Object.keys(triggerConfig).length !== 0) ||
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
    if (action.type === AutomationActionType.MOVE_TASK && !isUuid(action.config.targetColumnId)) {
      throw new Error('MOVE_TASK requiere targetColumnId válido');
    }
    if (
      action.type === AutomationActionType.MOVE_TASK &&
      !hasOnlyKeys(action.config, ['targetColumnId'])
    ) {
      throw new Error('Configuración de MOVE_TASK inválida');
    }
    if (
      action.type === AutomationActionType.SEND_EMAIL &&
      (typeof action.config.template !== 'string' || !hasOnlyKeys(action.config, ['template']))
    ) {
      throw new Error('SEND_EMAIL requiere template');
    }
    if (
      action.type === AutomationActionType.CREATE_NOTIFICATION &&
      (typeof action.config.recipientSelector !== 'string' ||
        !hasOnlyKeys(action.config, ['recipientSelector']))
    ) {
      throw new Error('CREATE_NOTIFICATION requiere recipientSelector');
    }
    return { ...action, position };
  });
  const conditions = input.conditions.map((condition, position) => {
    if (!condition.field || !condition.operator) throw new Error('Condición inválida');
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
