import { PERMISSION_IMPLIES, type PermissionMap, type ProjectPermission } from '@praxis/commons';

/** Etiquetas legibles. El nombre técnico no dice nada a quien reparte roles. */
export const PERMISSION_LABELS: Record<ProjectPermission, string> = {
  canViewProject: 'Ver el proyecto',
  canCreateBoard: 'Crear tableros',
  canEditBoard: 'Editar tableros',
  canDeleteBoard: 'Eliminar tableros',
  canCreateColumn: 'Crear columnas',
  canEditColumn: 'Editar columnas',
  canDeleteColumn: 'Eliminar columnas',
  canCreateTask: 'Crear tareas',
  canMoveTask: 'Mover tareas de columna',
  canEditTask: 'Editar tareas',
  canDeleteTask: 'Eliminar tareas',
  canManageMembers: 'Gestionar el equipo',
  canManageRoles: 'Gestionar los roles',
};

/** Agrupados como los piensa quien reparte permisos, no como los guarda la BD. */
export const PERMISSION_GROUPS: { title: string; permissions: ProjectPermission[] }[] = [
  { title: 'Acceso', permissions: ['canViewProject'] },
  { title: 'Tableros', permissions: ['canCreateBoard', 'canEditBoard', 'canDeleteBoard'] },
  { title: 'Columnas', permissions: ['canCreateColumn', 'canEditColumn', 'canDeleteColumn'] },
  {
    title: 'Tareas',
    permissions: ['canCreateTask', 'canMoveTask', 'canEditTask', 'canDeleteTask'],
  },
  { title: 'Administración', permissions: ['canManageMembers', 'canManageRoles'] },
];

/**
 * Permisos que quedan concedidos por jerarquía a partir de los marcados.
 *
 * El backend los expande al evaluar, así que no se guardan. Pero el formulario
 * tiene que enseñarlos: marcar "eliminar tableros" concede también "editar" y
 * "crear", y sin decirlo el usuario cree que está dando menos de lo que da.
 *
 * `canViewProject` es el suelo: cualquier permiso lo implica.
 */
export function impliedFrom(selected: Set<ProjectPermission>): Set<ProjectPermission> {
  const implied = new Set<ProjectPermission>();

  for (const permission of selected) {
    for (const child of PERMISSION_IMPLIES[permission] ?? []) {
      if (!selected.has(child)) implied.add(child);
    }
  }

  if (selected.size > 0 && !selected.has('canViewProject')) {
    implied.add('canViewProject');
  }

  return implied;
}

/** Los permisos marcados de un rol existente, como Set. */
export function selectedFrom(permissions: PermissionMap): Set<ProjectPermission> {
  return new Set(
    Object.entries(permissions)
      .filter(([, granted]) => granted)
      .map(([key]) => key as ProjectPermission),
  );
}
