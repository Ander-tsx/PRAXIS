/**
 * Contrato del formulario de crear proyecto: límites, validación y forma del
 * estado de la Server Action.
 *
 * Vive aquí porque lo comparten el organismo y las dos Server Actions que lo
 * alimentan —una por zona—, y las tres tienen que decir lo mismo. Estaba
 * duplicado literalmente en `dashboard-front` y `projects-front`.
 *
 * El gateway ya valida; seguimos validando aquí porque el mensaje llega antes,
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
 * Estado que devuelve la Server Action de creación.
 *
 * `createdName` es la confirmación: se rellena **solo** cuando el proyecto
 * existe de verdad en la respuesta, no cuando el status es 200. De ahí que sea
 * lo que cierra el diálogo.
 */
export interface CreateProjectState {
  error: string | null;
  createdName: string | null;
}

export const CREATE_PROJECT_INITIAL_STATE: CreateProjectState = {
  error: null,
  createdName: null,
};

/**
 * Firma de la Server Action que crea el proyecto.
 *
 * Se inyecta como prop porque **cada zona tiene la suya**: revalidan rutas
 * distintas y traducen los errores del gateway de forma distinta. El organismo
 * no puede importarla —viviría acoplado a una zona— y esta es la forma en que
 * el resto del repo resuelve lo mismo: la lógica en la page, el organismo con
 * props y slots.
 */
export type CreateProjectAction = (
  estadoPrevio: CreateProjectState,
  formData: FormData,
) => Promise<CreateProjectState>;
