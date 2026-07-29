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
}

/** Claves válidas de un mapa de permisos. Se usa para validar lo que llega. */
export const PROJECT_PERMISSIONS: readonly string[] = Object.values(ProjectPermission);
