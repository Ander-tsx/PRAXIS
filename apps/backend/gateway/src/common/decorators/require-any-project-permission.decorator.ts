import { SetMetadata } from '@nestjs/common';
import { ProjectPermission } from '@praxis/contracts';

/** Metadata para rutas de solo lectura que pueden autorizarse con cualquiera de varios permisos. */
export const PROJECT_ANY_PERMISSIONS_KEY = 'project_any_permissions';

export const RequireAnyProjectPermission = (...permissions: ProjectPermission[]) => {
  if (permissions.length === 0) {
    throw new Error('RequireAnyProjectPermission requiere al menos un permiso');
  }

  return SetMetadata(PROJECT_ANY_PERMISSIONS_KEY, permissions);
};
