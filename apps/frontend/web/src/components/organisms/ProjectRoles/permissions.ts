import { PERMISSION_IMPLIES, type PermissionMap, type ProjectPermission } from '@praxis/commons';

/**
 * Las etiquetas viven en commons desde que también las usa la vista previa de
 * la plantilla del asistente. Se reexportan para no tocar los puntos de uso de
 * esta zona, que son cuatro.
 */
export { PERMISSION_LABELS } from '@praxis/commons';

/** Agrupados como los piensa quien reparte permisos, no como los guarda la BD. */
export const PERMISSION_GROUPS: { title: string; permissions: ProjectPermission[] }[] = [
  /* Mover y marcar pasos van con «ver»: son lo que necesita quien ejecuta el
     trabajo, no quien lo define. Puestos con crear/editar/eliminar parecían un
     escalón del mismo eje, y no lo son. */
  {
    title: 'Acceso y ejecución',
    permissions: ['canViewProject', 'canMoveTask', 'canComment'],
  },
  { title: 'Tableros', permissions: ['canCreateBoard', 'canEditBoard', 'canDeleteBoard'] },
  { title: 'Sprints', permissions: ['canManageSprint'] },
  { title: 'Etiquetas', permissions: ['canManageLabels'] },
  { title: 'Documentos', permissions: ['canEditDocuments'] },
  { title: 'Columnas', permissions: ['canCreateColumn', 'canEditColumn', 'canDeleteColumn'] },
  { title: 'Tareas', permissions: ['canCreateTask', 'canEditTask', 'canDeleteTask'] },
  /* Los dos del proyecto van juntos y al final: son los de mayor alcance, y
     `canEditProject` sin `canDeleteProject` al lado se leía como un permiso de
     tablero más. */
  {
    title: 'Administración',
    permissions: [
      'canManageMembers',
      'canManageRoles',
      'canManageAutomations',
      'canManageIntegrations',
      'canViewReports',
      'canEditProject',
      'canDeleteProject',
    ],
  },
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
