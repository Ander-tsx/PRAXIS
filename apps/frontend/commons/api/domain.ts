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

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Etiqueta y color de cada prioridad, para no repetirlos en cada pantalla. */
export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

/**
 * Colores que puede tomar una etiqueta.
 *
 * Son **tokens del design system**, no hex libres: así las etiquetas siguen el
 * tema. Espejo de `LABEL_COLORS` en `@praxis/contracts`.
 */
export const LABEL_COLORS = ['primary', 'accent', 'success', 'warning', 'error', 'info'] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export const LABEL_COLOR_LABELS: Record<LabelColor, string> = {
  primary: 'Violeta',
  accent: 'Ámbar',
  success: 'Verde',
  warning: 'Amarillo',
  error: 'Rojo',
  info: 'Azul',
};

/**
 * Etiqueta de un proyecto.
 *
 * Es del **proyecto**, no del tablero: la misma etiqueta vale para todos sus
 * tableros.
 */
export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: LabelColor;
  createdAt: string;
}

/** Une una tarea con una etiqueta. Llega con la etiqueta entera embebida. */
export interface TaskLabel {
  taskId: string;
  labelId: string;
  label: Label;
}

/** Un encargado de una tarea. Son ids: tasks-service no conoce a los usuarios. */
export interface TaskAssignee {
  id: string;
  taskId: string;
  userId: string;
  assignedBy: string;
  assignedAt: string;
}

export interface ChecklistItem {
  id: string;
  taskId: string;
  text: string;
  completed: boolean;
  order: number;
}

/**
 * Una tarea.
 *
 * ⚠️ `status` es un **string que debe igualar el nombre de una columna** del
 * tablero, no un enum. Al mover una tarea hay que mandar `columnId` y `status`
 * coherentes, así que quien mueva necesita la correspondencia nombre ↔ id.
 *
 * Las cinco rutas que devuelven tareas traen la misma forma: `assignees`,
 * `subtasks` y `checklists` vienen siempre, también en el listado del tablero.
 */
export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  boardId: string;
  columnId: string;
  reporterId: string;
  projectId: string;
  parentTaskId: string | null;
  dueDate: string | null;
  priority: Priority;
  order: number;
  createdAt: string;
  updatedAt: string;
  assignees: TaskAssignee[];
  checklists: ChecklistItem[];
  labels: TaskLabel[];
  subtasks: Task[];
}

/** Cuántos ítems del checklist están hechos. `total` 0 significa que no hay. */
export function checklistProgress(task: Task): { done: number; total: number } {
  return {
    done: task.checklists.filter((item) => item.completed).length,
    total: task.checklists.length,
  };
}

/**
 * Estado de una fecha límite respecto a ahora.
 *
 * Vencido y «vence pronto» son avisos **distintos** y no se mezclan en un
 * contador único: uno es un problema y el otro una advertencia.
 */
export type DueState = 'none' | 'overdue' | 'soon' | 'later';

/** Días a partir de los cuales una fecha deja de considerarse próxima. */
export const DUE_SOON_DAYS = 7;

export function dueState(dueDate: string | null, now: Date = new Date()): DueState {
  if (!dueDate) return 'none';
  const due = new Date(dueDate);
  if (due.getTime() < now.getTime()) return 'overdue';
  const days = (due.getTime() - now.getTime()) / 86_400_000;
  return days <= DUE_SOON_DAYS ? 'soon' : 'later';
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

/**
 * Invitación a un proyecto.
 *
 * Mientras está `PENDING` **no hay membresía**: quien la recibe no tiene
 * permisos ni ve el proyecto en su lista. El `ProjectMember` se crea al
 * aceptar.
 */
export interface ProjectInvitation {
  id: string;
  projectId: string;
  userId: string;
  projectRoleId: string;
  invitedBy: string;
  status: InvitationStatus;
  createdAt: string;
  respondedAt: string | null;
  projectRole: ProjectRole;
}

/** `GET /api/me/invitations` trae además el proyecto, para poder nombrarlo. */
export interface MyInvitation extends ProjectInvitation {
  project: Pick<Project, 'id' | 'name' | 'description' | 'ownerId'>;
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
