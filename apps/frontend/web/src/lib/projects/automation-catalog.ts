/**
 * El catálogo de automatización, tal y como lo sirve el servidor.
 *
 * ## 🔴 Esto era una copia a mano, y por eso ya no lo es
 *
 * Aquí vivía la lista de disparadores, sus campos, sus operadores y sus
 * acciones, escritas otra vez en el cliente para que el formulario supiera qué
 * ofrecer. Era un espejo de `rule-definition.ts`, y los espejos se rompen: en
 * cuanto el servidor admitió diez disparadores en vez de dos, este archivo
 * seguía ofreciendo dos y **no había forma de notarlo** —no falla ninguna
 * compilación cuando el formulario ofrece de menos—.
 *
 * Ahora llega por `GET /projects/:id/automations/catalog` y lo que queda aquí
 * son **los tipos y las funciones de lectura**. Añadir un disparador es una
 * entrada en el servidor y cero cambios en esta zona.
 *
 * ⚠️ **El catálogo no trae valores de proyecto.** Las columnas, las etiquetas y
 * la gente son de cada proyecto y cambian; el catálogo solo dice de qué lista
 * sale cada campo (`source`), y quien pinta el formulario ya las tiene en
 * pantalla. Ver {@link OpcionesDelProyecto}.
 */

export type TriggerKind = 'sweep' | 'reactive';

export type ConditionOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'IN'
  | 'GT'
  | 'GTE'
  | 'LT'
  | 'LTE'
  | 'CONTAINS';

export type FieldKind = 'enum' | 'integer' | 'date' | 'boolean' | 'text' | 'uuid' | 'uuidList';

/** De qué lista del proyecto salen los valores de un campo. */
export type ValueSource = 'columns' | 'labels' | 'members';

export interface ConditionField {
  field: string;
  label: string;
  kind: FieldKind;
  operators: ConditionOperator[];
  options?: Array<{ value: string; label: string }>;
  source?: ValueSource;
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
  type: string;
  kind: TriggerKind;
  label: string;
  /** Cómo se lee en la frase: «Cuando …». */
  sentence: string;
  description: string;
  eventType?: string;
  config: TriggerConfigField[];
  fields: ConditionField[];
}

export interface ActionConfigField {
  key: string;
  label: string;
  kind: 'enum' | 'text' | 'uuid';
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  source?: ValueSource;
  maxLength?: number;
  help?: string;
}

export interface ActionSpec {
  type: string;
  label: string;
  /** Cómo se lee en la frase: «Entonces …». */
  sentence: string;
  /** El permiso que necesita quien crea la regla. `null` = no escribe nada. */
  requires: string | null;
  config: ActionConfigField[];
}

export interface AutomationCatalog {
  triggers: TriggerSpec[];
  actions: ActionSpec[];
  operators: ConditionOperator[];
}

/**
 * Las listas del proyecto de las que salen los valores con `source`.
 *
 * Se arman en la página, que ya las tiene: las columnas salen de los tableros
 * embebidos en `GET /projects/:id`, las etiquetas y la gente ya se piden para
 * otras secciones. Ninguna consulta nueva.
 */
export interface OpcionesDelProyecto {
  columns: Array<{ value: string; label: string }>;
  labels: Array<{ value: string; label: string }>;
  members: Array<{ value: string; label: string }>;
}

export const SIN_OPCIONES: OpcionesDelProyecto = { columns: [], labels: [], members: [] };

/** Cómo se lee cada operador dentro de la frase de una condición. */
export const OPERADORES: Record<ConditionOperator, string> = {
  EQUALS: 'es',
  NOT_EQUALS: 'no es',
  IN: 'es alguno de',
  GT: 'es mayor que',
  GTE: 'es al menos',
  LT: 'es menor que',
  LTE: 'es como mucho',
  CONTAINS: 'contiene',
};

export function triggerSpecFor(
  catalog: AutomationCatalog | null,
  type: string,
): TriggerSpec | undefined {
  return catalog?.triggers.find((spec) => spec.type === type);
}

export function actionSpecFor(
  catalog: AutomationCatalog | null,
  type: string,
): ActionSpec | undefined {
  return catalog?.actions.find((spec) => spec.type === type);
}

export function conditionFieldFor(
  catalog: AutomationCatalog | null,
  triggerType: string,
  field: string,
): ConditionField | undefined {
  return triggerSpecFor(catalog, triggerType)?.fields.find((spec) => spec.field === field);
}

/**
 * Un campo de condición buscado **sin saber el disparador**.
 *
 * ⚠️ Hace falta para las ejecuciones: la fila trae el contexto que se evaluó
 * pero el disparador de la regla no viaja con ella. Con los campos comunes a
 * todos los disparadores —prioridad, columna, etiquetas…— la respuesta es la
 * misma mire donde mire; con los propios de uno solo —`staleDays`,
 * `overdueDays`— también, porque ningún nombre se repite entre disparadores con
 * significados distintos. Si algún día uno lo hiciera, esto dejaría de ser
 * correcto y habría que llevar el disparador en la ejecución (ya se guarda en
 * `triggerType`, así que el arreglo sería propagarlo).
 */
export function conditionFieldByName(
  catalog: AutomationCatalog | null,
  field: string,
): ConditionField | undefined {
  for (const trigger of catalog?.triggers ?? []) {
    const spec = trigger.fields.find((candidate) => candidate.field === field);
    if (spec) return spec;
  }
  return undefined;
}

/** Las opciones de un campo, vengan del catálogo o de las listas del proyecto. */
export function opcionesDe(
  campo: { options?: Array<{ value: string; label: string }>; source?: ValueSource },
  proyecto: OpcionesDelProyecto,
): Array<{ value: string; label: string }> {
  if (campo.options) return campo.options;
  if (campo.source) return proyecto[campo.source];
  return [];
}

/**
 * El nombre legible de un valor que es un id.
 *
 * Sin esto, el resumen de una regla dice «Columna es
 * 3f2a…-9c11» — técnicamente cierto e inservible para comprobar nada.
 */
export function etiquetaDeValor(
  campo: { options?: Array<{ value: string; label: string }>; source?: ValueSource },
  valor: unknown,
  proyecto: OpcionesDelProyecto,
): string {
  const texto = String(valor);
  const opcion = opcionesDe(campo, proyecto).find((una) => una.value === texto);
  return opcion?.label ?? texto;
}
