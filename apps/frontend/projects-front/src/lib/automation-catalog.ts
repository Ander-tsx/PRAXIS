import {
  AUTOMATION_CONDITION_OPERATORS,
  type AutomationActionType,
  type AutomationConditionOperator,
  type AutomationTriggerType,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@praxis/commons/api/domain';

/**
 * El catálogo académico de Reglas, como datos.
 *
 * Espejo de `rule-definition.ts` en `automation-service` — no del enum
 * `AutomationTriggerType`/`AutomationActionType` de `@praxis/contracts`, que es
 * más ancho que lo que el validador acepta. Ver
 * `docs/frontend/PENDIENTES-BACKEND-AUTOMATIZACION.md` §1: si algún día existe
 * `GET /automations/catalog`, este archivo se sustituye por la respuesta y
 * ningún componente que lo consuma cambia.
 *
 * Añadir un trigger, condición o acción nuevos es una entrada aquí, no una
 * rama nueva en un componente.
 */

/** El único tipo de valor que necesita un renderizador propio. */
export type ConditionValueKind = 'enum' | 'integer' | 'date' | 'boolean';

export interface ConditionFieldSpec {
  /** El nombre que espera el contrato en `AutomationConditionDto.field`. */
  field: string;
  label: string;
  kind: ConditionValueKind;
  operators: readonly AutomationConditionOperator[];
  /** Solo cuando `kind === 'enum'`. */
  options?: ReadonlyArray<{ value: string; label: string }>;
  /** Solo cuando `kind === 'integer'`. */
  min?: number;
  help?: string;
}

export interface ConfigFieldSpec {
  /** El nombre que espera el contrato en `AutomationTriggerDto.config`. */
  key: string;
  label: string;
  kind: 'integer';
  min: number;
  required: boolean;
  defaultValue: number;
  help?: string;
}

export interface ActionSpec {
  type: AutomationActionType;
  label: string;
  /**
   * Config fija que decide el trigger elegido, nunca quien usa el
   * formulario — D4 del plan: mandarla desde el cliente dejaría que el
   * navegador eligiera un campo que el validador ya tiene decidido.
   */
  config: Record<string, unknown>;
  /**
   * La frase preposicional completa —«a los responsables de la tarea», «al
   * dueño del proyecto»— y no solo el sustantivo: la contracción «a + el =
   * al» depende de cada destinatario, y bakearla aquí evita reconstruirla mal
   * en cada sitio que arma la frase.
   */
  recipientLabel: string;
}

/** Un borrador mínimo, lo único que necesita evaluar un aviso. */
export interface DraftForWarnings {
  conditions: ReadonlyArray<{ field: string; operator: string; value: unknown }>;
}

export interface DraftWarning {
  message: string;
  matches: (draft: DraftForWarnings) => boolean;
}

export interface TriggerSpec {
  type: AutomationTriggerType;
  label: string;
  description: string;
  configFields: readonly ConfigFieldSpec[];
  conditionFields: readonly ConditionFieldSpec[];
  actions: readonly ActionSpec[];
  /** Reglas que el contrato acepta pero que no pueden coincidir nunca — D9. */
  warnings: readonly DraftWarning[];
}

export const AUTOMATION_CATALOG: readonly TriggerSpec[] = [
  {
    type: 'TASK_DUE_SOON',
    label: 'Tarea próxima a vencer',
    description:
      'Se dispara sobre tareas abiertas, con fecha de vencimiento y con responsables asignados.',
    configFields: [
      {
        key: 'leadTimeMinutes',
        label: 'Minutos de antelación',
        kind: 'integer',
        min: 1,
        required: true,
        defaultValue: 1440,
        help: 'Cuánto antes del vencimiento cuenta como «próxima a vencer».',
      },
    ],
    conditionFields: [
      {
        field: 'priority',
        label: 'Prioridad',
        kind: 'enum',
        operators: AUTOMATION_CONDITION_OPERATORS,
        options: PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
      },
      {
        field: 'dueDate',
        label: 'Fecha de vencimiento',
        kind: 'date',
        operators: AUTOMATION_CONDITION_OPERATORS,
        help: 'Formato AAAA-MM-DD.',
      },
      {
        field: 'assigneeCount',
        label: 'Número de responsables',
        kind: 'integer',
        operators: AUTOMATION_CONDITION_OPERATORS,
        min: 0,
      },
    ],
    actions: [
      {
        type: 'CREATE_NOTIFICATION',
        label: 'Crear aviso',
        config: { recipientSelector: 'ASSIGNEES' },
        recipientLabel: 'a los responsables de la tarea',
      },
    ],
    warnings: [
      {
        message:
          'Esta condición nunca se cumple: las tareas sin responsables no entran a evaluación en este trigger.',
        matches: (draft) =>
          draft.conditions.some(
            (condition) =>
              condition.field === 'assigneeCount' &&
              condition.operator === 'EQUALS' &&
              Number(condition.value) === 0,
          ),
      },
    ],
  },
  {
    type: 'TASK_STALE',
    label: 'Tarea estancada',
    description: 'Se dispara sobre tareas abiertas sin movimiento reciente.',
    configFields: [
      {
        key: 'days',
        label: 'Días sin movimiento',
        kind: 'integer',
        min: 1,
        required: false,
        defaultValue: 7,
        help: 'Si se omite, el servidor usa 7 días.',
      },
    ],
    conditionFields: [
      {
        field: 'staleDays',
        label: 'Días parada',
        kind: 'integer',
        operators: AUTOMATION_CONDITION_OPERATORS,
        min: 0,
      },
      {
        field: 'overdue',
        label: 'Vencida',
        kind: 'boolean',
        operators: AUTOMATION_CONDITION_OPERATORS,
      },
      {
        field: 'withoutHistory',
        label: 'Sin historial',
        kind: 'boolean',
        operators: AUTOMATION_CONDITION_OPERATORS,
      },
    ],
    actions: [
      {
        type: 'CREATE_NOTIFICATION',
        label: 'Crear aviso',
        config: { recipientSelector: 'PROJECT_OWNER' },
        recipientLabel: 'al dueño del proyecto',
      },
    ],
    warnings: [],
  },
];

export function triggerSpecFor(type: string): TriggerSpec | undefined {
  return AUTOMATION_CATALOG.find((spec) => spec.type === type);
}

export function conditionFieldSpecFor(
  triggerType: string,
  field: string,
): ConditionFieldSpec | undefined {
  return triggerSpecFor(triggerType)?.conditionFields.find((spec) => spec.field === field);
}

/**
 * Busca un campo de condición por nombre en **todo** el catálogo, sin
 * necesitar el trigger. Hace falta para las ejecuciones: `recent()` en
 * `automation-service` incluye `rule: { select: { name: true } } }` — el
 * trigger que generó cada `conditionResult.context` no viaja, así que no se
 * puede resolver con `conditionFieldSpecFor`. Vale porque en el MVP ningún
 * nombre de campo se repite entre triggers (`priority`/`dueDate`/
 * `assigneeCount` contra `staleDays`/`overdue`/`withoutHistory`); si un
 * trigger nuevo reutilizara un nombre, dejaría de ser correcto.
 */
export function conditionFieldSpecByName(field: string): ConditionFieldSpec | undefined {
  for (const trigger of AUTOMATION_CATALOG) {
    const spec = trigger.conditionFields.find((candidate) => candidate.field === field);
    if (spec) return spec;
  }
  return undefined;
}
