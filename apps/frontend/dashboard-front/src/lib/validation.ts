/**
 * Validación de proyecto, compartida por el formulario y la Server Action.
 *
 * Se valida en los dos sitios a propósito: el gateway **no valida** este
 * endpoint (`@Body() body: Omit<CreateProjectDto, 'ownerId'>` es un tipo de
 * TypeScript, que en runtime no existe), así que un `name` de un carácter se
 * guarda tal cual con un 201. Ver PENDIENTES-BACKEND.md §2.
 *
 * Los límites replican los de `CreateProjectDto` para que, el día que el
 * backend empiece a validar de verdad, no cambie nada.
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
