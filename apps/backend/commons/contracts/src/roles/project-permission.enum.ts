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
   * Cambiar el nombre y la descripción del proyecto.
   *
   * Lo pedía `canEditBoard`, que es el permiso de **otra cosa**: renombrar el
   * proyecto no tiene nada que ver con editar un tablero suyo, y al revés, quien
   * organiza los tableros no tiene por qué poder rebautizar el proyecto entero.
   *
   * `canEditBoard` lo implica por jerarquía, así que ningún rol existente pierde
   * capacidad — es el mismo movimiento que `canMoveTask`, `canComment`,
   * `canManageLabels` y `canDeleteProject`.
   */
  CAN_EDIT_PROJECT   = 'canEditProject',

  /**
   * Ver los reportes **desglosados por persona**.
   *
   * Los agregados que no nombran a nadie —flujo del tablero, tiempos de ciclo,
   * reparto por prioridad— piden `canViewProject` y los ve cualquiera que pueda
   * ver el proyecto. Este permiso cubre lo otro: cuánto lleva cada cual, cuánto
   * ha cerrado y en cuánto tiempo.
   *
   * Es una línea de privacidad, no de seguridad: son datos del trabajo, no
   * secretos. Pero un tablero con las cifras de todo el mundo a la vista se
   * convierte en una clasificación aunque nadie lo pretenda, así que enseñarlas
   * es una decisión que alguien tiene que tomar a propósito.
   *
   * Cada persona ve **siempre** sus propios números, sin ningún permiso, en
   * `/me/reports`.
   *
   * Entra implicado por `canManageMembers`, `canEditProject` y
   * `canDeleteProject`: así los roles «Administrador» que ya existen lo reciben
   * sin migración, y un «Colaborador» no.
   */
  CAN_VIEW_REPORTS   = 'canViewReports',

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
