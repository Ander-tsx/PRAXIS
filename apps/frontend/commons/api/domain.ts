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

/** Los doce permisos de proyecto. Espejo del enum `ProjectPermission`. */
export const PROJECT_PERMISSIONS = [
  'canViewProject',
  'canCreateTask',
  'canEditTask',
  'canDeleteTask',
  'canCreateBoard',
  'canEditBoard',
  'canDeleteBoard',
  'canCreateColumn',
  'canEditColumn',
  'canDeleteColumn',
  'canManageMembers',
  'canManageRoles',
] as const;

export type ProjectPermission = (typeof PROJECT_PERMISSIONS)[number];

/**
 * Mapa de permisos de un rol.
 *
 * ⚠️ Es un **diccionario**, nunca un array. El backend lo valida desde que
 * mandar un array creaba un rol vacío con 201, sin error en ningún punto.
 */
export type PermissionMap = Partial<Record<ProjectPermission, boolean>>;

/**
 * Permisos que un permiso concede por jerarquía.
 *
 * El backend los expande al evaluar, así que **no hace falta guardarlos**. Pero
 * el formulario de roles tiene que enseñarlos: marcar "eliminar" da también
 * "editar" y "crear", y sin decirlo el usuario cree que concede menos.
 */
export const PERMISSION_IMPLIES: Partial<Record<ProjectPermission, ProjectPermission[]>> = {
  canDeleteBoard: ['canEditBoard', 'canCreateBoard'],
  canEditBoard: ['canCreateBoard'],
  canDeleteColumn: ['canEditColumn', 'canCreateColumn'],
  canEditColumn: ['canCreateColumn'],
  canDeleteTask: ['canEditTask', 'canCreateTask'],
  canEditTask: ['canCreateTask'],
};

/** `GET /api/projects/:projectId/roles` viene embebido en el detalle. */
export interface ProjectRole {
  id: string;
  name: string;
  projectId: string;
  permissions: PermissionMap;
}

/** `GET /api/projects/:projectId/members` */
export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  projectRoleId: string;
  joinedAt: string;
  projectRole: ProjectRole;
}

export interface Column {
  id: string;
  name: string;
  order: number;
  boardId: string;
}

export interface Board {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: string;
  columns: Column[];
}

export interface Workspace {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  /** `GET /projects/:id` los trae embebidos, con sus columnas. */
  boards: Board[];
}

/** `GET /api/projects/:id` — trae espacios y roles embebidos. */
export interface ProjectDetail extends Project {
  workspaces: Workspace[];
  roles: ProjectRole[];
}

/** `GET /api/projects/:projectId/permissions/me` */
export interface EffectivePermissions {
  isOwner: boolean;
  /** Mapa completo: los no concedidos vienen en `false`, no ausentes. */
  permissions: Record<ProjectPermission, boolean>;
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

/**
 * Etiqueta para una persona, siempre con algo que leer.
 *
 * Cuando no hay nombre —el caso normal en cuentas nuevas, porque el registro no
 * lo pide— cae a la parte local del correo. Sin esto, las filas de un listado
 * quedaban de dos alturas distintas según la cuenta tuviera nombre o no.
 */
export function personLabel(user: UserProfile): string {
  const name = displayName(user);
  if (name) return name;
  return user.credential.email.split('@')[0] ?? user.credential.email;
}
