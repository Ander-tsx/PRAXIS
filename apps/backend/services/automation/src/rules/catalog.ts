import {
  AutomationActionType,
  AutomationTriggerType,
  NotificationType,
  ProjectPermission,
} from '@praxis/contracts';

/**
 * El catálogo de automatización: qué se puede disparar, filtrar y hacer.
 *
 * ## Por qué esto existe como datos y no como ramas
 *
 * Antes, la lista de disparadores vivía en tres sitios a la vez —un `switch` en
 * el validador, otro en el motor y una copia a mano en el frontend—, y las tres
 * tenían que coincidir sin que nada lo comprobara. Añadir un disparador eran
 * tres ediciones y la garantía de olvidar una: el síntoma es un formulario que
 * ofrece algo que el validador rechaza, o peor, una condición que se guarda y
 * que el motor ignora en silencio.
 *
 * Aquí es **una entrada**. El validador la lee, el motor la lee, y el frontend
 * la recibe por `GET /projects/:id/automations/catalog`.
 *
 * ## Las dos familias de disparador
 *
 * - `sweep` describe un **estado** («vence pronto», «lleva parada»). No hay un
 *   instante en que ocurra, así que se evalúa cuando alguien revisa.
 * - `reactive` describe un **hecho** («la han movido»). Llega por el flujo de
 *   eventos de dominio y se atiende solo.
 *
 * ⚠️ **Un disparador reactivo solo puede existir si alguien emite su evento.**
 * `eventType` es esa atadura, y no es decorativa: si el nombre no coincide con
 * lo que `tasks-service` escribe en su outbox, la regla se guarda, se ve
 * habilitada en la pantalla y **no se dispara nunca**, sin un solo error. Es el
 * fallo más caro de este archivo, así que hay una prueba que cruza las dos
 * listas.
 */

/** Cómo se decide si una regla actúa. */
export type TriggerKind = 'sweep' | 'reactive';

/** Los operadores de una condición, y sobre qué tipo tienen sentido. */
export const CONDITION_OPERATORS = [
  'EQUALS',
  'NOT_EQUALS',
  'IN',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'CONTAINS',
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

/** Qué clase de valor lleva un campo. Decide operadores y validación. */
export type FieldKind = 'enum' | 'integer' | 'date' | 'boolean' | 'text' | 'uuid' | 'uuidList';

/**
 * Los operadores que admite cada clase de valor.
 *
 * ⚠️ **`GT` sobre un booleano no significa nada, y dejarlo pasar es peor que
 * rechazarlo**: se guarda una condición que el motor no puede evaluar y la regla
 * queda muda. Que el catálogo lo diga permite que el formulario ni siquiera lo
 * ofrezca.
 */
const OPERATORS_BY_KIND: Record<FieldKind, readonly ConditionOperator[]> = {
  enum: ['EQUALS', 'NOT_EQUALS', 'IN'],
  integer: ['EQUALS', 'NOT_EQUALS', 'GT', 'GTE', 'LT', 'LTE'],
  date: ['EQUALS', 'NOT_EQUALS', 'GT', 'GTE', 'LT', 'LTE'],
  boolean: ['EQUALS'],
  text: ['EQUALS', 'NOT_EQUALS', 'CONTAINS'],
  uuid: ['EQUALS', 'NOT_EQUALS', 'IN'],
  /* Una lista se pregunta por pertenencia, no por igualdad: «tiene la etiqueta
     X» es `CONTAINS`, y «no la tiene» es `NOT_EQUALS` sobre lo mismo. */
  uuidList: ['CONTAINS', 'NOT_EQUALS'],
};

export interface ConditionField {
  field: string;
  label: string;
  kind: FieldKind;
  operators: readonly ConditionOperator[];
  /** Solo en `enum`. Lo que el formulario ofrece y el validador exige. */
  options?: ReadonlyArray<{ value: string; label: string }>;
  /**
   * Solo en `uuid` / `uuidList`: de qué lista del proyecto salen los valores.
   *
   * El catálogo **no trae los valores**: las columnas y las etiquetas son de
   * cada proyecto y cambian, así que las resuelve el frontend con los datos que
   * ya tiene en pantalla. Aquí solo se dice cuál mirar.
   */
  source?: 'columns' | 'labels' | 'members';
  min?: number;
  help?: string;
}

export interface TriggerConfigField {
  key: string;
  label: string;
  kind: 'integer';
  min: number;
  required: boolean;
  defaultValue: number;
  help?: string;
}

export interface TriggerSpec {
  type: AutomationTriggerType;
  kind: TriggerKind;
  label: string;
  /** Cómo se lee en la frase de la regla: «Cuando …». */
  sentence: string;
  description: string;
  /** Solo en `reactive`: el hecho de dominio que lo despierta. */
  eventType?: string;
  /**
   * Qué aviso se manda cuando este disparador provoca un `CREATE_NOTIFICATION`.
   *
   * 🔴 **Esto salía del destinatario elegido, y era el fallo.** Con dos
   * disparadores, «a quien lleva el proyecto» coincidía con «lleva parada» y
   * «a los encargados» con «va a vencer», así que el texto acertaba de
   * casualidad. Con diez, crear una tarea y avisar a quien lleva el proyecto
   * mandaba **«lleva varios días sin movimiento»** sobre una tarea recién
   * creada: el texto describía a quién se le contaba, no lo que había pasado.
   *
   * El destinatario y el motivo son dos cosas distintas y ahora se deciden por
   * separado: el destinatario lo elige quien escribe la regla, el motivo lo
   * pone el disparador.
   */
  notificationType: NotificationType;
  config: readonly TriggerConfigField[];
  fields: readonly ConditionField[];
}

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Baja' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'HIGH', label: 'Alta' },
  { value: 'URGENT', label: 'Urgente' },
] as const;

/**
 * Los campos que trae **cualquier** tarea, se llegue a ella como se llegue.
 *
 * ⚠️ **Esto es lo que hace que un disparador nuevo sea barato.** El contexto de
 * una condición se construye siempre desde la tarea entera —tanto en un barrido
 * como al atender un evento, que solo trae ids y obliga a pedirla igual—, así
 * que todo disparador de tarea puede filtrar por lo mismo sin escribir nada.
 * Lo específico de cada uno se añade encima.
 */
const TASK_FIELDS: readonly ConditionField[] = [
  {
    field: 'priority',
    label: 'Prioridad',
    kind: 'enum',
    operators: OPERATORS_BY_KIND.enum,
    options: PRIORITY_OPTIONS,
  },
  {
    field: 'columnId',
    label: 'Columna',
    kind: 'uuid',
    operators: OPERATORS_BY_KIND.uuid,
    source: 'columns',
  },
  {
    field: 'labelIds',
    label: 'Etiquetas',
    kind: 'uuidList',
    operators: OPERATORS_BY_KIND.uuidList,
    source: 'labels',
    help: 'Se cumple si la tarea lleva la etiqueta elegida.',
  },
  {
    field: 'assigneeIds',
    label: 'Encargados',
    kind: 'uuidList',
    operators: OPERATORS_BY_KIND.uuidList,
    source: 'members',
  },
  {
    field: 'assigneeCount',
    label: 'Número de encargados',
    kind: 'integer',
    operators: OPERATORS_BY_KIND.integer,
    min: 0,
  },
  {
    field: 'title',
    label: 'Título',
    kind: 'text',
    operators: OPERATORS_BY_KIND.text,
    help: '«Contiene» no distingue mayúsculas.',
  },
  {
    field: 'dueDate',
    label: 'Fecha de vencimiento',
    kind: 'date',
    operators: OPERATORS_BY_KIND.date,
  },
];

export const TRIGGERS: readonly TriggerSpec[] = [
  /* ─── De barrido ──────────────────────────────────────────────────────── */
  {
    type: AutomationTriggerType.TASK_DUE_SOON,
    notificationType: NotificationType.AUTOMATION_TASK_DUE_SOON,
    kind: 'sweep',
    label: 'Una tarea va a vencer',
    sentence: 'una tarea esté a punto de vencer',
    description: 'Tareas abiertas, con encargado y con vencimiento dentro del margen.',
    config: [
      {
        key: 'leadTimeMinutes',
        label: 'Margen de aviso (minutos)',
        kind: 'integer',
        min: 1,
        required: true,
        defaultValue: 1440,
        help: '1440 son 24 horas.',
      },
    ],
    fields: TASK_FIELDS,
  },
  {
    type: AutomationTriggerType.TASK_STALE,
    notificationType: NotificationType.AUTOMATION_TASK_STALE,
    kind: 'sweep',
    label: 'Una tarea lleva parada',
    sentence: 'una tarea lleve demasiado tiempo sin moverse',
    description: 'Tareas abiertas sin movimiento en el número de días indicado.',
    config: [
      {
        key: 'days',
        label: 'Días sin moverse',
        kind: 'integer',
        min: 1,
        required: false,
        defaultValue: 7,
      },
    ],
    fields: [
      ...TASK_FIELDS,
      {
        field: 'staleDays',
        label: 'Días parada',
        kind: 'integer',
        operators: OPERATORS_BY_KIND.integer,
        min: 0,
      },
      { field: 'overdue', label: 'Está vencida', kind: 'boolean', operators: ['EQUALS'] },
      {
        field: 'withoutHistory',
        label: 'Sin historial',
        kind: 'boolean',
        operators: ['EQUALS'],
        help: 'Nunca se ha movido desde que se creó.',
      },
    ],
  },
  {
    type: AutomationTriggerType.TASK_OVERDUE,
    notificationType: NotificationType.AUTOMATION_TASK_OVERDUE,
    kind: 'sweep',
    label: 'Una tarea está vencida',
    sentence: 'una tarea haya pasado su fecha de vencimiento',
    description: 'Tareas abiertas cuyo vencimiento ya pasó.',
    config: [
      {
        key: 'minDaysOverdue',
        label: 'Días vencida como mínimo',
        kind: 'integer',
        min: 0,
        required: false,
        defaultValue: 0,
        help: '0 avisa el mismo día en que vence.',
      },
    ],
    fields: [
      ...TASK_FIELDS,
      {
        field: 'overdueDays',
        label: 'Días vencida',
        kind: 'integer',
        operators: OPERATORS_BY_KIND.integer,
        min: 0,
      },
    ],
  },
  {
    type: AutomationTriggerType.TASK_UNASSIGNED,
    notificationType: NotificationType.AUTOMATION_TASK_UNASSIGNED,
    kind: 'sweep',
    label: 'Una tarea no tiene encargado',
    sentence: 'una tarea lleve tiempo sin encargado',
    description: 'Tareas abiertas sin nadie asignado desde hace los días indicados.',
    config: [
      {
        key: 'minAgeDays',
        label: 'Días sin encargado',
        kind: 'integer',
        min: 0,
        required: false,
        defaultValue: 1,
      },
    ],
    fields: [
      ...TASK_FIELDS,
      {
        field: 'ageDays',
        label: 'Días desde que se creó',
        kind: 'integer',
        operators: OPERATORS_BY_KIND.integer,
        min: 0,
      },
    ],
  },

  /* ─── Reactivos ───────────────────────────────────────────────────────── */
  {
    type: AutomationTriggerType.TASK_CREATED,
    notificationType: NotificationType.AUTOMATION_TASK_CREATED,
    kind: 'reactive',
    label: 'Se crea una tarea',
    sentence: 'alguien cree una tarea',
    description: 'En cuanto la tarea existe.',
    eventType: 'task.created.v1',
    config: [],
    fields: TASK_FIELDS,
  },
  {
    type: AutomationTriggerType.TASK_MOVED,
    notificationType: NotificationType.AUTOMATION_TASK_MOVED,
    kind: 'reactive',
    label: 'Se mueve una tarea',
    sentence: 'alguien mueva una tarea de columna',
    description: 'Al cambiar de columna, sea arrastrando o editando.',
    eventType: 'task.moved.v1',
    config: [],
    fields: [
      ...TASK_FIELDS,
      {
        field: 'fromColumnId',
        label: 'Columna de origen',
        kind: 'uuid',
        operators: OPERATORS_BY_KIND.uuid,
        source: 'columns',
      },
      {
        field: 'toColumnId',
        label: 'Columna de destino',
        kind: 'uuid',
        operators: OPERATORS_BY_KIND.uuid,
        source: 'columns',
      },
    ],
  },
  {
    type: AutomationTriggerType.TASK_COMPLETED,
    notificationType: NotificationType.AUTOMATION_TASK_COMPLETED,
    kind: 'reactive',
    label: 'Se completa una tarea',
    sentence: 'una tarea se dé por terminada',
    description: 'Al llegar a una columna de cierre.',
    eventType: 'task.completed.v1',
    config: [],
    fields: TASK_FIELDS,
  },
  {
    type: AutomationTriggerType.TASK_REOPENED,
    notificationType: NotificationType.AUTOMATION_TASK_REOPENED,
    kind: 'reactive',
    label: 'Se reabre una tarea',
    sentence: 'una tarea terminada vuelva a abrirse',
    description: 'Al salir de una columna de cierre.',
    eventType: 'task.reopened.v1',
    config: [],
    fields: TASK_FIELDS,
  },
  {
    type: AutomationTriggerType.TASK_ASSIGNED,
    notificationType: NotificationType.AUTOMATION_TASK_ASSIGNEES_CHANGED,
    kind: 'reactive',
    label: 'Cambian los encargados',
    sentence: 'cambien los encargados de una tarea',
    description: 'Al asignar o quitar a alguien.',
    eventType: 'task.assignees-changed.v1',
    config: [],
    fields: TASK_FIELDS,
  },
  {
    type: AutomationTriggerType.TASK_DUE_DATE_CHANGED,
    notificationType: NotificationType.AUTOMATION_TASK_DUE_DATE_CHANGED,
    kind: 'reactive',
    label: 'Cambia el vencimiento',
    sentence: 'cambie la fecha de vencimiento de una tarea',
    description: 'Al poner, quitar o mover la fecha.',
    eventType: 'task.due-date-changed.v1',
    config: [],
    fields: TASK_FIELDS,
  },
];

/* ─── Acciones ────────────────────────────────────────────────────────────── */

export interface ActionConfigField {
  key: string;
  label: string;
  kind: 'enum' | 'text' | 'uuid';
  required: boolean;
  options?: ReadonlyArray<{ value: string; label: string }>;
  source?: 'columns' | 'labels' | 'members';
  maxLength?: number;
  help?: string;
}

export interface ActionSpec {
  type: AutomationActionType;
  label: string;
  /** Cómo se lee en la frase de la regla: «Entonces …». */
  sentence: string;
  /**
   * El permiso que debe tener **quien crea la regla** para poder elegirla.
   *
   * ⚠️ Ver D2 del plan. La acción se ejecuta sin sesión de nadie, así que este
   * es el único punto donde se comprueba que la regla no da más poder del que
   * tenía quien la escribió. `null` = no escribe nada del proyecto.
   */
  requires: ProjectPermission | null;
  config: readonly ActionConfigField[];
}

/**
 * ⚠️ **Aquí no hay «comentar en la tarea», y es deliberado.** Los comentarios
 * se retiraron de la interfaz de la tarea: el endpoint sigue vivo, pero una
 * automatización que escribiera comentarios los dejaría donde ya nadie los lee.
 * Escribir en el chat del proyecto sí se conserva — ese sí se lee.
 */
export const ACTIONS: readonly ActionSpec[] = [
  {
    type: AutomationActionType.CREATE_NOTIFICATION,
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
          { value: 'ASSIGNEES', label: 'A los encargados de la tarea' },
          { value: 'PROJECT_OWNER', label: 'A quien lleva el proyecto' },
        ],
      },
    ],
  },
  {
    type: AutomationActionType.MOVE_TASK,
    label: 'Mover la tarea',
    sentence: 'muévela a',
    requires: ProjectPermission.CAN_EDIT_TASK,
    config: [
      {
        key: 'targetColumnId',
        label: 'Columna de destino',
        kind: 'uuid',
        required: true,
        source: 'columns',
      },
    ],
  },
  {
    type: AutomationActionType.ASSIGN_TASK,
    label: 'Asignar la tarea',
    sentence: 'asígnasela a',
    requires: ProjectPermission.CAN_EDIT_TASK,
    config: [
      {
        key: 'assigneeId',
        label: 'Encargado',
        kind: 'uuid',
        required: true,
        source: 'members',
        help: 'Se añade a los que ya tenga; no reemplaza a nadie.',
      },
    ],
  },
  {
    type: AutomationActionType.SET_PRIORITY,
    label: 'Cambiar la prioridad',
    sentence: 'ponle prioridad',
    requires: ProjectPermission.CAN_EDIT_TASK,
    config: [
      {
        key: 'priority',
        label: 'Prioridad',
        kind: 'enum',
        required: true,
        options: PRIORITY_OPTIONS,
      },
    ],
  },
  {
    type: AutomationActionType.ADD_LABEL,
    label: 'Poner una etiqueta',
    sentence: 'ponle la etiqueta',
    requires: ProjectPermission.CAN_EDIT_TASK,
    config: [{ key: 'labelId', label: 'Etiqueta', kind: 'uuid', required: true, source: 'labels' }],
  },
  {
    type: AutomationActionType.POST_CHAT_MESSAGE,
    label: 'Escribir en el chat del proyecto',
    sentence: 'escribe en el chat',
    requires: ProjectPermission.CAN_COMMENT,
    config: [
      {
        key: 'text',
        label: 'Mensaje',
        kind: 'text',
        required: true,
        maxLength: 500,
        help: 'Puedes usar {tarea} y {proyecto}.',
      },
    ],
  },
];

/* ─── Búsquedas ───────────────────────────────────────────────────────────── */

export function triggerSpec(type: string): TriggerSpec | undefined {
  return TRIGGERS.find((trigger) => trigger.type === type);
}

export function actionSpec(type: string): ActionSpec | undefined {
  return ACTIONS.find((action) => action.type === type);
}

/** El disparador reactivo que atiende este hecho de dominio, si hay alguno. */
export function triggerForEvent(eventType: string): TriggerSpec | undefined {
  return TRIGGERS.find((trigger) => trigger.eventType === eventType);
}

/** El catálogo tal y como viaja al frontend. */
export function catalogPayload() {
  return { triggers: TRIGGERS, actions: ACTIONS, operators: CONDITION_OPERATORS };
}
