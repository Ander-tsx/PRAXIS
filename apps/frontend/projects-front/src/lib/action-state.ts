/**
 * Estado de las Server Actions que consumen los formularios con
 * `useActionState`.
 *
 * Vive fuera de los `actions.ts` porque **un archivo `'use server'` solo puede
 * exportar funciones async**: exportar de ahí una constante rompe el módulo
 * entero en runtime, con un error que apunta al final del archivo y no al
 * export culpable.
 * https://nextjs.org/docs/messages/invalid-use-server-value
 */

export interface CreateProjectState {
  error: string | null;
  createdName: string | null;
}

export const CREATE_PROJECT_INITIAL_STATE: CreateProjectState = {
  error: null,
  createdName: null,
};

export interface RoleState {
  error: string | null;
  /** Nombre del rol ya confirmado por el servidor. */
  savedName: string | null;
}

export const ROLE_INITIAL_STATE: RoleState = { error: null, savedName: null };

export interface MemberState {
  error: string | null;
  /** Se rellena cuando el servidor confirma el alta o la baja. */
  done: string | null;
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
