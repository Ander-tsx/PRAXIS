/**
 * Estado de las Server Actions del panel.
 *
 * Vive fuera de `actions.ts` porque **un archivo `'use server'` solo puede
 * exportar funciones async**: exportar de ahí una constante rompe el módulo
 * entero en runtime, con un error que apunta al final del archivo y no al export
 * culpable.
 * https://nextjs.org/docs/messages/invalid-use-server-value
 */

/**
 * Estado de un cambio de estado de cuenta o de rol.
 *
 * `done` guarda **lo que confirmó el servidor**, no lo que se mandó: es lo que
 * permite comprobar contra el `data` de la respuesta en vez de contra el status,
 * que es la regla del repo desde que el gateway devolvía 200 sin guardar nada.
 */
export interface AdminUserState {
  error: string | null;
  /** El estado o el rol que el servidor dice que quedó guardado. */
  done: string | null;
}

export const ADMIN_USER_INITIAL_STATE: AdminUserState = { error: null, done: null };
