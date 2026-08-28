/**
 * Estado de las Server Actions que consumen los formularios con
 * `useAccion`.
 *
 * Vive fuera de los `actions.ts` porque **un archivo `'use server'` solo puede
 * exportar funciones async**: exportar de ahí una constante rompe el módulo
 * entero en runtime, con un error que apunta al final del archivo y no al
 * export culpable.
 * https://nextjs.org/docs/messages/invalid-use-server-value
 */

import type { QuotaExceededDetails } from '@praxis/commons/billing/planes';

/**
 * `CreateProjectState` y su estado inicial viven en commons, junto al organismo
 * que los consume: `commons/organisms/CreateProjectDialog/project-form.ts`.
 * Se reexportan para no tocar los imports existentes.
 */
import type { AutomationReviewSummary } from '@praxis/commons';

export { CREATE_PROJECT_INITIAL_STATE, type CreateProjectState } from '@praxis/commons';

export interface RoleState {
  error: string | null;
  /** Nombre del rol ya confirmado por el servidor. */
  savedName: string | null;
}

export const ROLE_INITIAL_STATE: RoleState = { error: null, savedName: null };

export interface MemberState {
  error: string | null;
  /** Se rellena cuando el servidor confirma la operación. */
  done: string | null;
  /**
   * El detalle del 402 cuando el proyecto se quedó sin sitio en el plan.
   *
   * **Opcional a propósito.** Este estado lo comparten seis acciones —invitar,
   * retirar la invitación, cambiar de rol, sacar a alguien, salirse— y solo una
   * puede toparse con una cuota: la que hace crecer el equipo. Hacerlo
   * obligatorio llenaría las otras cinco de `cuota: null` sin decir nada.
   */
  cuota?: QuotaExceededDetails | null;
}

export const MEMBER_INITIAL_STATE: MemberState = { error: null, done: null };

export interface WorkspaceState {
  error: string | null;
  savedName: string | null;
  /** Id del espacio recién creado, para entrar en él sin otra petición. */
  createdId: string | null;
}

export const WORKSPACE_INITIAL_STATE: WorkspaceState = {
  error: null,
  savedName: null,
  createdId: null,
};

export interface BoardState {
  error: string | null;
  savedName: string | null;
}

export const BOARD_INITIAL_STATE: BoardState = { error: null, savedName: null };

export interface ColumnState {
  error: string | null;
  savedName: string | null;
}

export const COLUMN_INITIAL_STATE: ColumnState = { error: null, savedName: null };

export interface TaskState {
  error: string | null;
  /** Se rellena cuando el servidor confirma, con lo que confirmó. */
  done: string | null;
}

export const TASK_INITIAL_STATE: TaskState = { error: null, done: null };

export interface AutomationRuleState {
  error: string | null;
  /** Se rellena cuando el servidor confirma: el estado nuevo o 'eliminada'. */
  done: string | null;
}

export const AUTOMATION_RULE_INITIAL_STATE: AutomationRuleState = { error: null, done: null };

export interface ReviewState {
  error: string | null;
  /** Lo que confirmó el servidor de la última revisión — se pierde al recargar, no se persiste. */
  summary: AutomationReviewSummary | null;
}

export const REVIEW_INITIAL_STATE: ReviewState = { error: null, summary: null };

/**
 * Estado del borrado de un proyecto.
 *
 * Solo lleva error: cuando sale bien, la acción **redirige** a la lista, así que
 * no hay ninguna pantalla que pueda leer un `done`. La página que confirmó el
 * borrado deja de existir.
 */
export interface DeleteProjectState {
  error: string | null;
}

export const DELETE_PROJECT_INITIAL_STATE: DeleteProjectState = { error: null };

/**
 * Estado de la edición en línea del nombre y la descripción.
 *
 * Devuelve **lo que confirmó el servidor**, no lo que se mandó: es lo que
 * permite comprobar contra el `data` desde el cliente, y lo que se escribe en
 * `document.title` cuando el nombre cambia de verdad.
 */
export interface ProjectFieldState {
  error: string | null;
  savedName: string | null;
  savedDescription: string | null;
  /**
   * El slug que ha quedado tras guardar.
   *
   * Renombrar lo regenera, y entonces **la URL de la barra apunta a un slug que
   * ya no existe**: recargar daría 404 sobre un proyecto que está perfectamente.
   * La cabecera lo usa para corregir la dirección sin recargar.
   *
   * `null` cuando no se tocó el nombre: no hay nada que corregir.
   */
  savedSlug: string | null;
}

/** Estado de la respuesta a una invitación desde la página del proyecto. */
export interface InvitationResponseState {
  error: string | null;
  /** `accept` cuando el servidor lo confirma. Rechazar sale de la página. */
  done: string | null;
}

export const INVITATION_RESPONSE_INITIAL_STATE: InvitationResponseState = {
  error: null,
  done: null,
};
