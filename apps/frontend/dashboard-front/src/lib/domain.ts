/**
 * Formas reales que devuelve el gateway, verificadas con curl contra el stack
 * levantado. No son los DTO de `@praxis/contracts`: esos describen la entrada
 * y en algún caso mienten sobre la salida (ver PENDIENTES-BACKEND.md §10).
 */

/** `GET /api/users/:id` */
export interface UserProfile {
  id: string;
  credentialId: string;
  /** Vacío en cuentas nuevas: `POST /auth/register` no pide nombre. */
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  credential: { email: string };
}

/** `GET /api/permissions/user/:id` — roles globales (Admin / User) */
export interface GlobalRole {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

/** Un elemento de `GET /api/projects` → `{ items, total }` */
export interface Project {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  /** Contadores que el backend ya agrega: nos ahorran peticiones extra. */
  _count: {
    members: number;
    workspaces: number;
  };
}

/**
 * Nombre para mostrar, o cadena vacía si el perfil aún no lo tiene.
 *
 * El registro no pide nombre ni apellido, así que **en una cuenta recién
 * creada esto es normal, no un caso raro**. Quien llame decide el saludo
 * alternativo.
 */
export function displayName(user: UserProfile): string {
  return [user.firstName, user.lastName]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
}
