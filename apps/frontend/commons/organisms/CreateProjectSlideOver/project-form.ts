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

import type { QuotaExceededDetails } from '../../billing/planes';
import type { ProjectTemplate, TemplateDraftState, TemplateResult } from '../../api/domain';

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
  /**
   * El detalle del 402 cuando el plan se quedó sin proyectos.
   *
   * ⚠️ **Va aparte de `error` y no dentro de él.** `error` es una frase; esto
   * es el dato con el que se pinta la salida —el tope, cuánto llevas y qué plan
   * lo pone— y sin él el diálogo solo puede enseñar una línea roja más, que es
   * justo lo que dejaba a esta pantalla siendo un callejón. `error` se rellena
   * igualmente para quien solo quiera el texto.
   */
  cuota: QuotaExceededDetails | null;
}

export const CREATE_PROJECT_INITIAL_STATE: CreateProjectState = {
  error: null,
  createdName: null,
  cuota: null,
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

/**
 * Firmas de las dos Server Actions del modo asistido.
 *
 * Se inyectan como props por lo mismo que `CreateProjectAction`: cada zona
 * revalida sus rutas y navega a lo suyo, y el organismo no puede importarlas sin
 * quedar acoplado a una de las dos.
 *
 * ⚠️ **Son opcionales, y el modo asistido solo aparece si llegan las dos.** Sin
 * una de ellas el diálogo es exactamente el de antes: nombre, descripción y
 * crear. Así una zona nueva no hereda un botón que no sabe atender, y el modo
 * puede apagarse desde fuera sin tocar el organismo.
 */
export type TemplateDraftAction = (
  brief: string,
  /** Un retoque sobre el plan que ya se propuso. Sin esto, genera de cero. */
  ajuste?: { texto: string; previa: ProjectTemplate },
) => Promise<TemplateDraftState>;

export type AplicarPlantillaAction = (plantilla: ProjectTemplate) => Promise<TemplateResult>;
