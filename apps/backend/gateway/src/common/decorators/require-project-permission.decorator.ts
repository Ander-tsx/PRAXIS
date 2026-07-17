import { SetMetadata } from '@nestjs/common';
import { ProjectPermission } from '@praxis/contracts';

export const PROJECT_PERMISSION_KEY = 'project_permission';
export const RequireProjectPermission = (permission: ProjectPermission) =>
  SetMetadata(PROJECT_PERMISSION_KEY, permission);
