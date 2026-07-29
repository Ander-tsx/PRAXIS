/**
 * Validación de proyecto, compartida por el formulario y la Server Action.
 *
 * El gateway ya valida, pero seguimos validando aquí: el mensaje llega antes,
 * sin ida y vuelta, y marca el campo concreto. Los límites replican los del DTO
 * para que no digan cosas distintas.
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
