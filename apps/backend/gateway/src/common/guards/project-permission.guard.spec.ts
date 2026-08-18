/// <reference types="jest" />

import { ProjectPermission } from '@praxis/contracts';
import { of } from 'rxjs';
import { PROJECT_ANY_PERMISSIONS_KEY } from '../decorators/require-any-project-permission.decorator';
import { PROJECT_PERMISSION_KEY } from '../decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from './project-permission.guard';

describe('ProjectPermissionGuard', () => {
  it('deniega una ruta OR cuando el miembro no tiene ninguno de sus permisos requeridos', async () => {
    const request = {
      user: { userId: 'member-id' },
      params: { projectId: '11111111-1111-4111-8111-111111111111' },
    };
    const reflector = {
      get: (key: string) =>
        key === PROJECT_ANY_PERMISSIONS_KEY
          ? [ProjectPermission.CAN_MANAGE_MEMBERS, ProjectPermission.CAN_MANAGE_ROLES]
          : undefined,
    };
    const projectsClient = {
      send: ({ cmd }: { cmd: string }) => {
        if (cmd === 'project_find_one') {
          return of({ ownerId: 'owner-id', status: 'ACTIVE' });
        }
        return of({ allowed: false });
      },
    };
    const context = {
      getHandler: () => () => undefined,
      getClass: () => ({ name: 'ProjectsController' }),
      switchToHttp: () => ({ getRequest: () => request }),
    };
    const guard = new ProjectPermissionGuard(
      reflector as never,
      projectsClient as never,
      {} as never,
    );

    await expect(guard.canActivate(context as never)).resolves.toBe(false);
  });

  it('permite una ruta OR cuando el miembro tiene uno de sus permisos requeridos', async () => {
    const request = {
      user: { userId: 'member-id' },
      params: { projectId: '11111111-1111-4111-8111-111111111111' },
    };
    const reflector = {
      get: (key: string) =>
        key === PROJECT_ANY_PERMISSIONS_KEY
          ? [ProjectPermission.CAN_MANAGE_MEMBERS, ProjectPermission.CAN_MANAGE_ROLES]
          : undefined,
    };
    const projectsClient = {
      send: ({ cmd }: { cmd: string }, payload?: { permission?: ProjectPermission }) => {
        if (cmd === 'project_find_one') {
          return of({ ownerId: 'owner-id', status: 'ACTIVE' });
        }
        return of({ allowed: payload?.permission === ProjectPermission.CAN_MANAGE_ROLES });
      },
    };
    const context = {
      getHandler: () => () => undefined,
      getClass: () => ({ name: 'ProjectsController' }),
      switchToHttp: () => ({ getRequest: () => request }),
    };
    const guard = new ProjectPermissionGuard(
      reflector as never,
      projectsClient as never,
      {} as never,
    );

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('conserva el bypass del dueño para una ruta OR', async () => {
    const request = {
      user: { userId: 'owner-id' },
      params: { projectId: '11111111-1111-4111-8111-111111111111' },
    };
    const reflector = {
      get: (key: string) =>
        key === PROJECT_ANY_PERMISSIONS_KEY
          ? [ProjectPermission.CAN_MANAGE_AUTOMATIONS, ProjectPermission.CAN_MANAGE_INTEGRATIONS]
          : undefined,
    };
    const projectsClient = {
      send: ({ cmd }: { cmd: string }) => {
        if (cmd === 'project_find_one') {
          return of({ ownerId: 'owner-id', status: 'ACTIVE' });
        }
        throw new Error(`No debe consultar permisos granulares: ${cmd}`);
      },
    };
    const context = {
      getHandler: () => () => undefined,
      getClass: () => ({ name: 'ProjectsController' }),
      switchToHttp: () => ({ getRequest: () => request }),
    };
    const guard = new ProjectPermissionGuard(
      reflector as never,
      projectsClient as never,
      {} as never,
    );

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('deniega metadata OR vacía para que una ruta configurada por error no quede pública', async () => {
    const reflector = {
      get: (key: string) => (key === PROJECT_ANY_PERMISSIONS_KEY ? [] : undefined),
    };
    const context = {
      getHandler: () => () => undefined,
      getClass: () => ({ name: 'ProjectsController' }),
      switchToHttp: () => ({ getRequest: () => ({}) }),
    };
    const guard = new ProjectPermissionGuard(reflector as never, {} as never, {} as never);

    await expect(guard.canActivate(context as never)).resolves.toBe(false);
  });

  it('deniega una ruta que declara permisos exacto y OR para no relajar una escritura', async () => {
    const request = {
      user: { userId: 'member-id' },
      params: { projectId: '11111111-1111-4111-8111-111111111111' },
    };
    const reflector = {
      get: (key: string) => {
        if (key === PROJECT_PERMISSION_KEY) return ProjectPermission.CAN_MANAGE_AUTOMATIONS;
        if (key === PROJECT_ANY_PERMISSIONS_KEY) return [ProjectPermission.CAN_MANAGE_INTEGRATIONS];
        return undefined;
      },
    };
    const projectsClient = {
      send: ({ cmd }: { cmd: string }) => {
        if (cmd === 'project_find_one') {
          return of({ ownerId: 'owner-id', status: 'ACTIVE' });
        }
        return of({ allowed: true });
      },
    };
    const context = {
      getHandler: () => () => undefined,
      getClass: () => ({ name: 'ProjectsController' }),
      switchToHttp: () => ({ getRequest: () => request }),
    };
    const guard = new ProjectPermissionGuard(
      reflector as never,
      projectsClient as never,
      {} as never,
    );

    await expect(guard.canActivate(context as never)).resolves.toBe(false);
  });

  it('mantiene la comprobación exacta cuando no existe metadata OR', async () => {
    const request = {
      user: { userId: 'member-id' },
      params: { projectId: '11111111-1111-4111-8111-111111111111' },
    };
    const reflector = {
      get: (key: string) =>
        key === PROJECT_PERMISSION_KEY ? ProjectPermission.CAN_MANAGE_AUTOMATIONS : undefined,
    };
    const projectsClient = {
      send: ({ cmd }: { cmd: string }, payload?: { permission?: ProjectPermission }) => {
        if (cmd === 'project_find_one') {
          return of({ ownerId: 'owner-id', status: 'ACTIVE' });
        }
        return of({ allowed: payload?.permission === ProjectPermission.CAN_MANAGE_AUTOMATIONS });
      },
    };
    const context = {
      getHandler: () => () => undefined,
      getClass: () => ({ name: 'ProjectsController' }),
      switchToHttp: () => ({ getRequest: () => request }),
    };
    const guard = new ProjectPermissionGuard(
      reflector as never,
      projectsClient as never,
      {} as never,
    );

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });
});
