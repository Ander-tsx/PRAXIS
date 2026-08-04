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

/** `GET /api/permissions/user/:id` — roles globales de la plataforma */
export interface GlobalRole {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

/**
 * Los tres roles globales, espejo de `GLOBAL_ROLES` en `@praxis/contracts`.
 *
 * Está copiado porque `@praxis/contracts` es un paquete de backend —arrastra
 * `class-validator` y `@nestjs/swagger`— y el frontend no lo consume. Es el mismo
 * trato que `PROJECT_PERMISSIONS` y `COLUMN_COLORS`: espejo declarado, con el
 * original nombrado al lado.
 *
 * ⚠️ El orden es la jerarquía: `SuperAdmin > Admin > User`. Y el rol global es
 * **privado**: no se enseña en el directorio de usuarios ni en la lista de
 * miembros de un proyecto. Cada quien ve el suyo, y el panel ve los de todos.
 */
export const GLOBAL_ROLES = ['SuperAdmin', 'Admin', 'User'] as const;

export type GlobalRoleName = (typeof GLOBAL_ROLES)[number];

/**
 * ¿Estos roles dan acceso al panel de administración?
 *
 * Es la única pregunta que el frontend necesita hacerse sobre la jerarquía, y
 * por eso es una función y no una comparación suelta: `role === 'Admin'` —que es
 * lo que había en los dos sitios que pintan la insignia— **deja fuera al
 * SuperAdmin**, así que el nivel más alto se pintaba como un usuario corriente.
 *
 * Quien manda de verdad es el gateway. Esto solo decide qué se enseña.
 */
export function hasAdminRole(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => name === 'SuperAdmin' || name === 'Admin');
}

/** Un elemento de `GET /api/projects` → `{ items, total }` */
export interface Project {
  id: string;
  name: string;
  /**
   * El identificador legible de la URL: `/projects/rediseno-del-panel`.
   *
   * **Para enlazar se usa esto; para llamar a la API, `id`.** La ruta del
   * gateway acepta las dos formas, pero solo en `GET /projects/:id`: todo lo
   * que cuelga (`/projects/:projectId/members`, las tareas, los informes)
   * espera el UUID. Por eso las pantallas resuelven el proyecto una vez y a
   * partir de ahí trabajan con `project.id`.
   *
   * Cambia al renombrar el proyecto. Los enlaces con el UUID no caducan nunca.
   */
  slug: string;
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

/** Los permisos de proyecto. Espejo del enum `ProjectPermission`. */
export const PROJECT_PERMISSIONS = [
  'canViewProject',
  'canCreateTask',
  'canMoveTask',
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
  'canComment',
  'canManageLabels',
  'canEditProject',
  'canViewReports',
  'canDeleteProject',
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
  canDeleteBoard: ['canEditBoard', 'canCreateBoard', 'canEditProject'],
  canEditBoard: ['canCreateBoard', 'canEditProject'],
  canEditProject: ['canViewReports'],
  canManageMembers: ['canViewReports'],
  canDeleteColumn: ['canEditColumn', 'canCreateColumn'],
  canEditColumn: ['canCreateColumn'],
  canDeleteTask: ['canEditTask', 'canMoveTask', 'canComment', 'canCreateTask'],
  canEditTask: ['canMoveTask', 'canComment', 'canCreateTask'],
  canDeleteProject: [
    'canDeleteBoard',
    'canEditBoard',
    'canCreateBoard',
    'canEditProject',
    'canViewReports',
  ],
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

/**
 * Colores que puede tomar una columna.
 *
 * Tokens del design system, como en las etiquetas. Espejo de `COLUMN_COLORS` en
 * `@praxis/contracts`, **incluido el orden**: el verde va el último porque
 * significa «columna de cierre» (ver `DONE_COLUMN_COLOR`). El backend reparte
 * por posición solo los cuatro primeros; verde y rojo se eligen a mano.
 */
export const COLUMN_COLORS = ['primary', 'accent', 'info', 'warning', 'error', 'success'] as const;
export type ColumnColor = (typeof COLUMN_COLORS)[number];

/**
 * El verde marca la **columna de cierre**: las tareas que llegan ahí dejan de
 * contar como pendientes en el panel.
 *
 * Va el último de la lista a propósito, porque es el único que significa algo
 * además de pintar. Espejo de `DONE_COLUMN_COLOR` en `@praxis/contracts`.
 */
export const DONE_COLUMN_COLOR: ColumnColor = 'success';

export const COLUMN_COLOR_LABELS: Record<ColumnColor, string> = {
  primary: 'Violeta',
  accent: 'Ámbar',
  info: 'Azul',
  warning: 'Amarillo',
  error: 'Rojo',
  success: 'Verde — columna de cierre',
};

export interface Column {
  id: string;
  name: string;
  order: number;
  /** Token del design system, no un hex. Viaja con la columna al reordenar. */
  color: ColumnColor;
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

/**
 * Comentario en una tarea.
 *
 * `editedAt` es `null` mientras no se haya tocado el texto: solo se marca
 * cuando cambia de verdad, no cada vez que la fila se actualiza.
 */
export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
}

/** Tope por archivo, espejo de `ATTACHMENT_MAX_BYTES` en el backend. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Tipos admitidos: **solo PDF**. Espejo del backend, que además comprueba la
 * firma del archivo y no solo lo que declare el navegador.
 */
export const ATTACHMENT_ALLOWED_MIME = ['application/pdf'] as const;

/**
 * Archivo adjunto a una tarea. **Sin los bytes**: viven en otra tabla y solo
 * se leen en la ruta de descarga.
 */
export interface TaskAttachment {
  id: string;
  taskId: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
}

/** ¿Se puede previsualizar como imagen? Solo rasterizadas; el SVG ni se admite. */
export function isPreviewableImage(mimeType: string): boolean {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType);
}

/**
 * ¿Se puede abrir en el visor de la propia página?
 *
 * Solo el PDF. El backend lo sirve con `Content-Disposition: inline` y con
 * `Content-Security-Policy: sandbox`, que es lo que permite meterlo en un
 * `<iframe>` sin darle acceso a la sesión.
 */
export function isViewablePdf(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

/** `1536000` → `1,5 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
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
 *
 * ⚠️ `subtasks` y `parentTaskId` están declarados porque **el backend los manda**,
 * no porque los usemos: decidimos no exponer subtareas (ESTADO-ACTUAL §24.5). En
 * la práctica `subtasks` llega siempre vacío. Quitarlos del tipo obligaría a
 * mentir sobre la forma de la respuesta.
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
  /** Del más antiguo al más nuevo. Vienen con la tarea, también en el listado. */
  comments: TaskComment[];
  /** Metadatos de los adjuntos. Los bytes se piden aparte al descargar. */
  attachments: TaskAttachment[];
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
  /** Con `slug`: la puerta de invitación compara contra el parámetro de la URL. */
  project: Pick<Project, 'id' | 'slug' | 'name' | 'description' | 'ownerId'>;
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

/**
 * Tipos de aviso. Espejo de `NotificationType` en `@praxis/contracts`.
 *
 * Todos describen **algo que ya pasó**. Las invitaciones sin responder no están
 * aquí: siguen en su propia tabla y el panel las enseña aparte porque esperan
 * una decisión, no una lectura.
 */
export const NOTIFICATION_TYPES = [
  'INVITATION_RECEIVED',
  'INVITATION_ACCEPTED',
  'INVITATION_REJECTED',
  'MEMBER_LEFT',
  'MEMBER_REMOVED',
  'TASK_ASSIGNED',
  'TASK_UNASSIGNED',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Un aviso.
 *
 * `projectName` y `taskTitle` son **copias del momento**, no referencias: el
 * aviso sobrevive al borrado del proyecto o la tarea de los que habla, y por eso
 * se pintan tal cual en vez de resolverse contra nada.
 *
 * `actorId` es un id: el nombre lo resuelve la pantalla contra el directorio,
 * igual que en encargados y comentarios.
 */
export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  actorId: string | null;
  projectId: string | null;
  projectName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  /** `null` mientras no se haya leído. */
  readAt: string | null;
  createdAt: string;
}

/** Lo que devuelve `GET /api/me/notifications`. */
export interface NotificationPage {
  items: AppNotification[];
  total: number;
  /** No leídas en total, **sin recortar por `limit`**: es lo que pinta la insignia. */
  unread: number;
}
