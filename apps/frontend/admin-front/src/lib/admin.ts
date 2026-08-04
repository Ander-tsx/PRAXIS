import type {
  AdminActionName,
  AdminActivityEntry,
  AdminProject,
  AdminUser,
  GlobalRoleName,
  ProjectStatusName,
  UserStatusName,
} from '@praxis/commons';

/** `GET /admin/users` y `GET /admin/activity` devuelven esta forma. */
export interface AdminUserPage {
  items: AdminUser[];
  total: number;
}

/** `GET /admin/projects` → `{ items, total }`. */
export interface AdminProjectPage {
  items: AdminProject[];
  total: number;
}

export interface AdminActivityPage {
  items: AdminActivityEntry[];
  total: number;
  page: number;
  limit: number;
}

/** Cuántas filas por página. El backend acepta hasta 100. */
export const FILAS_POR_PAGINA = 25;

/**
 * Cómo se llama cada estado en pantalla, y de qué color.
 *
 * `INACTIVE` no dice «inactivo» sino «dada de baja»: es la diferencia con
 * `SUSPENDED`, que es una sanción. El login rechaza los dos igual, pero llamar
 * «suspensión» a una baja voluntaria es acusar a alguien de algo.
 */
export const ESTADOS: Record<
  UserStatusName,
  { etiqueta: string; variante: 'success' | 'error' | 'warning'; descripcion: string }
> = {
  ACTIVE: {
    etiqueta: 'Activa',
    variante: 'success',
    descripcion: 'Puede entrar y trabajar con normalidad.',
  },
  SUSPENDED: {
    etiqueta: 'Suspendida',
    variante: 'error',
    descripcion: 'No puede entrar. Es reversible.',
  },
  INACTIVE: {
    etiqueta: 'De baja',
    variante: 'warning',
    descripcion: 'No puede entrar. Se usa para bajas, no como sanción.',
  },
};

/**
 * Cómo se llama en pantalla cada estado de proyecto.
 *
 * `DELETED` dice **«Archivado»**, no «Borrado», y no es un eufemismo: el proyecto
 * sigue entero, con sus tableros y sus tareas, y vuelve con un clic. Llamarlo
 * borrado haría creer a quien administra que está destruyendo trabajo —y a quien
 * lea el registro, que ya no hay nada que recuperar—. El borrado de verdad existe,
 * es del dueño, y este panel no lo ofrece.
 */
export const ESTADOS_PROYECTO: Record<
  ProjectStatusName,
  { etiqueta: string; variante: 'success' | 'error' | 'warning'; descripcion: string }
> = {
  ACTIVE: {
    etiqueta: 'Activo',
    variante: 'success',
    descripcion: 'Funciona con normalidad.',
  },
  SUSPENDED: {
    etiqueta: 'Suspendido',
    variante: 'error',
    descripcion: 'Se ve entero y no se puede modificar nada. Es reversible.',
  },
  DELETED: {
    etiqueta: 'Archivado',
    variante: 'warning',
    descripcion: 'Retirado de la vista de todos menos de este panel. Es reversible.',
  },
};

/** Los roles globales, con lo que significa cada uno para quien administra. */
export const ROLES: Record<GlobalRoleName, { etiqueta: string; descripcion: string }> = {
  SuperAdmin: {
    etiqueta: 'SuperAdmin',
    descripcion: 'Administra la plataforma, incluidos los demás administradores.',
  },
  Admin: {
    etiqueta: 'Admin',
    descripcion: 'Administra la plataforma. No puede tocar a otros administradores.',
  },
  User: {
    etiqueta: 'User',
    descripcion: 'Trabaja en sus proyectos. Sin acceso a este panel.',
  },
};

/**
 * Cada acción del registro, contada en una frase.
 *
 * En pasado y con sujeto implícito, porque la fila ya dice quién: «Suspendió la
 * cuenta» se lee del tirón junto al nombre del actor. Un `USER_SUSPENDED` en
 * mayúsculas obliga a traducir mentalmente en cada línea.
 */
export const ACCIONES: Record<
  AdminActionName,
  { etiqueta: string; variante: 'success' | 'error' | 'warning' | 'info' | 'primary' }
> = {
  USER_SUSPENDED: { etiqueta: 'Suspendió la cuenta', variante: 'error' },
  USER_REACTIVATED: { etiqueta: 'Reactivó la cuenta', variante: 'success' },
  USER_DEACTIVATED: { etiqueta: 'Dio de baja la cuenta', variante: 'warning' },
  ROLE_GRANTED: { etiqueta: 'Subió el rol', variante: 'info' },
  ROLE_REVOKED: { etiqueta: 'Bajó el rol', variante: 'primary' },
  PROJECT_SUSPENDED: { etiqueta: 'Suspendió el proyecto', variante: 'error' },
  PROJECT_REACTIVATED: { etiqueta: 'Reactivó el proyecto', variante: 'success' },
  PROJECT_ARCHIVED: { etiqueta: 'Archivó el proyecto', variante: 'warning' },
  PROJECT_RESTORED: { etiqueta: 'Recuperó el proyecto', variante: 'success' },
};

/** `4 ago 2026, 14:18` — fecha y hora, que en un registro hace falta. */
export function fechaYHora(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Nombre completo, o el correo si la cuenta aún no tiene nombre. */
export function nombreDe(usuario: AdminUser): string {
  const nombre = [usuario.firstName, usuario.lastName]
    .map((parte) => parte?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
  return nombre || usuario.credential.email;
}
