/**
 * Formas reales que devuelve el gateway, verificadas con curl contra el stack
 * levantado. No son los DTO de `@praxis/contracts`: esos describen la entrada
 * y en algún caso mienten sobre la salida (ver PENDIENTES-BACKEND.md §10).
 */

import type { QuotaExceededDetails } from '../billing/planes';

/** `GET /api/users/:id` */
export interface UserProfile {
  id: string;
  credentialId: string;
  /** Vacío en cuentas nuevas: `POST /auth/register` no pide nombre. */
  firstName: string | null;
  lastName: string | null;
  /**
   * Ruta **relativa al gateway** de la foto: `/users/<id>/avatar?v=<epoch>`.
   * La zona le antepone su propio proxy — ver `avatarHref`.
   */
  avatarUrl: string | null;
  /** La foto de la cuenta de Google, si entró con Google. Ver `useGoogleAvatarAction`. */
  googleAvatarUrl?: string | null;
  coverUrl: string | null;
  biography: string | null;
  location: string | null;
  professionalInfo?: any;
  /**
   * Estado **administrativo** de la cuenta (`ACTIVE`, `INACTIVE`,
   * `SUSPENDED`), puesto por la plataforma. **No es la presencia**: esa es
   * `presence`, la elige su dueño y no decide nada sobre el acceso.
   */
  status: string;
  /** Lo que dice que está haciendo. Ver `presence.ts`. */
  presence?: string;
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
/*
 * 🕳️ Aquí estaban `ASSISTANT_PLAN_LIMITS`, `AssistantPlanName` y
 * `ASSISTANT_PLANS`: el espejo del catálogo de planes del asistente **por
 * persona** (FREE 13 / PRO 250).
 *
 * 🔴 Era un segundo sistema de planes, anterior a las organizaciones, que se
 * concedía a mano desde el panel de administración. El tope de IA lo decide el
 * plan de la **organización** desde la etapa Enterprise, así que aquello no
 * cambiaba ningún límite — solo la etiqueta que esta pantalla enseñaba, que
 * podía contradecir al tope real.
 *
 * Retirado el 2026-09-03 con su tabla y su ruta. Ver `docs/AUDITORIA-PLANES.md`.
 *
 * ⚠️ El nombre «Pro» **sí existe** hoy: es el peldaño del catálogo de
 * organización entre Gratis y Equipo, y vive donde el resto (`GET
 * /me/billing/planes`). No tiene nada que ver con esto.
 */

export interface AdminUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  /** Ruta de la foto relativa al gateway, como en `UserProfile`. */
  avatarUrl?: string | null;
  /** Presencia elegida. Opcional: el listado de admin puede no traerla. */
  presence?: string;
  status: UserStatusName;
  createdAt: string;
  credential: { email: string };
  /** El rol efectivo. `User` cuando la cuenta no tiene ninguna fila de rol. */
  globalRole: GlobalRoleName;
  /** Los roles tal cual. Vacío en la mayoría de las cuentas reales. */
  globalRoles: string[];
  /*
   * 🕳️ Aquí estaba `assistantPlan`. El gateway ya no lo devuelve: ver el hueco
   * de arriba.
   */
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
  /* Faltaban: el backend los registra desde el borrado definitivo de cuentas y
     proyectos, y aquí salían sin etiqueta. */
  'USER_DELETED',
  'PROJECT_DELETED',
  'ORGANIZATION_PLAN_GRANTED',
  'ORGANIZATION_PLAN_REVOKED',
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
  targetType: 'USER' | 'PROJECT' | 'ORGANIZATION';
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

/**
 * El `code` de «esa persona no tiene asiento en la organización de este
 * proyecto».
 *
 * 🔴 **Tercer 403 que no es de permisos**, y el más fácil de confundir: quien lo
 * recibe suele ser el dueño del proyecto, con todos los permisos, intentando
 * meter a alguien en un equipo que ya está lleno. Enseñarle «no tienes permiso»
 * es decirle una mentira sobre sí mismo y esconderle la única salida que hay
 * —liberar un asiento o ampliar el plan—. Ya pasó: el mensaje del servidor lo
 * explicaba bien y la pantalla lo tiraba.
 */
export const NOT_IN_ORG_CODE = 'NOT_IN_ORG';

/**
 * Los 403 que **se explican solos** y cuyo mensaje no se puede sustituir.
 *
 * ⚠️ **La lista es corta a propósito.** Un 403 normal sí se traduce a una frase
 * de la pantalla: el mensaje del servidor habla de guards y de permisos, y quien
 * lo lee necesita saber a quién pedírselo, no cómo se llama la comprobación. Los
 * de aquí son los que el servidor sabe explicar mejor que nosotros porque
 * conocen el motivo — un plan lleno, una plataforma que suspendió algo.
 */
const CODIGOS_403_QUE_SE_EXPLICAN: readonly string[] = [PROJECT_SUSPENDED_CODE, NOT_IN_ORG_CODE];

/**
 * ¿Este 403 trae su propia explicación?
 *
 * Se usa en los `describe()` de las zonas, que hasta ahora colapsaban **todos**
 * los 403 en una frase de permisos.
 */
export function el403SeExplicaSolo(code: string): boolean {
  return CODIGOS_403_QUE_SE_EXPLICAN.includes(code);
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
  /**
   * Identidad visual, elegida en el modal de configuración del proyecto.
   *
   * `iconKey` es un nombre de icono de `lucide-react` de la lista curada
   * (`commons/atoms/GlyphPicker`); `color`, un `#rrggbb`. `null`/ausente = sin
   * elegir, y `ProjectMonogram` cae a las dos letras sobre el color derivado del
   * `id`. Vienen en `GET /projects` y en `GET /projects/:id`.
   */
  iconKey?: string | null;
  color?: string | null;
  /** Imagen subida (ruta relativa al gateway, con versión). Gana al icono. */
  imageUrl?: string | null;
  /**
   * La organización a la que pertenece. `NOT NULL` en la base desde la etapa de
   * organizaciones.
   *
   * ⚠️ **No es solo informativo: decide a quién se puede invitar.** Quien entra
   * en un proyecto necesita asiento en esta organización (403 `NOT_IN_ORG` si
   * no), así que el buscador de «Invitar al proyecto» ofrece a su gente y no al
   * directorio de la plataforma.
   *
   * Opcional en el tipo porque los listados viejos y algún doble de prueba no lo
   * traen; quien dependa de él tiene que contemplar que falte.
   */
  organizationId?: string;
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
  /**
   * Los **primeros cuatro** miembros, solo sus ids, y solo en `GET /projects`.
   *
   * Es lo que permite pintar las caras del equipo en la rejilla sin pedir
   * `GET /projects/:id/members` una vez por tarjeta. Los nombres y las fotos se
   * resuelven aparte, contra `GET /users?ids=`.
   *
   * ⚠️ **No es el equipo entero, y el total sigue siendo `_count.members`.** Son
   * cuatro porque son las que caben antes del «+N»: contarlos para saber cuánta
   * gente hay daría siempre cuatro como mucho.
   *
   * Opcional porque `GET /projects/:id` —el detalle— no lo trae: ahí los
   * miembros van por su propia ruta, con su rol y su fecha de entrada.
   */
  members?: { userId: string }[];
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
  'canManageAutomations',
  'canManageIntegrations',
  'canComment',
  'canManageLabels',
  'canEditProject',
  'canViewReports',
  'canDeleteProject',
  'canManageSprint',
  'canEditDocuments',
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
  canManageAutomations: 'Gestionar automatizaciones',
  canManageIntegrations: 'Gestionar integraciones',
  canComment: 'Comentar en las tareas',
  canManageLabels: 'Gestionar las etiquetas',
  canEditProject: 'Renombrar el proyecto y cambiar su descripción',
  canViewReports: 'Ver los reportes y usar el asistente',
  canDeleteProject: 'Eliminar el proyecto',
  canManageSprint: 'Planear, iniciar y cerrar sprints',
  canEditDocuments: 'Crear y editar documentos',
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
  canDeleteBoard: ['canEditBoard', 'canCreateBoard', 'canEditProject', 'canManageSprint'],
  canEditBoard: ['canCreateBoard', 'canEditProject', 'canManageSprint'],
  canEditProject: ['canViewReports'],
  canManageMembers: ['canViewReports'],
  canManageRoles: ['canManageAutomations', 'canManageIntegrations'],
  canDeleteColumn: ['canEditColumn', 'canCreateColumn'],
  canEditColumn: ['canCreateColumn'],
  canDeleteTask: ['canEditTask', 'canMoveTask', 'canComment', 'canCreateTask'],
  canEditTask: ['canMoveTask', 'canComment', 'canCreateTask', 'canEditDocuments'],
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
  /** Límite de trabajo en curso, blando: se avisa, no se bloquea. `null` = sin límite. */
  wipLimit: number | null;
}

export interface Board {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: string;
  columns: Column[];
  /**
   * Scrum encendido: además de sus columnas (que todo tablero tiene), trabaja
   * por sprints. Ver `docs/PLAN-SCRUM-KANBAN.md`, D1.
   */
  scrumEnabled: boolean;
}

export type SprintStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED';

/** Un bloque de tiempo de un tablero Scrum. Como mucho uno `ACTIVE` por tablero. */
export interface Sprint {
  id: string;
  boardId: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  /** `null` mientras esté `PLANNED`: las fechas se fijan al iniciarlo. */
  startDate: string | null;
  endDate: string | null;
  /**
   * El instante en que se pulsó «Empezar». `startDate` es una fecha de
   * calendario —medianoche del día elegido—: lo planeado esa mañana quedaría
   * después de ella y contaría como añadido. El burndown compara contra esto.
   */
  startedAt: string | null;
  createdAt: string;
  closedAt: string | null;
  /** Lo que dejó el cierre: la revisión del sprint. `null` hasta cerrarlo. */
  closeSummary?: SprintCloseSummary | null;
}

export interface SprintCloseSummary {
  hechas: number;
  puntosHechos: number;
  alSiguiente: number;
  alBacklog: number;
}

/**
 * Una tarea reducida a lo que necesitan el burndown y la velocidad. Llega de
 * `GET /boards/:id/sprints/metrics`, sin tope de página: la pantalla ya no
 * calcula sobre las cien primeras tareas del tablero.
 */
export interface SprintMetricRow {
  id: string;
  sprintId: string | null;
  sprintAssignedAt: string | null;
  completedAt: string | null;
  estimatePoints: number | null;
}

export interface SprintMetrics {
  /** Los cerrados que entran en la velocidad, del más reciente al más viejo. */
  velocitySprintIds: string[];
  tasks: SprintMetricRow[];
}

/** Una tarea sin terminar de un sprint, tal como la devuelve `/pending`. */
export interface PendingSprintTask {
  id: string;
  title: string;
  columnId: string;
  status: string;
  priority: Priority;
}

/**
 * El 409 de cerrar un sprint con tareas sin resolver. Trae la lista en
 * `details.pending` (D6: cerrar con pendientes siempre pregunta).
 */
export const SPRINT_HAS_PENDING_TASKS_CODE = 'SPRINT_HAS_PENDING_TASKS';

export interface Workspace {
  id: string;
  name: string;
  /** Tableros o documentos, nunca las dos cosas (PLAN-DOCUMENTOS, D7). */
  kind: 'BOARDS' | 'DOCUMENTS';
  projectId: string;
  createdAt: string;
  updatedAt: string;
  /** `GET /projects/:id` los trae embebidos, con sus columnas. */
  boards: Board[];
  /**
   * Los documentos del espacio, **sin contenido** (`docs/PLAN-DOCUMENTOS.md`).
   * Opcional: un backend anterior a los documentos no lo manda.
   */
  documents?: WorkspaceDocumentRef[];
}

/** Lo que trae el árbol del proyecto de cada documento: lo justo para la pestaña. */
export interface WorkspaceDocumentRef {
  id: string;
  title: string;
  workspaceId: string;
  updatedAt: string;
}

/**
 * Un documento entero, en Markdown. Se llama `ProjectDocument` y no `Document`
 * porque `Document` es un global del DOM y sombrearlo no da ningún error.
 */
export interface ProjectDocument extends WorkspaceDocumentRef {
  content: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
}

/** Tope del contenido de un documento. Espejo de `DOCUMENT_CONTENT_MAX` del backend. */
export const DOCUMENT_CONTENT_MAX = 100_000;

/** 409 al guardar sobre una versión que ya no es la última (D4 de PLAN-DOCUMENTOS). */
export const DOCUMENT_CHANGED_CODE = 'DOCUMENT_CHANGED';

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
  /** Cuándo entró en una columna de cierre. `null` mientras siga abierta. */
  completedAt: string | null;
  /** Sprint al que pertenece. `null` = backlog del tablero (o tablero sin Scrum). */
  sprintId: string | null;
  /** Cuándo se fijó el `sprintId` actual. Separa alcance original de scope creep. */
  sprintAssignedAt: string | null;
  /** Puntos de estimación. `null` = sin estimar, que no es lo mismo que 0. */
  estimatePoints: number | null;
  /** Veces que pasó sin terminar de un sprint cerrado al siguiente. */
  carryOverCount?: number;
  assignees: TaskAssignee[];
  checklists: ChecklistItem[];
  labels: TaskLabel[];
  /** Del más antiguo al más nuevo. Vienen con la tarea, también en el listado. */
  comments: TaskComment[];
  /** Metadatos de los adjuntos. Los bytes se piden aparte al descargar. */
  attachments: TaskAttachment[];
  /**
   * Los documentos vinculados, solo su id. El título se cruza con los
   * documentos del proyecto. Opcional porque las tareas que llegan por otras
   * vías (eventos en vivo, el asistente) pueden no traerlo.
   */
  documents?: { documentId: string }[];
  /**
   * Los valores de los campos personalizados que tienen algo; sin entrada es
   * vacío. Opcional por lo mismo que `documents`: las tareas que llegan por
   * eventos en vivo o del asistente pueden no traerlo.
   */
  fieldValues?: TaskFieldValue[];
  /** Enlaces adjuntos (un Google Doc, un PR). Opcional por lo mismo que `documents`. */
  links?: TaskLink[];
  subtasks: Task[];
}

/** Un enlace adjunto a una tarea. Va en «Archivos» junto a los PDF. */
export interface TaskLink {
  id: string;
  taskId: string;
  /** Siempre `http(s)`: lo valida el servidor. */
  url: string;
  /** El de la página al añadirlo, o el que se escribió. Sin él, se enseña el dominio. */
  title: string | null;
  addedBy: string;
  createdAt: string;
}

/* ─── Campos personalizados (docs/PLAN-CAMPOS-PERSONALIZADOS.md) ─────────── */

/** Espejo de `CUSTOM_FIELD_TYPES` en `@praxis/contracts`. */
export const CUSTOM_FIELD_TYPES = [
  'TEXT',
  'NUMBER',
  'DATE',
  'SELECT',
  'MULTI_SELECT',
  'PERSON',
  'CHECKBOX',
  'URL',
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  TEXT: 'Texto',
  NUMBER: 'Número',
  DATE: 'Fecha',
  SELECT: 'Selección',
  MULTI_SELECT: 'Selección múltiple',
  PERSON: 'Persona',
  CHECKBOX: 'Casilla',
  URL: 'Enlace',
};

/** Los dos tipos que llevan lista de opciones. */
export function fieldTakesOptions(type: CustomFieldType): boolean {
  return type === 'SELECT' || type === 'MULTI_SELECT';
}

export interface CustomFieldOption {
  id: string;
  name: string;
  color: LabelColor;
}

/** Un campo que el proyecto añade a sus tareas: «Reviewer», «Cliente»… */
export interface CustomField {
  id: string;
  projectId: string;
  name: string;
  /** No cambia una vez creado: para otro tipo se crea otro campo. */
  type: CustomFieldType;
  /** Solo en `SELECT` y `MULTI_SELECT`; los valores guardan el `id`. */
  options: CustomFieldOption[];
  /** Se pinta también en la tarjeta del tablero. */
  showOnCard: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * El valor de un campo en una tarea. Cada tipo usa **una** columna:
 * `text` (texto, enlace, id de la opción elegida), `number`, `date`, `bool`, o
 * `ids` (opciones de una selección múltiple, o personas).
 */
export interface TaskFieldValue {
  fieldId: string;
  text: string | null;
  number: number | null;
  date: string | null;
  bool: boolean | null;
  ids: string[];
}

/**
 * Lo que se manda para escribir un valor —`PUT /tasks/:id/fields/:fieldId`—,
 * con la forma que espera cada tipo. `null` vacía el campo.
 */
export type FieldInput = string | number | boolean | string[] | null;

/** El valor de un campo en una tarea, o `undefined` si está vacío. */
export function fieldValueOf(task: Task, fieldId: string): TaskFieldValue | undefined {
  return task.fieldValues?.find((value) => value.fieldId === fieldId);
}

/** Pasa un valor guardado a la forma de entrada de su tipo. */
export function fieldInputOf(field: CustomField, value: TaskFieldValue | undefined): FieldInput {
  if (!value) return field.type === 'MULTI_SELECT' || field.type === 'PERSON' ? [] : null;
  switch (field.type) {
    case 'TEXT':
    case 'URL':
    case 'SELECT':
      return value.text;
    case 'NUMBER':
      return value.number;
    case 'DATE':
      return value.date ? value.date.slice(0, 10) : null;
    case 'CHECKBOX':
      return value.bool;
    case 'MULTI_SELECT':
    case 'PERSON':
      return value.ids;
  }
}

/** ¿Vacío? Lo que decide si una tarjeta pinta el campo o no. */
export function isEmptyFieldInput(input: FieldInput): boolean {
  return input === null || input === '' || (Array.isArray(input) && input.length === 0);
}

/**
 * Una clave para ordenar la tabla por un campo: números como número, todo lo
 * demás como texto. Los vacíos van siempre al final (`null`).
 */
export function fieldSortKey(
  field: CustomField,
  value: TaskFieldValue | undefined,
  personName: (userId: string) => string,
): string | number | null {
  if (!value) return null;
  switch (field.type) {
    case 'NUMBER':
      return value.number;
    case 'CHECKBOX':
      return value.bool ? 1 : 0;
    case 'DATE':
      return value.date;
    case 'SELECT': {
      /* Por la posición de la opción, no por su nombre: quien define «Baja,
         Media, Alta» espera ese orden, no el alfabético. */
      const index = field.options.findIndex((o) => o.id === value.text);
      return index < 0 ? null : index;
    }
    case 'MULTI_SELECT':
      return value.ids
        .map((id) => field.options.find((o) => o.id === id)?.name ?? '')
        .join(', ')
        .toLocaleLowerCase('es');
    case 'PERSON':
      return value.ids.map(personName).join(', ').toLocaleLowerCase('es');
    default:
      return value.text?.toLocaleLowerCase('es') ?? null;
  }
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
/**
 * Cómo se nombra a alguien de quien ya no queda perfil.
 *
 * ⚠️ **El UUID no es una alternativa.** Varios sitios caían a `member.userId`
 * cuando el perfil no resolvía, y en pantalla eso es
 * «3f2a…-9c11 salió del proyecto»: no dice quién era, no se puede buscar y
 * parece un error de la aplicación.
 *
 * Desde que administración puede borrar cuentas de verdad esto deja de ser un
 * caso raro: el trabajo de esa persona se conserva a propósito —borrarlo
 * dejaría huecos en tableros ajenos— así que su id sigue en tareas y mensajes
 * de proyectos que siguen vivos.
 *
 * Se dice «eliminado» y no «desconocido» porque es lo que casi siempre es. Un
 * fallo al resolver el perfil cae aquí también, y en ese caso el texto se
 * queda corto — pero sigue siendo más útil que un identificador.
 */
export const PERSONA_ELIMINADA = 'Usuario eliminado';

export function personLabel(user: UserProfile): string {
  const name = displayName(user);
  if (name) return name;
  return user.credential.email.split('@')[0] ?? user.credential.email;
}

/**
 * Con qué llamar a alguien cuando se le saluda.
 *
 * El nombre de pila, o la parte local del correo si la cuenta aún no tiene
 * nombre —que es lo normal, porque el registro no lo pide—. Sale de
 * `personLabel` justamente para heredar esa caída: un «Hola, » a secas es peor
 * que un «Hola, andres».
 *
 * ⚠️ **Solo la primera palabra.** Un saludo con nombre y dos apellidos no suena
 * a saludo, suena a citación.
 */
export function firstNameOf(user: UserProfile): string {
  return personLabel(user).trim().split(' ')[0] ?? '';
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
  'AUTOMATION_TASK_DUE_SOON',
  'AUTOMATION_TASK_STALE',
  'AUTOMATION_TASK_OVERDUE',
  'AUTOMATION_TASK_UNASSIGNED',
  'AUTOMATION_TASK_CREATED',
  'AUTOMATION_TASK_MOVED',
  'AUTOMATION_TASK_COMPLETED',
  'AUTOMATION_TASK_REOPENED',
  'AUTOMATION_TASK_ASSIGNEES_CHANGED',
  'AUTOMATION_TASK_DUE_DATE_CHANGED',
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
 * Automatización.
 *
 * 🔴 **Estas listas eran un espejo escrito a mano de lo que aceptaba el
 * validador, y los espejos se rompen.** Cuando el servidor pasó de dos
 * disparadores a diez, esto seguía declarando dos y **nada fallaba**: el
 * formulario ofrecía de menos y no hay compilación que avise de eso.
 *
 * Ahora la lista viva la sirve el propio servicio en
 * `GET /projects/:id/automations/catalog`, y lo que queda aquí son **tipos
 * abiertos**: `string` en vez de una unión cerrada. Es a propósito — una unión
 * cerrada en el cliente vuelve a ser una copia que envejece.
 */
export type AutomationTriggerType = string;
export type AutomationActionType = string;
export type AutomationConditionOperator = string;

/**
 * `ENABLED`/`DISABLED` son los únicos que puede mandar el cliente.
 * `PAUSED_SYSTEM` e `INVALID` los pone el sistema — enviarlos da 400.
 */
export const AUTOMATION_RULE_STATUSES = ['ENABLED', 'DISABLED'] as const;
export type AutomationRuleStatus = (typeof AUTOMATION_RULE_STATUSES)[number];
/** Los dos únicos que puede tener una regla ya guardada, sin poder enviarse. */
export type AutomationRuleStatusReadOnly = 'PAUSED_SYSTEM' | 'INVALID';

export const AUTOMATION_EXECUTION_STATUSES = ['RUNNING', 'SUCCEEDED', 'SKIPPED', 'FAILED'] as const;
export type AutomationExecutionStatus = (typeof AUTOMATION_EXECUTION_STATUSES)[number];

export interface AutomationTrigger {
  type: AutomationTriggerType;
  config: Record<string, unknown>;
}

export interface AutomationCondition {
  /** Depende del trigger: ver el catálogo en `lib/automation-catalog.ts` de projects-front. */
  field: string;
  operator: string;
  value: unknown;
  position: number;
}

export interface AutomationAction {
  type: AutomationActionType;
  config: Record<string, unknown>;
  position: number;
}

export interface AutomationRule {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  status: AutomationRuleStatus | AutomationRuleStatusReadOnly;
  version: number;
  createdBy: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  /**
   * Por qué el sistema la pausó, si lo hizo.
   *
   * ⚠️ Sin esto, una regla en `PAUSED_SYSTEM` se ve apagada y parece que
   * alguien la desactivó a mano — así que se vuelve a activar y se vuelve a
   * pausar en la siguiente ejecución.
   */
  pausedAt?: string | null;
  pauseReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** El resultado de una acción dentro de una ejecución. Reintenta una vez. */
export type AutomationActionResult =
  | { status: 'SUCCEEDED'; attempts: number; value: unknown }
  | { status: 'FAILED'; attempts: number; error: { message: string } };

/**
 * Una fila de auditoría.
 *
 * ⚠️ **`subjectTitle` y `triggerType` llegan copiados, no referenciados.** La
 * tarea puede renombrarse o borrarse después, y una auditoría que cambia cuando
 * cambia el presente no es una auditoría. Son opcionales porque las filas
 * anteriores a que existieran siguen ahí: se pintan sin ellos.
 */
export interface AutomationExecution {
  id: string;
  ruleId: string;
  rule: { name: string };
  status: AutomationExecutionStatus;
  /** Qué disparó esta ejecución. */
  triggerType?: string | null;
  /** Sobre qué tarea actuó, y cómo se llamaba entonces. */
  subjectId?: string | null;
  subjectTitle?: string | null;
  conditionResult: { matched: boolean; context: Record<string, unknown> };
  actionResults: AutomationActionResult[] | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

/**
 * Lo que devuelve `GET /projects/:id/automations/executions`.
 *
 * ⚠️ **`total` existe para que la pantalla pueda decir que está recortando.**
 * Esto devolvía un array de veinte filas y nada más, y ese es el peor tipo de
 * recorte: quien mira las ejecuciones lo hace para saber por qué una regla no
 * actuó, y sin el total concluye que no se evaluó nunca cuando lo que pasa es
 * que su caso quedó fuera de la ventana.
 */
export interface AutomationExecutionPage {
  items: AutomationExecution[];
  /** Cuántas hay en el proyecto, no cuántas vienen. */
  total: number;
  /** Cuántas caben en esta respuesta. Hoy lo fija el gateway en 20. */
  limit: number;
}

/** Lo que devuelve `POST /projects/:id/automations/review`. */
export interface AutomationReviewSummary {
  rules: number;
  candidates: number;
  succeeded: number;
  failed: number;
  /**
   * Candidatas que no cumplían las condiciones.
   *
   * ⚠️ **Sin esto, «0 acciones» no significa nada.** El resumen decía cuántas
   * salieron bien y cuántas fallaron, y una revisión con cuarenta candidatas y
   * ninguna acción se leía igual tanto si las condiciones no se cumplían —la
   * regla está mal escrita— como si ya se actuó ayer —todo va bien—. Son dos
   * situaciones opuestas y pedían dos decisiones opuestas.
   */
  filtered: number;
  /** Candidatas cuya causa ya se había atendido antes. */
  repeated: number;
}

/*
 * ⚠️ Aquí estaba `CHAT_EVENT_TYPE = 'CHAT_MESSAGE'`, el `type` de texto libre con
 * el que un mensaje de chat se colaba por el canal de avisos disfrazado de
 * notificación. Ese sobre ya no existe: los eventos en vivo llevan `tipo` en la
 * raíz y una unión cerrada, en `commons/realtime/tipos.ts`. La constante se ha
 * ido con él para que nadie la reintroduzca creyendo que sigue significando algo.
 */

/**
 * Las reacciones que se **ofrecen**, en el orden en que se pintan.
 *
 * Lista **cerrada** y espejo de `CHAT_REACTIONS` en `@praxis/contracts`: el
 * emoji viaja en el cuerpo y acaba en la base, así que dejarlo abierto sería un
 * campo más donde meter lo que sea.
 *
 * Cinco y no seis, y estas cinco: el juego anterior —🎉 🚀 👀 😄— eran cuatro
 * formas de decir que algo te parece bien y **ninguna** de decir que no. Un
 * selector de reacciones sirve para contestar sin escribir, y contestar incluye
 * discrepar: sin un 👎, quien no está de acuerdo tiene que escribirlo o
 * callarse. El orden va de más a menos frecuente y deja el pulgar hacia abajo
 * en el extremo, lejos del pulgar hacia arriba — son la misma silueta girada y
 * juntos se pulsan mal.
 */
export const CHAT_REACTIONS = ['👍', '❤️', '😂', '😮', '👎'] as const;

/**
 * Las que se **aceptan**, que no son las mismas.
 *
 * ⚠️ **Quitar una reacción tiene que seguir funcionando aunque ya no se
 * ofrezca.** El backend valida el emoji en las dos direcciones, así que al
 * recortar la lista los 🎉 y 🚀 que ya estaban puestos se habrían quedado
 * pegados para siempre: el botón daba 400 y no había forma de retirarlos. Los
 * retirados siguen aquí —y en `CHAT_REACTIONS_ACEPTADAS` de `@praxis/contracts`,
 * que es quien de verdad valida— pero no salen en ningún selector, así que no
 * se pueden volver a poner.
 */
export const CHAT_REACTIONS_ACEPTADAS = [...CHAT_REACTIONS, '🎉', '👀', '🚀', '😄'] as const;

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
export type ChatMessageOrigin = 'USER' | 'AUTOMATION' | 'ASSISTANT';

/** Lo que se copia al publicar, para pintar el origen aunque la regla ya no exista. */
export interface ChatMessageOriginMeta {
  ruleId?: string;
  ruleName?: string;
  taskId?: string;
  taskTitle?: string;
  invocadoPor?: string;
  conversationId?: string;
  /**
   * Es la **respuesta de PRAX** a una mención en el chat del grupo (D15), no un
   * mensaje de la persona. Se pinta como PRAX, «a petición de …».
   */
  respuesta?: boolean;
  /** Cuántas propuestas dejó en la conversación privada de quien preguntó. */
  propuestas?: number;
  /** No pudo responder: el texto explica por qué. */
  error?: boolean;
}

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
   * Si fluye por la conversación general o vive solo dentro de su hilo.
   *
   * ⚠️ **No es lo mismo que `replyTo`.** Los dos van con la cita, pero responden
   * preguntas distintas: `replyTo` dice a quién cita, esto dice **dónde se ve**.
   * «Responder» desde el compositor principal deja esto en `true` —es un mensaje
   * normal que además cita a otro—; escribir dentro del panel del hilo lo deja
   * en `false`.
   *
   * El cliente lo necesita desde que los mensajes llegan por el flujo en vivo:
   * es lo que decide si un mensaje nuevo se inserta en el historial o en el
   * panel del hilo. Sin esto, una respuesta de hilo aparecía en medio de la
   * conversación general.
   */
  visibleEnChat: boolean;
  /**
   * Cuándo se borró, o `null` si el mensaje está vivo.
   *
   * ## Un mensaje borrado sigue estando en la lista
   *
   * El borrado es **suave**: la fila se queda, con `body` vacío, sin adjuntos y
   * sin reacciones, y la conversación pinta una lápida —«Mensaje eliminado»— en
   * su sitio. Antes la fila desaparecía, y eso deja un hueco mudo: quien está
   * leyendo ve que algo se ha movido y no sabe si alguien borró un mensaje o si
   * falló la carga.
   *
   * ⚠️ **Una lápida no admite ninguna acción**: ni responder, ni reaccionar, ni
   * fijar, ni editar, ni abrir hilo. `MessageBubble` corta por aquí antes de
   * pintar la barra, y el backend rechaza las cuatro por su cuenta — la
   * interfaz no es lo que las impide.
   */
  deletedAt: string | null;
  /**
   * De dónde vino (D13 de docs/PLAN-PRAX-SEMIAGENTICO.md).
   *
   * El mensaje sigue siendo de `authorId`; esto dice cómo llegó a escribirse.
   * `AUTOMATION` se pinta como divisor —«⚡ Regla «X»…»— y no como algo que esa
   * persona escribió a mano; `ASSISTANT` como mensaje suyo con la marca
   * «enviado con PRAX». Opcional porque un mensaje anterior al campo, servido
   * desde una caché, puede no traerlo: sin él, es `USER`.
   */
  origin?: ChatMessageOrigin;
  originMeta?: ChatMessageOriginMeta | null;
  /**
   * A qué mensaje responde, con lo justo para pintar la cita.
   *
   * `attachments` solo trae el `mimeType`, del primero si hay varios: la cita
   * no enseña el archivo, solo dice qué es cuando el mensaje citado no tiene
   * texto — «📷 Imagen» en vez de un hueco vacío.
   *
   * `deletedAt` porque el mensaje citado puede haberse borrado **después** de
   * que alguien lo respondiera: entonces la cita dice «Mensaje eliminado» en vez
   * de quedarse en blanco. La respuesta sigue ahí — es de otra persona y sigue
   * teniendo sentido.
   */
  replyTo: {
    id: string;
    authorId: string;
    body: string;
    deletedAt: string | null;
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
  /**
   * El canal de esta conversación.
   *
   * ⚠️ Es con lo que el panel decide si un evento del flujo en vivo le incumbe,
   * y **no se puede deducir de `items[0].channelId`**: una conversación recién
   * empezada no tiene ni un mensaje, y sería justo la que se quedaría muda.
   */
  channelId: string;
  /** Del más antiguo al más nuevo, que es como se pinta una conversación. */
  items: ChatMessage[];
  /** Queda historial por encima. Lo usa el botón de «ver mensajes anteriores». */
  hasMore: boolean;
  /**
   * Solo en `?after=`: el hueco **no cabía entero** y viene recortado.
   *
   * ⚠️ Con `true` los `items` **no se pegan** a lo que ya hay: falta lo de en
   * medio, y pegarlos deja la conversación con un agujero mudo. Hay que recargar
   * la conversación entera.
   *
   * Va aparte de `hasMore` porque significan cosas opuestas: aquel dice que
   * queda más **hacia arriba** (historial antiguo), este que falta **hacia
   * abajo** (lo que llegó durante el corte).
   *
   * Opcional porque el resto de respuestas no lo traen.
   */
  hasMoreAfter?: boolean;
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
  /**
   * El último mensaje, para el resumen de la fila.
   *
   * `deletedAt` viaja porque un mensaje borrado deja `body` vacío: sin él, la
   * fila de una conversación cuyo último mensaje se borró se queda **sin
   * resumen**, que se lee como si la conversación estuviera vacía.
   */
  ultimo: {
    body: string;
    authorId: string;
    createdAt: string;
    deletedAt?: string | null;
  } | null;
  unread: number;
  muted: boolean;
}

/**
 * Un chat de equipo, tal y como lo devuelve `GET /me/chats/projects`.
 *
 * ⚠️ **No existía**, y por eso la barra lateral y el índice de Mensajes lo
 * manejaban con `any`: dos superficies leyendo `c.project.organizationId` y
 * `c.ultimo.body` sin que nada comprobara que esos campos vienen. Un cambio en
 * el `select` del servicio no habría dado ni un error de compilación.
 *
 * `channelId` es `null` cuando el proyecto **todavía no tiene canal**: nadie ha
 * escrito nunca. La fila se pinta igual —el chat se puede abrir y crear el canal
 * al primer mensaje— y por eso `project` no es opcional pero `channelId` sí es
 * nulo. Es un proyecto sin conversación, no una conversación sin proyecto.
 */
export interface ProjectChatSummary {
  channelId: string | null;
  project: {
    id: string;
    name: string;
    slug: string;
    iconKey: string | null;
    imageUrl?: string | null;
    color: string | null;
    /** Con lo que el directorio lo acota a la organización activa. */
    organizationId: string;
  };
  /** Mismo trato que en `DirectConversation`: `deletedAt` viaja para el resumen. */
  ultimo: {
    body: string;
    authorId: string;
    createdAt: string;
    deletedAt?: string | null;
  } | null;
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
 * Espejo de `ProjectTemplate` en `@praxis/contracts`. Está copiado por lo
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
export interface TemplateLabel {
  nombre: string;
  color: LabelColor;
}

export interface TemplateRole {
  nombre: string;
  /** Diccionario de booleanos, nunca un array. Trampa 8 de CLAUDE.md. */
  permisos: PermissionMap;
}

export interface TemplateColumn {
  nombre: string;
  /**
   * ⚠️ `success` **no es un color, es un significado**: marca la columna de
   * cierre y una tarea que entra ahí se da por terminada. El backend ya se
   * encarga de que solo la última lo lleve.
   */
  color?: ColumnColor;
}

export interface TemplateBoard {
  nombre: string;
  columnas: TemplateColumn[];
}

export interface TemplateSpace {
  nombre: string;
  tableros: TemplateBoard[];
}

export interface ProjectTemplate {
  nombre: string;
  descripcion: string;
  etiquetas: TemplateLabel[];
  roles: TemplateRole[];
  espacios: TemplateSpace[];
  /** Por qué esta estructura y no otra. Lo pinta la pantalla junto al plan. */
  porQue: string;
}

/** El contador que acompaña al borrador, para pintarlo como hace el chat. */
export interface TemplateQuota {
  plan: string;
  usados: number;
  limite: number;
}

export interface TemplateDraftResult {
  plantilla: ProjectTemplate;
  cuota: TemplateQuota;
}

/** Cuánto texto se le pide a quien describe su proyecto. */
export const TEMPLATE_BRIEF_MIN = 20;
export const TEMPLATE_BRIEF_MAX = 4000;

/**
 * Lo que devuelve pedir un borrador. Vive aquí, y no junto a la función que lo
 * produce, porque el diálogo es un componente de cliente y aquella es código de
 * servidor: el tipo tiene que poder cruzar esa frontera.
 */
export interface TemplateDraftState {
  resultado: TemplateDraftResult | null;
  error: string | null;
  /**
   * La cuota se acabó.
   *
   * Se distingue del resto porque **no se arregla reintentando**, y la pantalla
   * tiene que decir otra cosa: con un «vuelve a intentarlo» genérico la gente
   * pulsa el botón otras cinco veces contra un límite que no se mueve.
   *
   * 🔴 **Se decidía por `status === 429` a secas, y eso mezclaba dos cosas.** El
   * gateway limita a 300 peticiones por minuto y por cuenta, y responde con ese
   * mismo 429: un throttle en mitad de una tanda se leía como «se te acabó el
   * mes» y mandaba a alguien a la pantalla de planes por algo que se arregla
   * esperando quince segundos. Ahora la cuota viaja como **402
   * `QUOTA_EXCEEDED`**, igual que las otras dos del plan, y esto se decide por
   * el código.
   */
  sinCuota: boolean;
  /**
   * El detalle del 402, cuando lo hay.
   *
   * Es lo que permite ofrecer la salida —qué tope, cuánto llevas y cuándo
   * vuelve— en vez de una frase. `null` también cuando `sinCuota` es `true` y
   * el detalle no vino con forma válida: ver `detallesDeCuota`.
   */
  cuota: QuotaExceededDetails | null;
}

/** Lo que devuelve materializar una plantilla aceptada. */
export interface TemplateResult {
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
export const TEMPLATE_TWEAK_MAX = 1000;
