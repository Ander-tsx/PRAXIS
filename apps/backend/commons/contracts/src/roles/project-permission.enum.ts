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
  CAN_VIEW_PROJECT = 'canViewProject',

  CAN_CREATE_TASK = 'canCreateTask',
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
  CAN_MOVE_TASK = 'canMoveTask',
  CAN_EDIT_TASK = 'canEditTask',
  CAN_DELETE_TASK = 'canDeleteTask',
  CAN_CREATE_BOARD = 'canCreateBoard',
  CAN_EDIT_BOARD = 'canEditBoard',
  CAN_DELETE_BOARD = 'canDeleteBoard',
  CAN_CREATE_COLUMN = 'canCreateColumn',
  /** Estaba en el DTO de roles y en la jerarquía, pero faltaba en el enum. */
  CAN_EDIT_COLUMN = 'canEditColumn',
  CAN_DELETE_COLUMN = 'canDeleteColumn',
  CAN_MANAGE_MEMBERS = 'canManageMembers',
  CAN_MANAGE_ROLES = 'canManageRoles',

  /**
   * Crear, editar, habilitar, deshabilitar y eliminar reglas de automatización
   * del proyecto. No concede acceso a recursos externos.
   */
  CAN_MANAGE_AUTOMATIONS = 'canManageAutomations',

  /**
   * Solicitar, conectar, reconectar y desconectar integraciones externas del
   * proyecto. Se mantiene separado de automatizaciones para que configurar una
   * regla no permita vincular repositorios o cuentas de terceros.
   */
  CAN_MANAGE_INTEGRATIONS = 'canManageIntegrations',

  /**
   * Comentar en una tarea.
   *
   * Comentar exigía `canEditTask`, así que un perfil de solo lectura —cliente,
   * dirección, auditoría— leía el hilo y no podía responder. Leer y opinar no es
   * editar el trabajo de nadie. `canEditTask` lo implica por jerarquía.
   */
  CAN_COMMENT = 'canComment',

  /**
   * Crear, renombrar y borrar las etiquetas del proyecto.
   *
   * Las gestionaba `canEditTask` por no existir este: quien podía tocar una
   * tarea podía rehacer el vocabulario del proyecto entero, y al revés, quien
   * organiza las etiquetas tenía que poder editar tareas.
   */
  CAN_MANAGE_LABELS = 'canManageLabels',

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
  CAN_EDIT_PROJECT = 'canEditProject',

  /**
   * Ver los reportes del proyecto, **y preguntarle al asistente sobre él**.
   *
   * Cubre las siete rutas de `projects/:projectId/reports` y las dos de
   * `projects/:projectId/assistant`. Quien no lo tenga no entra al informe: no
   * ve los agregados, no ve el desglose por persona y no puede consultar a la
   * IA con los datos del proyecto delante.
   *
   * ⚠️ **Antes solo cubría el desglose por persona.** Los agregados que no
   * nombran a nadie —flujo del tablero, tiempos de ciclo, reparto por
   * prioridad, predicción— pedían `canViewProject`, y la idea era que la línea
   * fuese de privacidad y no de acceso: son datos del trabajo, no secretos, y
   * lo único que había que decidir a propósito era enseñar las cifras de cada
   * cual, porque un tablero con todas a la vista se convierte en una
   * clasificación aunque nadie lo pretenda.
   *
   * Se cerró entero por una razón de producto, no técnica: un perfil cuyo
   * trabajo en la plataforma es concretar y mover tareas no necesita el análisis
   * de datos ni el asistente, y ofrecérselo es ruido. Con la página cerrada la
   * distinción interna se quedaba sin trabajo que hacer —quien entra lo tiene
   * por definición— así que se eliminó en vez de dejar un permiso que
   * significara dos cosas a la vez.
   *
   * La cuota del asistente sí sigue abierta en `/me/assistant/quota`: es del
   * usuario y no de ningún proyecto, y es lo que lee Configuración.
   *
   * Entra implicado por `canManageMembers`, `canEditProject` y
   * `canDeleteProject`: así los roles «Administrador» que ya existen lo reciben
   * sin migración, y un «Colaborador» no.
   */
  CAN_VIEW_REPORTS = 'canViewReports',

  /**
   * Eliminar el proyecto entero.
   *
   * Borrarlo exigía `canDeleteBoard`, un permiso de **otra cosa y de menor
   * alcance**: quien podía borrar un tablero podía borrar el proyecto con todos
   * sus tableros, espacios, tareas y miembros.
   */
  CAN_DELETE_PROJECT = 'canDeleteProject',

  /**
   * Crear, iniciar y cerrar sprints en un tablero con Scrum encendido.
   *
   * Acotado a propósito, en vez de reusar `canEditBoard`: un equipo puede
   * querer que alguien edite tareas sin poder decidir cuándo arranca o
   * termina un sprint — esa decisión suele ser de quien lleva el proceso, no
   * de todo el equipo. `canEditBoard` lo implica por jerarquía, así que quien
   * ya administra la estructura del tablero no pierde nada.
   *
   * No cubre encender o apagar Scrum en el tablero (`Board.scrumEnabled`):
   * eso es una propiedad del tablero, como su nombre, y sigue pidiendo
   * `canEditBoard` directamente. Ver `docs/PLAN-SCRUM-KANBAN.md`, D1 y D7.
   */
  CAN_MANAGE_SPRINT = 'canManageSprint',
}

/** Claves válidas de un mapa de permisos. Se usa para validar lo que llega. */
export const PROJECT_PERMISSIONS: readonly string[] = Object.values(ProjectPermission);
