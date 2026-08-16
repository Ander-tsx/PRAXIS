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

/** Estados de una cuenta. Espejo de `UserStatus` en `@praxis/contracts`. */
export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'INACTIVE'] as const;

export type UserStatusName = (typeof USER_STATUSES)[number];

/**
 * Una fila de `GET /api/admin/users`.
 *
 * No es `UserProfile`: **este listado enseña dos cosas que el directorio no**, el
 * estado de la cuenta y el rol global, y por eso es otra ruta detrás del rol de
 * administrador en vez de un campo más de `GET /users`.
 */
/**
 * Planes del asistente y lo que da cada uno al mes.
 *
 * Espejo de `ASSISTANT_LIMITS` en `@praxis/contracts`. El gratuito da para
 * probarlo, no para trabajar: cada pregunta cuesta una llamada real a Gemini.
 */
export const ASSISTANT_PLAN_LIMITS = {
  FREE: 5,
  PRO: 250,
} as const;

export type AssistantPlanName = keyof typeof ASSISTANT_PLAN_LIMITS;

export const ASSISTANT_PLANS = Object.keys(ASSISTANT_PLAN_LIMITS) as AssistantPlanName[];

export interface AdminUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  status: UserStatusName;
  createdAt: string;
  credential: { email: string };
  /** El rol efectivo. `User` cuando la cuenta no tiene ninguna fila de rol. */
  globalRole: GlobalRoleName;
  /** Los roles tal cual. Vacío en la mayoría de las cuentas reales. */
  globalRoles: string[];
  /**
   * Plan del asistente. `FREE` cuando la cuenta no tiene suscripción.
   *
   * No hay pasarela de pago: PRO se concede desde este mismo panel.
   */
  assistantPlan: AssistantPlanName;
}

/** Acciones que registra el panel. Espejo de `AdminActionType`. */
export const ADMIN_ACTIONS = [
  'USER_SUSPENDED',
  'USER_REACTIVATED',
  'USER_DEACTIVATED',
  'ROLE_GRANTED',
  'ROLE_REVOKED',
  'PROJECT_SUSPENDED',
  'PROJECT_REACTIVATED',
  'PROJECT_ARCHIVED',
  'PROJECT_RESTORED',
  'ASSISTANT_PLAN_CHANGED',
] as const;

export type AdminActionName = (typeof ADMIN_ACTIONS)[number];

/**
 * Una entrada de `GET /api/admin/activity`.
 *
 * `actorLabel` y `targetLabel` son **copias del momento**, no referencias: por eso
 * la entrada sigue leyéndose cuando la cuenta o el proyecto ya no existen. Igual
 * que `projectName` en los avisos.
 */
export interface AdminActivityEntry {
  id: string;
  actorId: string;
  actorLabel: string | null;
  action: AdminActionName;
  targetType: 'USER' | 'PROJECT';
  targetId: string;
  targetLabel: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

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

/**
 * El nivel de estos roles: el más alto de los que haya.
 *
 * Espejo de `globalRoleLevel` en `@praxis/contracts`, con las mismas dos reglas
 * que allí y por las mismas razones:
 *
 * - **una lista vacía es `User`**, no «sin nivel»: `POST /auth/register` no
 *   asigna ningún rol, así que la mayoría de las cuentas reales no tienen
 *   ninguno;
 * - **los nombres desconocidos se ignoran**, para que un rol inventado en la
 *   tabla no suba a nadie de nivel.
 *
 * Lo usa el panel para **apagar** lo que el gateway va a rechazar: nada sobre tu
 * propia cuenta, nada sobre una de nivel igual o superior. Es cortesía, no
 * autorización: quien decide es el gateway.
 */
export function globalRoleLevelOf(roleNames: readonly string[]): number {
  const NIVELES: Record<GlobalRoleName, number> = { User: 0, Admin: 1, SuperAdmin: 2 };

  return roleNames.reduce(
    (nivel, name) => (name in NIVELES ? Math.max(nivel, NIVELES[name as GlobalRoleName]) : nivel),
    0,
  );
}

/**
 * Estado administrativo de un proyecto. Espejo de `ProjectStatus`.
 *
 * ⚠️ `DELETED` **no es** un proyecto borrado. `DELETE /projects/:id` existe, es del
 * dueño, cascadea y no tiene vuelta atrás; esto es un estado que pone y quita la
 * administración de la plataforma, y se deshace. Un proyecto en `DELETED` no
 * aparece en ningún listado salvo en el panel.
 */
export const PROJECT_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;

export type ProjectStatusName = (typeof PROJECT_STATUSES)[number];

/**
 * El `code` con el que el gateway distingue «este proyecto está suspendido» de «no
 * tienes permiso».
 *
 * Los dos son 403 y **no se arreglan igual**: uno se resuelve pidiéndole permiso a
 * quien administra el proyecto, el otro no se resuelve —hay que esperar a que la
 * plataforma lo reactive—. Sin mirar el código, la pantalla enseña «acceso
 * denegado» en los dos casos y el dueño de un proyecto suspendido se pone a
 * pedirse permisos a sí mismo.
 */
export const PROJECT_SUSPENDED_CODE = 'PROJECT_SUSPENDED';

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
  /**
   * Estado administrativo.
   *
   * Un proyecto `SUSPENDED` **sigue apareciendo aquí**: el dueño y los miembros lo
   * ven entero y no pueden tocar nada. Esconderlo lo haría indistinguible de uno
   * borrado y nadie sabría a quién preguntar. Los `DELETED` no llegan nunca a esta
   * lista, así que en la práctica solo se ven los dos primeros valores.
   */
  status: ProjectStatusName;
  /** Por qué se suspendió. Es lo que se le enseña al dueño. `null` si está activo. */
  suspendedReason?: string | null;
  suspendedAt?: string | null;
  /** Contadores que el backend ya agrega: nos ahorran peticiones extra. */
  _count: {
    members: number;
    workspaces: number;
  };
}

/**
 * Una fila de `GET /api/admin/projects`.
 *
 * Es `Project` más lo único que el panel ve y las pantallas de negocio no: los
 * archivados. La ruta es otra —no un parámetro de `GET /projects`— porque aquella
 * filtra por dueño o miembro, y añadirle una forma de ver todos sería poner un
 * interruptor de bypass en la ruta que usa cualquiera.
 *
 * Trae además el **dueño resuelto**, que las rutas de negocio no dan: allí basta el
 * `ownerId` porque la pantalla ya sabe de quién es el proyecto, y aquí «de quién es»
 * es la primera pregunta al decidir si se suspende. Lo cruza el gateway con una sola
 * llamada a credentials por página.
 *
 * ⚠️ **No trae `suspendedBy`.** El id de quien administra no sale por ninguna ruta:
 * el rol global es privado, y devolverlo diría qué cuenta es administradora. Quién
 * actuó se lee en el registro de actividad, que ya es admin-only.
 */
export interface AdminProject extends Project {
  /**
   * Nombre y correo del dueño. `null` si credentials no respondió: el inventario
   * sale sin nombres antes que no salir, porque sirve igual para suspender.
   */
  owner?: { id: string; name: string | null; email: string | null } | null;
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
 * Etiquetas legibles de cada permiso.
 *
 * Sube a commons porque ahora las necesitan **dos** sitios: el formulario de
 * roles de `projects-front`, que las tuvo siempre, y la vista previa de la
 * plantilla del asistente, que vive en `commons/organisms` y la montan dos
 * zonas. Enseñar «3 permisos» en vez de cuáles obligaba a crear el proyecto
 * para descubrir qué se estaba repartiendo.
 */
export const PERMISSION_LABELS: Record<ProjectPermission, string> = {
  canViewProject: 'Ver el proyecto',
  canCreateBoard: 'Crear tableros',
  canEditBoard: 'Editar tableros',
  canDeleteBoard: 'Eliminar tableros',
  canCreateColumn: 'Crear columnas',
  canEditColumn: 'Editar columnas',
  canDeleteColumn: 'Eliminar columnas',
  canCreateTask: 'Crear tareas',
  canMoveTask: 'Mover tareas y marcar pasos del checklist',
  canEditTask: 'Editar tareas',
  canDeleteTask: 'Eliminar tareas',
  canManageMembers: 'Gestionar el equipo',
  canManageRoles: 'Gestionar los roles',
  canComment: 'Comentar en las tareas',
  canManageLabels: 'Gestionar las etiquetas',
  canEditProject: 'Renombrar el proyecto y cambiar su descripción',
  canViewReports: 'Ver los reportes y usar el asistente',
  canDeleteProject: 'Eliminar el proyecto',
};

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
 * Tope por archivo en el chat, espejo de `CHAT_ATTACHMENT_MAX_BYTES`.
 *
 * El doble que el de tareas: un vídeo en calidad de móvil ronda los 15–40 MB.
 */
export const CHAT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

/** Cuántos archivos puede llevar un mensaje. Espejo del backend. */
export const CHAT_ATTACHMENT_MAX_PER_MESSAGE = 5;

/**
 * Tipos admitidos en el chat, espejo del backend.
 *
 * Imágenes, vídeo, PDF, texto, ZIP y Office — la lista vieja de tareas más el
 * vídeo. El SVG **no entra**: es XML con scripts, y servirlo desde el mismo
 * origen que la aplicación sería XSS.
 */
export const CHAT_ATTACHMENT_ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'text/plain',
  'text/csv',
  /* ⚠️ **Markdown va con sus dos tipos, y no sobra ninguno.** Chrome declara
     un `.md` como `text/markdown`, pero Safari y algunos Linux lo mandan como
     `text/x-markdown`, y hay sistemas donde llega vacío —ahí no hay nada que
     hacer desde aquí—. Con solo el primero, el mismo archivo entraba en un
     navegador y lo rechazaba otro. */
  'text/markdown',
  'text/x-markdown',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

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
  /**
   * Mapa completo: los no concedidos vienen en `false`, no ausentes.
   *
   * ⚠️ **En un proyecto suspendido llega ya recortado a solo lectura**, y al dueño
   * también. Eso significa que una pantalla no necesita mirar el estado para dejar
   * de enseñar botones — pero sí para **explicarlo**: un mapa vacío sin motivo
   * parece que te han quitado el rol. Para eso están los dos campos de abajo.
   */
  permissions: Record<ProjectPermission, boolean>;
  /** Estado del proyecto. Es lo que justifica un mapa recortado. */
  projectStatus?: ProjectStatusName;
  /** Por qué se suspendió, tal como lo escribió quien administra. */
  suspendedReason?: string | null;
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

/**
 * El `type` con el que viaja un mensaje de chat por el flujo de avisos.
 *
 * ⚠️ **No está en `NOTIFICATION_TYPES` y no debe estarlo.** Esa lista es espejo
 * del enum de la tabla `notifications`, y un mensaje de chat **no crea fila**:
 * una conversación de cincuenta mensajes serían cincuenta avisos por persona y
 * taparían el que importa. Comparte el flujo SSE —que es lo que hace que suene
 * y salga en pantalla estés donde estés— pero no la bandeja.
 *
 * Espejo de `CHAT_EVENT_TYPE` en `projects-service/src/chat/chat.service.ts`.
 */
export const CHAT_EVENT_TYPE = 'CHAT_MESSAGE';

/**
 * Las reacciones que acepta el backend.
 *
 * Lista **cerrada** y espejo de `CHAT_REACTIONS` en `@praxis/contracts`: el
 * emoji viaja en el cuerpo y acaba en la base, así que dejarlo abierto sería un
 * campo más donde meter lo que sea.
 */
export const CHAT_REACTIONS = ['👍', '🎉', '❤️', '👀', '🚀', '😄'] as const;

export type ChatReactionEmoji = (typeof CHAT_REACTIONS)[number];

export interface ChatReaction {
  messageId: string;
  userId: string;
  emoji: string;
}

/**
 * Un mensaje de chat, de proyecto o privado.
 *
 * ⚠️ **Las menciones y las referencias viven dentro de `body`**, con el nombre
 * incluido: `@[Juan Pérez](user:2222…)`. Es lo que hace que no se rompan — si
 * sacan a Juan del equipo, el nombre ya está escrito y se pinta como texto
 * plano, sin consultar nada.
 */
export interface ChatMessage {
  id: string;
  channelId: string;
  /** Quién lo escribió. El nombre lo resuelve la pantalla contra el directorio. */
  authorId: string;
  body: string;
  createdAt: string;
  /** `null` mientras no se ha reescrito. Para la marca «editado». */
  editedAt: string | null;
  /** `null` mientras no está fijado. Para la marca y la lista de anclados. */
  pinnedAt: string | null;
  /** Quién lo fijó, para el «fijado por» de la marca. */
  pinnedById: string | null;
  /**
   * A qué mensaje responde, con lo justo para pintar la cita.
   *
   * `attachments` solo trae el `mimeType`, del primero si hay varios: la cita
   * no enseña el archivo, solo dice qué es cuando el mensaje citado no tiene
   * texto — «📷 Imagen» en vez de un hueco vacío.
   */
  replyTo: {
    id: string;
    authorId: string;
    body: string;
    attachments: { mimeType: string }[];
  } | null;
  /** Cuántas respuestas tiene su hilo. Para la marca «N respuestas». */
  _count: { replies: number };
  reactions: ChatReaction[];
  /** Archivos que viajan con el mensaje, sin bytes: ver `ChatAttachment`. */
  attachments: ChatAttachment[];
}

/**
 * Un archivo compartido en el chat.
 *
 * Los metadatos viajan con el mensaje; los bytes se piden aparte con
 * `chatAttachmentHref` cuando toca pintarlos.
 *
 * ⚠️ **Los nombres de archivo no se interpolan nunca en HTML.** Son datos del
 * usuario en el origen de la página: se pintan con React, que los escapa.
 */
export interface ChatAttachment {
  id: string;
  channelId: string;
  /** `null` mientras es un borrador sin mensaje; al enviarlo queda fijado. */
  messageId: string | null;
  filename: string;
  mimeType: string;
  /** En bytes. Lo usa la tarjeta para abreviar «2,4 MB». */
  size: number;
  /** Quién lo subió. Para el «lo borra su autor». */
  uploadedBy: string;
  createdAt: string;
}

/** Lo que devuelve la lista de mensajes, de proyecto o privada. */
export interface ChatMessagePage {
  /** Del más antiguo al más nuevo, que es como se pinta una conversación. */
  items: ChatMessage[];
  /** Queda historial por encima. Lo usa el botón de «ver mensajes anteriores». */
  hasMore: boolean;
  /** Sin leer de esta persona en este canal. Es lo que pinta la insignia. */
  unread: number;
  /**
   * Si esta persona silenció el canal.
   *
   * ⚠️ Silenciar **no deja de contar lo no leído**: la insignia sigue. Lo que se
   * apaga es la tarjeta y el sonido.
   */
  muted: boolean;
}

/** Una conversación privada en la bandeja de `/me/chats`. */
export interface DirectConversation {
  channelId: string;
  /** Con quién hablas. El perfil se resuelve contra el directorio. */
  peerId: string;
  ultimo: { body: string; authorId: string; createdAt: string } | null;
  unread: number;
  muted: boolean;
}

/**
 * Alguien a quien puedes escribir, con **dónde coincidís y qué es allí**.
 *
 * El rol es por proyecto, no global: la misma persona puede ser quien administra
 * en uno y solo mirar en otro. Enseñar un único rol sería inventarse una
 * jerarquía que no existe.
 */
export interface ChatContact {
  userId: string;
  proyectos: { id: string; name: string; slug: string; rol: string }[];
}

/* ─── La plantilla de arranque que propone el asistente ─────────────── */

/**
 * Lo que devuelve `POST /me/assistant/project-draft`.
 *
 * Espejo de `PlantillaDeProyecto` en `@praxis/contracts`. Está copiado por lo
 * mismo que el resto de este archivo: aquel es un paquete de backend y arrastra
 * `class-validator` y los decoradores de Nest, que no pintan nada en el
 * navegador.
 *
 * ⚠️ **Esto no es un proyecto: es una propuesta.** No existe hasta que alguien
 * la acepta, y aceptarla son N llamadas a los endpoints que ya usa cada
 * formulario —`POST /projects`, `/workspaces`, `/boards`, `/columns`,
 * `/labels`, `/roles`—, con la sesión de quien pulsa. Es la regla de §26.1: la
 * IA propone; ejecuta el código que ya existe. Ninguno de estos objetos lleva
 * `id` porque nada de esto existe todavía.
 */
export interface PlantillaEtiqueta {
  nombre: string;
  color: LabelColor;
}

export interface PlantillaRol {
  nombre: string;
  /** Diccionario de booleanos, nunca un array. Trampa 8 de CLAUDE.md. */
  permisos: PermissionMap;
}

export interface PlantillaColumna {
  nombre: string;
  /**
   * ⚠️ `success` **no es un color, es un significado**: marca la columna de
   * cierre y una tarea que entra ahí se da por terminada. El backend ya se
   * encarga de que solo la última lo lleve.
   */
  color?: ColumnColor;
}

export interface PlantillaTablero {
  nombre: string;
  columnas: PlantillaColumna[];
}

export interface PlantillaEspacio {
  nombre: string;
  tableros: PlantillaTablero[];
}

export interface PlantillaDeProyecto {
  nombre: string;
  descripcion: string;
  etiquetas: PlantillaEtiqueta[];
  roles: PlantillaRol[];
  espacios: PlantillaEspacio[];
  /** Por qué esta estructura y no otra. Lo pinta la pantalla junto al plan. */
  porQue: string;
}

/** El contador que acompaña al borrador, para pintarlo como hace el chat. */
export interface PlantillaCuota {
  plan: string;
  usados: number;
  limite: number;
}

export interface PlantillaDraftResult {
  plantilla: PlantillaDeProyecto;
  cuota: PlantillaCuota;
}

/** Cuánto texto se le pide a quien describe su proyecto. */
export const PLANTILLA_BRIEF_MIN = 20;
export const PLANTILLA_BRIEF_MAX = 4000;

/**
 * Lo que devuelve pedir un borrador. Vive aquí, y no junto a la función que lo
 * produce, porque el diálogo es un componente de cliente y aquella es código de
 * servidor: el tipo tiene que poder cruzar esa frontera.
 */
export interface PlantillaBorradorState {
  resultado: PlantillaDraftResult | null;
  error: string | null;
  /**
   * La cuota se acabó.
   *
   * Se distingue del resto porque **no se arregla reintentando**, y la pantalla
   * tiene que decir otra cosa: con un «vuelve a intentarlo» genérico la gente
   * pulsa el botón otras cinco veces contra un 429.
   */
  sinCuota: boolean;
}

/** Lo que devuelve materializar una plantilla aceptada. */
export interface PlantillaResultado {
  /** El proyecto **sí** se creó, aunque algo posterior fallara. */
  proyecto: { id: string; name: string; slug: string } | null;
  creado: {
    etiquetas: number;
    roles: number;
    espacios: number;
    tableros: number;
    columnas: number;
  };
  /**
   * Lo que no salió, en frases que se puedan enseñar.
   *
   * ⚠️ **No se agrupa ni se resume.** «Hubo 3 errores» no le dice a nadie qué le
   * falta por crear a mano.
   */
  fallos: string[];
  /** Solo cuando no hay proyecto: no se pudo ni empezar. */
  error: string | null;
}

/** Cuánto puede ocupar un retoque sobre un plan ya propuesto. */
export const PLANTILLA_AJUSTE_MAX = 1000;
