/**
 * Validación del cliente, espejo de la del gateway.
 *
 * El backend ya valida de verdad, pero seguimos validando aquí: el mensaje
 * llega antes, sin ida y vuelta, y marca el campo concreto. Los límites
 * replican los de los DTO para que no digan cosas distintas.
 */

export const PROJECT_NAME_MIN = 2;
export const PROJECT_NAME_MAX = 100;
export const PROJECT_DESCRIPTION_MAX = 500;

export interface ProjectInput {
  name: string;
  description?: string;
}

/** Devuelve el mensaje del primer error, o null si el proyecto es válido. */
export function validateProject({ name, description }: ProjectInput): string | null {
  const trimmedName = name.trim();

  if (trimmedName.length < PROJECT_NAME_MIN) {
    return `El nombre debe tener al menos ${PROJECT_NAME_MIN} caracteres.`;
  }
  if (trimmedName.length > PROJECT_NAME_MAX) {
    return `El nombre no puede superar ${PROJECT_NAME_MAX} caracteres.`;
  }
  if ((description?.trim().length ?? 0) > PROJECT_DESCRIPTION_MAX) {
    return `La descripción no puede superar ${PROJECT_DESCRIPTION_MAX} caracteres.`;
  }

  return null;
}

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
