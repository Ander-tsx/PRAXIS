import {
  ATTACHMENT_ALLOWED_MIME,
  ATTACHMENT_MAX_BYTES,
  COLUMN_COLORS,
  LABEL_COLORS,
  formatBytes,
} from '@praxis/commons';

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
