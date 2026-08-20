import type {
  AutomationReviewSummary,
  AutomationRule,
  AutomationRuleStatus,
} from '@praxis/commons/api/domain';

import {
  type AutomationCatalog,
  type ConditionField,
  OPERADORES,
  type OpcionesDelProyecto,
  SIN_OPCIONES,
  actionSpecFor,
  conditionFieldByName,
  conditionFieldFor,
  etiquetaDeValor,
  triggerSpecFor,
} from './automation-catalog';

export interface ConditionDraft {
  field: string;
  operator: string;
  /** Ya coaccionado al tipo correcto: número, booleano, texto o lista (para `IN`). */
  value: unknown;
}

export interface ActionDraft {
  type: string;
  /**
   * Lo que esa acción necesita para saber qué hacer.
   *
   * ⚠️ **Antes no existía**, y no podía existir: había una sola acción y su
   * configuración la fijaba el catálogo. Desde que una regla puede mover a una
   * columna concreta o poner una etiqueta concreta, la configuración es una
   * elección de quien escribe la regla y tiene que viajar con ella.
   */
  config: Record<string, unknown>;
}

/**
 * El estado editable del constructor. Vive en `useState` del lado del cliente;
 * `bodyFromDraft` es el único sitio que sabe traducirlo al cuerpo exacto del
 * contrato.
 */
export interface RuleDraft {
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: Record<string, number>;
  conditions: ConditionDraft[];
  actions: ActionDraft[];
  status: AutomationRuleStatus;
}

/** La configuración inicial de una acción, con los valores que ya se sepan. */
export function configInicialDeAccion(
  catalog: AutomationCatalog | null,
  type: string,
): Record<string, unknown> {
  const spec = actionSpecFor(catalog, type);
  const config: Record<string, unknown> = {};
  for (const campo of spec?.config ?? []) {
    /* Un desplegable con una sola opción se rellena solo: obligar a elegir
       cuando no hay nada que elegir es un paso de más. */
    if (campo.options?.length === 1) config[campo.key] = campo.options[0]?.value;
  }
  return config;
}

/** Un borrador nuevo, con los valores por defecto del catálogo. */
export function emptyDraft(catalog: AutomationCatalog | null, triggerType: string): RuleDraft {
  const spec = triggerSpecFor(catalog, triggerType);
  const triggerConfig: Record<string, number> = {};
  for (const field of spec?.config ?? []) triggerConfig[field.key] = field.defaultValue;

  /* Se arranca con «Avisar»: es la única acción que no escribe nada, así que
     es la que nunca puede fallar por permisos y la que casi todo el mundo
     quiere. Las demás se añaden. */
  const primera = catalog?.actions[0]?.type ?? 'CREATE_NOTIFICATION';
  return {
    name: '',
    description: '',
    triggerType,
    triggerConfig,
    conditions: [],
    actions: [{ type: primera, config: configInicialDeAccion(catalog, primera) }],
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
    actions: [...rule.actions]
      .sort((a, b) => a.position - b.position)
      .map((action) => ({
        type: action.type,
        config: (action.config ?? {}) as Record<string, unknown>,
      })),
    /**
     * `PAUSED_SYSTEM` e `INVALID` los pone el sistema y el cliente no puede
     * reenviarlos — un `PATCH` con cualquiera de los dos da 400. Guardar sin
     * tocar el estado sobre una regla en uno de esos dos colapsa a `DISABLED`,
     * la lectura segura: es la única forma editable de «esta regla no está
     * corriendo ahora mismo».
     */
    status: rule.status === 'ENABLED' ? 'ENABLED' : 'DISABLED',
  };
}

/** El cuerpo exacto que espera `POST`/`PATCH /automations` — ni un campo de más. */
export function bodyFromDraft(draft: RuleDraft) {
  const description = draft.description.trim();
  return {
    name: draft.name.trim(),
    ...(description && { description }),
    trigger: { type: draft.triggerType, config: draft.triggerConfig },
    conditions: draft.conditions.map(({ field, operator, value }) => ({ field, operator, value })),
    actions: draft.actions.map((action) => ({ type: action.type, config: action.config })),
    status: draft.status,
  };
}

/**
 * Reconstruye el borrador desde el `FormData` que emite el constructor.
 *
 * Las condiciones viajan en tres arrays paralelos —`conditionField`,
 * `conditionOperator`, `conditionValue`— y se recomponen por posición: la
 * entrada `i` de cada uno pertenece a la misma fila. Esa alineación depende de
 * que el formulario emita **siempre los tres** por fila, incluso cuando el
 * valor es un booleano en «No».
 *
 * ⚠️ **Las acciones viajan igual, y su configuración como JSON en una sola
 * entrada.** La alternativa —un campo por clave de configuración— rompe la
 * alineación en cuanto dos acciones tienen distinto número de campos, que es
 * exactamente lo que pasa desde que hay siete acciones con configuraciones
 * distintas.
 */
export function draftFromFormData(
  catalog: AutomationCatalog | null,
  formData: FormData,
): RuleDraft {
  const triggerType = String(formData.get('triggerType') ?? '');
  const spec = triggerSpecFor(catalog, triggerType);

  const triggerConfig: Record<string, number> = {};
  for (const field of spec?.config ?? []) {
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
      value: coerceConditionValue(catalog, triggerType, field, operator, rawValues[index] ?? ''),
    };
  });

  const actionTypes = formData.getAll('actionType').map(String);
  const actionConfigs = formData.getAll('actionConfig').map(String);
  const actions: ActionDraft[] = actionTypes.map((type, index) => ({
    type,
    config: parseConfig(actionConfigs[index]),
  }));

  return {
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    triggerType,
    triggerConfig,
    conditions,
    actions,
    status: formData.get('enabled') === 'on' ? 'ENABLED' : 'DISABLED',
  };
}

/** La configuración de una acción, que viaja como JSON en un campo oculto. */
function parseConfig(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    /* Un JSON roto se trata como configuración vacía: el validador dirá qué
       falta con el nombre del campo, que es mejor mensaje que «JSON inválido». */
    return {};
  }
}

function coerceScalar(kind: ConditionField['kind'] | undefined, raw: string): unknown {
  if (kind === 'integer') return Number(raw);
  if (kind === 'boolean') return raw === 'true';
  return raw;
}

/**
 * Traduce lo que emite un campo de formulario (siempre texto) al valor tipado
 * que el contrato espera. Con `IN`, `raw` es un array JSON producido por el
 * propio formulario: un `<select multiple>` rompería la invariante de los
 * arrays paralelos de `FormData`, así que la lista viaja como una sola cadena.
 */
export function coerceConditionValue(
  catalog: AutomationCatalog | null,
  triggerType: string,
  field: string,
  operator: string,
  raw: string,
): unknown {
  const kind = conditionFieldFor(catalog, triggerType, field)?.kind;
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

/* ─── Cómo se lee una regla ───────────────────────────────────────────────── */

function describeValue(
  campo: ConditionField | undefined,
  value: unknown,
  proyecto: OpcionesDelProyecto,
): string {
  if (campo?.kind === 'boolean') return value ? 'sí' : 'no';
  /* Un hueco se dice con palabras. `null` y `''` salían como «null» y como nada
     —«fecha de vencimiento null», «etiquetas ,»—, que es peor que no decirlo. */
  if (value === null || value === undefined || value === '') return 'sin poner';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'ninguna';
    return value
      .map((item) => (campo ? etiquetaDeValor(campo, item, proyecto) : String(item)))
      .join(', ');
  }
  return campo ? etiquetaDeValor(campo, value, proyecto) : String(value);
}

function describeCondition(
  catalog: AutomationCatalog | null,
  triggerType: string,
  condition: { field: string; operator: string; value: unknown },
  proyecto: OpcionesDelProyecto,
): string {
  const campo = conditionFieldFor(catalog, triggerType, condition.field);
  const label = (campo?.label ?? condition.field).toLowerCase();
  const verbo = OPERADORES[condition.operator as keyof typeof OPERADORES] ?? condition.operator;
  return `${label} ${verbo} ${describeValue(campo, condition.value, proyecto)}`;
}

/**
 * Las condiciones de una regla, una frase por condición.
 *
 * `describeRule` ya las mete dentro de su cláusula «si …», pero encadenadas con
 * «y» dentro de una frase larga: en una tarjeta con tres condiciones hay que
 * leerla entera para saber cuándo salta. Esto las saca a una lista, que es como
 * se escanean.
 */
export function describeConditions(
  catalog: AutomationCatalog | null,
  rule: AutomationRule,
  proyecto: OpcionesDelProyecto = SIN_OPCIONES,
): string[] {
  return [...rule.conditions]
    .sort((a, b) => a.position - b.position)
    .map((condition) => describeCondition(catalog, rule.trigger.type, condition, proyecto));
}

/** Cómo se lee una acción: «avisa a los encargados», «muévela a Hecho». */
export function describeAction(
  catalog: AutomationCatalog | null,
  action: { type: string; config?: Record<string, unknown> | null },
  proyecto: OpcionesDelProyecto = SIN_OPCIONES,
): string {
  const spec = actionSpecFor(catalog, action.type);
  if (!spec) return action.type;
  const partes = spec.config
    .map((campo) => {
      const valor = action.config?.[campo.key];
      if (valor === undefined || valor === null || valor === '') return null;
      return etiquetaDeValor(campo, valor, proyecto).toLowerCase();
    })
    .filter((parte): parte is string => parte !== null);
  return partes.length > 0 ? `${spec.sentence} ${partes.join(', ')}` : spec.label.toLowerCase();
}

/**
 * «Cuando …, si …, entonces …» — el mismo lenguaje que usa el constructor, para
 * que la tarjeta y el formulario cuenten la misma historia.
 */
export function describeRule(
  catalog: AutomationCatalog | null,
  rule: AutomationRule,
  proyecto: OpcionesDelProyecto = SIN_OPCIONES,
): string {
  const spec = triggerSpecFor(catalog, rule.trigger.type);
  const disparador = spec?.sentence ?? (spec?.label ?? rule.trigger.type).toLowerCase();
  const condiciones =
    rule.conditions.length > 0
      ? `, si ${describeConditions(catalog, rule, proyecto).join(' y ')}`
      : '';
  const acciones =
    rule.actions.length > 0
      ? `, entonces ${rule.actions
          .map((action) => describeAction(catalog, action, proyecto))
          .join(' y ')}`
      : '';
  return `Cuando ${disparador}${condiciones}${acciones}.`;
}

/**
 * Resume el `context` de una ejecución con las etiquetas del catálogo: no
 * identifica la tarea por sí solo —para eso está `subjectTitle`— pero sí dice
 * con qué datos se evaluó la condición, que es lo que explica el resultado.
 */
export function describeExecutionContext(
  catalog: AutomationCatalog | null,
  context: Record<string, unknown>,
  proyecto: OpcionesDelProyecto = SIN_OPCIONES,
): string {
  /**
   * ⚠️ **Solo los campos que el catálogo sabe nombrar.**
   *
   * El contexto lleva algún dato interno que ninguna condición puede filtrar
   * —`boardId`, `closed`— y salían crudos: «boardid
   * 6b489497-5a26-4356-972e-ae697e94ba14» en mitad de una frase en castellano.
   * Un identificador que nadie puede usar no explica nada; lo que explica el
   * resultado son los campos que se podían haber filtrado.
   */
  const partes = Object.entries(context)
    .map(([field, value]) => ({ campo: conditionFieldByName(catalog, field), value }))
    .filter((entrada) => entrada.campo !== undefined)
    .map(
      ({ campo, value }) =>
        `${(campo as ConditionField).label.toLowerCase()} ${describeValue(campo, value, proyecto)}`,
    );

  return partes.length === 0 ? 'Sin contexto.' : partes.join(', ');
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/**
 * El resumen de una revisión, ahora con el porqué de las que no actuaron.
 *
 * ⚠️ **«0 acciones» no significaba nada.** El resumen decía cuántas salieron
 * bien y cuántas fallaron, y ahí se acababa: una revisión con cuarenta
 * candidatas y ninguna acción se leía exactamente igual tanto si las
 * condiciones no se cumplían —la regla está mal escrita— como si ya se había
 * actuado ayer —todo va bien—. Dos situaciones opuestas y el mismo número.
 *
 * Los ceros no se escriben: «2 filtradas» aporta, «0 filtradas» solo alarga.
 */
export function describeReviewSummary(summary: AutomationReviewSummary): string {
  const partes = [
    `${summary.rules} ${pluralize(summary.rules, 'regla revisada', 'reglas revisadas')}`,
    `${summary.candidates} ${pluralize(summary.candidates, 'candidata', 'candidatas')}`,
    `${summary.succeeded} ${pluralize(summary.succeeded, 'acción', 'acciones')}`,
  ];
  if (summary.filtered) {
    partes.push(
      `${summary.filtered} sin cumplir ${pluralize(summary.filtered, 'la condición', 'las condiciones')}`,
    );
  }
  if (summary.repeated) {
    partes.push(`${summary.repeated} ya ${pluralize(summary.repeated, 'atendida', 'atendidas')}`);
  }
  if (summary.failed) {
    partes.push(`${summary.failed} ${pluralize(summary.failed, 'fallo', 'fallos')}`);
  }
  return partes.join(' · ');
}
