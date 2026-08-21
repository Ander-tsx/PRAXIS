import {
  ATTACHMENT_ALLOWED_MIME,
  ATTACHMENT_MAX_BYTES,
  COLUMN_COLORS,
  LABEL_COLORS,
  formatBytes,
} from '@praxis/commons';
import {
  type AutomationCatalog,
  type ConditionField,
  actionSpecFor,
  conditionFieldFor,
  triggerSpecFor,
} from './automation-catalog';
import type { RuleDraft } from './automation-draft';

/**
 * Validación del cliente, espejo de la del gateway.
 *
 * El backend ya valida de verdad, pero seguimos validando aquí: el mensaje
 * llega antes, sin ida y vuelta, y marca el campo concreto. Los límites
 * replican los de los DTO para que no digan cosas distintas.
 */

/**
 * Validación de proyecto: **reexportada desde commons**.
 *
 * La definición vive en `commons/organisms/CreateProjectDialog/project-form.ts`
 * porque la comparten el organismo y las Server Actions de las dos zonas, y las
 * tres tienen que decir lo mismo. Estuvo copiada aquí y allí.
 *
 * Se reexporta en lugar de cambiar los imports de media zona: el nombre local
 * ya está en uso y la fuente única es lo que importaba.
 */
export {
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  PROJECT_NAME_MIN,
  type ProjectInput,
  validateProject,
} from '@praxis/commons';

/**
 * Validación del perfil.
 *
 * `UpdateUserDto` solo pide `@IsString()` para ambos campos: no fija longitudes
 * ni obliga a ninguno. Los límites de aquí son nuestros, para que el formulario
 * tenga sentido, y son **más estrictos** que los del backend — así nunca
 * mandamos algo que el servidor rechazaría el día que valide de verdad.
 */
export const NAME_MIN = 2;
export const NAME_MAX = 60;

export interface ProfileInput {
  firstName: string;
  lastName: string;
}

export function validateProfile({ firstName, lastName }: ProfileInput): string | null {
  const fields = [
    { value: firstName.trim(), label: 'El nombre' },
    { value: lastName.trim(), label: 'El apellido' },
  ];

  for (const { value, label } of fields) {
    if (value.length < NAME_MIN) {
      return `${label} debe tener al menos ${NAME_MIN} caracteres.`;
    }
    if (value.length > NAME_MAX) {
      return `${label} no puede superar ${NAME_MAX} caracteres.`;
    }
  }

  return null;
}

export const ROLE_NAME_MIN = 2;
export const ROLE_NAME_MAX = 50;

/**
 * Un rol sin permisos se crea sin error y no sirve para nada, así que se exige
 * al menos uno. `canViewProject` basta: es un observador legítimo.
 */
export function validateRole(name: string, permissionCount: number): string | null {
  const trimmed = name.trim();
  if (trimmed.length < ROLE_NAME_MIN) {
    return `El nombre del rol debe tener al menos ${ROLE_NAME_MIN} caracteres.`;
  }
  if (trimmed.length > ROLE_NAME_MAX) {
    return `El nombre del rol no puede superar ${ROLE_NAME_MAX} caracteres.`;
  }
  if (permissionCount === 0) {
    return 'Marca al menos un permiso: un rol sin permisos no deja hacer nada.';
  }
  return null;
}

export const WORKSPACE_NAME_MIN = 2;
export const WORKSPACE_NAME_MAX = 100;

export function validateWorkspace(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < WORKSPACE_NAME_MIN) {
    return `El nombre debe tener al menos ${WORKSPACE_NAME_MIN} caracteres.`;
  }
  if (trimmed.length > WORKSPACE_NAME_MAX) {
    return `El nombre no puede superar ${WORKSPACE_NAME_MAX} caracteres.`;
  }
  return null;
}

export const BOARD_NAME_MIN = 2;
export const BOARD_NAME_MAX = 100;

export function validateBoard(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < BOARD_NAME_MIN) {
    return `El nombre debe tener al menos ${BOARD_NAME_MIN} caracteres.`;
  }
  if (trimmed.length > BOARD_NAME_MAX) {
    return `El nombre no puede superar ${BOARD_NAME_MAX} caracteres.`;
  }
  return null;
}

export const TASK_TITLE_MIN = 1;
export const TASK_TITLE_MAX = 255;

export function validateTask(title: string): string | null {
  const trimmed = title.trim();
  if (trimmed.length < TASK_TITLE_MIN) return 'La tarea necesita un título.';
  if (trimmed.length > TASK_TITLE_MAX) {
    return `El título no puede superar ${TASK_TITLE_MAX} caracteres.`;
  }
  return null;
}

export const LABEL_NAME_MAX = 40;

/**
 * El color no es libre: es un token del design system. Se valida aquí también
 * porque un `<select>` manipulado mandaría cualquier cosa.
 */
export function validateLabel(name: string, color: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'La etiqueta necesita un nombre.';
  if (trimmed.length > LABEL_NAME_MAX) {
    return `El nombre no puede superar ${LABEL_NAME_MAX} caracteres.`;
  }
  if (!LABEL_COLORS.includes(color as (typeof LABEL_COLORS)[number])) {
    return 'Elige uno de los colores disponibles.';
  }
  return null;
}

export const CHECKLIST_TEXT_MAX = 500;

export function validateChecklistItem(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'Escribe qué hay que hacer.';
  if (trimmed.length > CHECKLIST_TEXT_MAX) {
    return `El ítem no puede superar ${CHECKLIST_TEXT_MAX} caracteres.`;
  }
  return null;
}

/**
 * Valida un archivo antes de subirlo.
 *
 * El backend valida igual, pero comprobarlo aquí evita mandar diez megas por la
 * red para que los rechacen: el aviso llega antes de empezar a subir.
 */
export function validateAttachment(mimeType: string, size: number): string | null {
  if (!ATTACHMENT_ALLOWED_MIME.includes(mimeType as (typeof ATTACHMENT_ALLOWED_MIME)[number])) {
    return 'Solo se admiten archivos PDF.';
  }
  if (size > ATTACHMENT_MAX_BYTES) {
    return `El archivo pesa ${formatBytes(size)} y el máximo son ${formatBytes(ATTACHMENT_MAX_BYTES)}.`;
  }
  return null;
}

export const COMMENT_MAX = 4000;

/**
 * Normaliza los saltos de línea de un `<textarea>`.
 *
 * Al enviar un formulario, el navegador convierte los saltos a `\r\n` por
 * especificación. Guardarlos así deja un `\r` suelto que se cuela al pintar el
 * texto y descuadra el recuento de caracteres.
 */
export function normalizeMultiline(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

export function validateComment(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed.length === 0) return 'Escribe algo antes de enviar.';
  if (trimmed.length > COMMENT_MAX) {
    return `El comentario no puede superar ${COMMENT_MAX} caracteres.`;
  }
  return null;
}

/**
 * Tope de un mensaje del chat. El mismo que un comentario, y a propósito: que
 * los dos campos de texto largo del producto acepten lo mismo evita que el
 * límite dependa de en qué pantalla estés escribiendo.
 *
 * Espejo de `CHAT_MESSAGE_MAX` en `@praxis/contracts`.
 */
export const CHAT_MESSAGE_MAX = 4000;

export function validateChatMessage(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed.length === 0) return 'Escribe algo antes de enviar.';
  if (trimmed.length > CHAT_MESSAGE_MAX) {
    return `El mensaje no puede superar ${CHAT_MESSAGE_MAX} caracteres.`;
  }
  return null;
}

export const COLUMN_NAME_MIN = 1;
export const COLUMN_NAME_MAX = 100;

export function validateColumn(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < COLUMN_NAME_MIN) return 'La columna necesita un nombre.';
  if (trimmed.length > COLUMN_NAME_MAX) {
    return `El nombre no puede superar ${COLUMN_NAME_MAX} caracteres.`;
  }
  return null;
}

/**
 * Color de una columna: token del sistema, no hex.
 *
 * Mismo criterio que en las etiquetas. El backend responde 400 con la lista de
 * válidos, pero llegar hasta allí para descubrirlo no aporta nada.
 */
export function validateColumnColor(color: string): string | null {
  if (!COLUMN_COLORS.includes(color as (typeof COLUMN_COLORS)[number])) {
    return 'Ese color no es del sistema.';
  }
  return null;
}

/**
 * Validación de una regla de automatización, espejo de
 * `rule-definition.ts` en `automation-service` — verificado contra el
 * contrato real en `e2e/tests/api/15-automatizaciones-academicas.spec.ts`.
 *
 * `status: 'INVALID'` y una clave de más en `trigger.config`/`action.config`
 * no están aquí: `RuleDraft` los excluye por construcción (el tipo de
 * `status` solo admite `ENABLED`/`DISABLED`, y `bodyFromDraft` arma la config
 * de la acción desde el catálogo, no desde el borrador) — no hay ninguna
 * combinación de la interfaz que pueda producirlos.
 */
export const AUTOMATION_RULE_NAME_MIN = 2;
export const AUTOMATION_RULE_NAME_MAX = 120;
export const AUTOMATION_RULE_DESCRIPTION_MAX = 1000;
export const AUTOMATION_RULE_MAX_ACTIONS = 5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateConditionScalar(fieldSpec: ConditionField, value: unknown): string | null {
  if (fieldSpec.kind === 'integer') {
    const min = fieldSpec.min ?? 0;
    if (!Number.isInteger(value) || (value as number) < min) {
      return `${fieldSpec.label} debe ser un número entero de ${min} o más.`;
    }
  }
  if (fieldSpec.kind === 'boolean' && typeof value !== 'boolean') {
    return `${fieldSpec.label} debe ser sí o no.`;
  }
  if (
    fieldSpec.kind === 'date' &&
    (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
  ) {
    return `${fieldSpec.label} debe tener el formato AAAA-MM-DD.`;
  }
  if (fieldSpec.kind === 'enum' && fieldSpec.options) {
    const allowed = fieldSpec.options.map((option) => option.value);
    if (!allowed.includes(String(value))) {
      return `${fieldSpec.label}: ese valor no está en el catálogo.`;
    }
  }
  /* Un campo que apunta a una columna, una etiqueta o una persona lleva su id.
     Si aquí llega otra cosa, es que el desplegable se quedó sin elegir — y el
     servidor respondería con un 400 sobre un UUID que no dice qué falta. */
  if (
    (fieldSpec.kind === 'uuid' || fieldSpec.kind === 'uuidList') &&
    (typeof value !== 'string' || !UUID.test(value))
  ) {
    return `${fieldSpec.label}: elige un valor de la lista.`;
  }
  if (fieldSpec.kind === 'text' && (typeof value !== 'string' || value.trim().length === 0)) {
    return `${fieldSpec.label} no puede quedar vacío.`;
  }
  return null;
}

function validateConditionValue(
  fieldSpec: ConditionField,
  operator: string,
  value: unknown,
): string | null {
  if (operator === 'IN') {
    if (!Array.isArray(value) || value.length === 0) {
      return `${fieldSpec.label}: "es alguno de" exige al menos un valor.`;
    }
    for (const item of value) {
      const error = validateConditionScalar(fieldSpec, item);
      if (error) return error;
    }
    return null;
  }
  if (Array.isArray(value)) {
    return `${fieldSpec.label}: este operador exige un único valor, no una lista.`;
  }
  return validateConditionScalar(fieldSpec, value);
}

/**
 * Qué parte del formulario tiene el fallo.
 *
 * Existe porque un mensaje suelto no dice dónde mirar: `RuleDialog` pintaba
 * **todos** los errores bajo el campo «Nombre», así que un fallo en una
 * condición marcaba en rojo un campo que estaba bien y mandaba a corregirlo
 * donde no estaba el problema.
 */
export type AutomationErrorScope = 'name' | 'description' | 'trigger' | 'conditions' | 'actions';

export interface AutomationDraftError {
  ambito: AutomationErrorScope;
  mensaje: string;
}

export function validateAutomationDraft(
  catalog: AutomationCatalog | null,
  draft: RuleDraft,
): AutomationDraftError | null {
  const name = draft.name.trim();
  if (name.length < AUTOMATION_RULE_NAME_MIN) {
    return {
      ambito: 'name',
      mensaje: `El nombre debe tener al menos ${AUTOMATION_RULE_NAME_MIN} caracteres.`,
    };
  }
  if (name.length > AUTOMATION_RULE_NAME_MAX) {
    return {
      ambito: 'name',
      mensaje: `El nombre no puede superar ${AUTOMATION_RULE_NAME_MAX} caracteres.`,
    };
  }
  if (draft.description.trim().length > AUTOMATION_RULE_DESCRIPTION_MAX) {
    return {
      ambito: 'description',
      mensaje: `La descripción no puede superar ${AUTOMATION_RULE_DESCRIPTION_MAX} caracteres.`,
    };
  }

  const spec = triggerSpecFor(catalog, draft.triggerType);
  if (!spec) return { ambito: 'trigger', mensaje: 'Elige cuándo tiene que actuar la regla.' };

  for (const field of spec.config) {
    const value = draft.triggerConfig[field.key];
    if (field.required && (value === undefined || value === null)) {
      return { ambito: 'trigger', mensaje: `${field.label} es obligatorio.` };
    }
    if (value !== undefined && value !== null && (!Number.isInteger(value) || value < field.min)) {
      return {
        ambito: 'trigger',
        mensaje: `${field.label} debe ser un número entero de ${field.min} o más.`,
      };
    }
  }

  if (draft.actions.length === 0) {
    return { ambito: 'actions', mensaje: 'La regla requiere al menos una acción.' };
  }
  if (draft.actions.length > AUTOMATION_RULE_MAX_ACTIONS) {
    return { ambito: 'actions', mensaje: 'Una regla admite como máximo cinco acciones.' };
  }

  /* Cada acción, con lo que su catálogo diga que necesita. Sin esto, una acción
     a medio configurar viaja y vuelve como un 400 sobre una clave interna. */
  for (const action of draft.actions) {
    const actionSpec = actionSpecFor(catalog, action.type);
    if (!actionSpec) {
      return { ambito: 'actions', mensaje: `«${action.type}» no es una acción admitida.` };
    }
    for (const campo of actionSpec.config) {
      const valor = action.config[campo.key];
      if (campo.required && (valor === undefined || valor === null || valor === '')) {
        return {
          ambito: 'actions',
          mensaje: `${actionSpec.label}: falta «${campo.label}».`,
        };
      }
      if (
        campo.kind === 'uuid' &&
        valor !== undefined &&
        (typeof valor !== 'string' || !UUID.test(valor))
      ) {
        return {
          ambito: 'actions',
          mensaje: `${actionSpec.label}: elige un valor para «${campo.label}».`,
        };
      }
      if (
        campo.kind === 'text' &&
        typeof valor === 'string' &&
        valor.length > (campo.maxLength ?? 500)
      ) {
        return {
          ambito: 'actions',
          mensaje: `${actionSpec.label}: «${campo.label}» no puede pasar de ${campo.maxLength ?? 500} caracteres.`,
        };
      }
    }
  }

  for (const condition of draft.conditions) {
    const fieldSpec = conditionFieldFor(catalog, draft.triggerType, condition.field);
    if (!fieldSpec) {
      return {
        ambito: 'conditions',
        mensaje: `«${condition.field}» no es una condición de ${spec.label}.`,
      };
    }
    /* Contra los operadores **de ese campo**, no contra la lista entera: `GT`
       existe, pero no sobre un booleano. Es la misma regla que aplica el
       servidor, y comprobarla aquí la explica antes y con el nombre del campo. */
    if (!fieldSpec.operators.includes(condition.operator as never)) {
      return {
        ambito: 'conditions',
        mensaje: `«${fieldSpec.label}» no admite ese operador.`,
      };
    }
    const error = validateConditionValue(fieldSpec, condition.operator, condition.value);
    if (error) return { ambito: 'conditions', mensaje: error };
  }

  return null;
}
