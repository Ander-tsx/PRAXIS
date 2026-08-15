/**
 * Estado de las Server Actions que consumen los formularios con
 * `useAccion`.
 *
 * Vive fuera de los `actions.ts` porque **un archivo `'use server'` solo puede
 * exportar funciones async**: exportar de ahí una constante rompe el módulo
 * entero en tiempo de ejecución, con un error que apunta al final del archivo
 * y no al export culpable.
 * https://nextjs.org/docs/messages/invalid-use-server-value
 */

/**
 * `CreateProjectState` y su estado inicial viven en commons, junto al organismo
 * que los consume: `commons/organisms/CreateProjectDialog/project-form.ts`.
 * Se reexportan para no tocar los imports existentes.
 */
export { CREATE_PROJECT_INITIAL_STATE, type CreateProjectState } from '@praxis/commons';

export interface UpdateProfileState {
  error: string | null;
  /** Nombre ya confirmado por el servidor, para el mensaje de éxito. */
  savedName: string | null;
}

export const UPDATE_PROFILE_INITIAL_STATE: UpdateProfileState = {
  error: null,
  savedName: null,
};

export interface InvitationResponseState {
  error: string | null;
  /** 'accept' o 'reject' cuando el servidor confirma. */
  done: string | null;
}

export const INVITATION_RESPONSE_INITIAL_STATE: InvitationResponseState = {
  error: null,
  done: null,
};

/** Estado de las acciones de la bandeja de avisos. */
export interface NotificationState {
  error: string | null;
  done: string | null;
}

export const NOTIFICATION_INITIAL_STATE: NotificationState = { error: null, done: null };

/**
 * Estado de la vinculación con Praxis Voice.
 *
 * La frase viaja **en el estado de la acción y no se guarda en ningún sitio**:
 * el backend solo conserva su hash, así que esta es la única vez que existe en
 * claro. Si se pierde —una recarga, cerrar la pestaña— no se recupera, se
 * genera otra; y por eso tampoco se mete en la caché de Next ni se revalida
 * ninguna ruta con ella dentro.
 */
export interface VoiceLinkState {
  error: string | null;
  phrase: string | null;
  /** ISO 8601. La cuenta atrás se calcula en el cliente contra esta marca. */
  expiresAt: string | null;
}

export const VOICE_LINK_INITIAL_STATE: VoiceLinkState = {
  error: null,
  phrase: null,
  expiresAt: null,
};
