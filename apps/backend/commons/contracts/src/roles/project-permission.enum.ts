export enum ProjectPermission {
  /**
   * Ver el proyecto y su contenido. Es el permiso de menor nivel: todos los
   * demás lo implican por jerarquía.
   *
   * Antes no existía y ver un proyecto exigía `canEditBoard`, que además
   * arrastraba `canCreateBoard`: para dejar mirar había que dar permiso de
   * crear y editar tableros, así que un rol de solo lectura —cliente,
   * dirección, auditoría— era imposible de representar.
   */
  CAN_VIEW_PROJECT   = 'canViewProject',

  CAN_CREATE_TASK    = 'canCreateTask',
  /**
   * Mover una tarea de columna, sin poder tocar su contenido.
   *
   * Existe porque arrastrar una tarjeta de «En curso» a «Hecho» exigía
   * `canEditTask`, que también deja reescribir el título, cambiar la prioridad y
   * reasignar a quien sea. Quien ejecuta el trabajo tiene que poder decir que lo
   * terminó sin poder redefinir en qué consistía.
   *
   * `canEditTask` lo implica por jerarquía: quien ya podía mover no pierde nada.
   */
  CAN_MOVE_TASK      = 'canMoveTask',
  CAN_EDIT_TASK      = 'canEditTask',
  CAN_DELETE_TASK    = 'canDeleteTask',
  CAN_CREATE_BOARD   = 'canCreateBoard',
  CAN_EDIT_BOARD     = 'canEditBoard',
  CAN_DELETE_BOARD   = 'canDeleteBoard',
  CAN_CREATE_COLUMN  = 'canCreateColumn',
  /** Estaba en el DTO de roles y en la jerarquía, pero faltaba en el enum. */
  CAN_EDIT_COLUMN    = 'canEditColumn',
  CAN_DELETE_COLUMN  = 'canDeleteColumn',
  CAN_MANAGE_MEMBERS = 'canManageMembers',
  CAN_MANAGE_ROLES   = 'canManageRoles',

  /**
   * Comentar en una tarea.
   *
   * Comentar exigía `canEditTask`, así que un perfil de solo lectura —cliente,
   * dirección, auditoría— leía el hilo y no podía responder. Leer y opinar no es
   * editar el trabajo de nadie. `canEditTask` lo implica por jerarquía.
   */
  CAN_COMMENT        = 'canComment',

  /**
   * Crear, renombrar y borrar las etiquetas del proyecto.
   *
   * Las gestionaba `canEditTask` por no existir este: quien podía tocar una
   * tarea podía rehacer el vocabulario del proyecto entero, y al revés, quien
   * organiza las etiquetas tenía que poder editar tareas.
   */
  CAN_MANAGE_LABELS  = 'canManageLabels',

  /**
   * Eliminar el proyecto entero.
   *
   * Borrarlo exigía `canDeleteBoard`, un permiso de **otra cosa y de menor
   * alcance**: quien podía borrar un tablero podía borrar el proyecto con todos
   * sus tableros, espacios, tareas y miembros.
   */
  CAN_DELETE_PROJECT = 'canDeleteProject',
}

/** Claves válidas de un mapa de permisos. Se usa para validar lo que llega. */
export const PROJECT_PERMISSIONS: readonly string[] = Object.values(ProjectPermission);
