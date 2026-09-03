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
 * que los consume: `commons/organisms/CreateProjectForm/project-form.ts`.
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

/* ─── Organizaciones ───────────────────────────────────────────────────────
 *
 * Todas comparten forma —`error` y algo que confirma el servidor— porque las
 * consume el mismo patrón: `useAccion`, un botón y un mensaje debajo. Lo que
 * cambia es qué se confirma, y ahí sí son distintas: una invitación devuelve un
 * enlace que hay que poder copiar, y un cambio de asientos, el número que quedó.
 */

export interface CrearOrganizacionState {
  error: string | null;
  /** El id de la que se acaba de crear, para llevar hasta su portal. */
  creada: string | null;
}

export const CREAR_ORGANIZACION_INITIAL_STATE: CrearOrganizacionState = {
  error: null,
  creada: null,
};

export interface InvitarMiembroState {
  error: string | null;
  /**
   * El enlace de la invitación, que **solo llega una vez**.
   *
   * ⚠️ En la base queda su hash, así que si se pierde no hay forma de volver a
   * verlo: hay que cancelar la invitación y volver a invitar. Por eso la
   * pantalla lo deja a la vista y copiable en vez de enseñar un «hecho».
   */
  enlace: string | null;
  email: string | null;
  /** Si el correo salió. El enlace se enseña igual, pero se dice cuál de los dos. */
  correoEnviado?: boolean;
}

export const INVITAR_MIEMBRO_INITIAL_STATE: InvitarMiembroState = {
  error: null,
  enlace: null,
  email: null,
};

/** Las que solo dicen si salió bien: sacar a alguien, cambiar rol o asientos. */
export interface OrganizacionState {
  error: string | null;
  done: string | null;
}

export const ORGANIZACION_INITIAL_STATE: OrganizacionState = { error: null, done: null };
