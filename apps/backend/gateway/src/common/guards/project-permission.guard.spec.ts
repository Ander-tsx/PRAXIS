/// <reference types="jest" />

import { ForbiddenException } from '@nestjs/common';
import { ProjectPermission, SEAT_FROZEN_CODE } from '@praxis/contracts';
import { of } from 'rxjs';
import { PROJECT_ANY_PERMISSIONS_KEY } from '../decorators/require-any-project-permission.decorator';
import { PROJECT_PERMISSION_KEY } from '../decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from './project-permission.guard';

/**
 * Un `QuotaService` que revienta si alguien le pregunta.
 *
 * ⚠️ **No es un doble perezoso: es la aserción.** Los proyectos de las pruebas
 * de arriba no llevan `organizationId`, así que el guard no tiene que pagar el
 * salto TCP del asiento congelado. Un doble vacío dejaría pasar el día en que
 * alguien mueva esa comprobación fuera del `if` y le cueste un viaje de red a
 * cada petición del repositorio, sin que ninguna prueba se entere.
 */
function quotaNuncaConsultada() {
  return {
    exigirAsientoVivo: () => {
      throw new Error('No debe preguntar por el asiento sin organización en el proyecto');
    },
  } as never;
}

/** Un `QuotaService` que congela a todo el que pregunte. */
function quotaQueCongela(puesto: number | null = 1) {
  return {
    exigirAsientoVivo: async (_userId: string, organizationId: string) => {
      throw new ForbiddenException({
        code: SEAT_FROZEN_CODE,
        message: 'Tu cuenta está en solo lectura.',
        details: { organizationId, puesto, tope: 3 },
      });
    },
  } as never;
}

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
      quotaNuncaConsultada(),
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
      quotaNuncaConsultada(),
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
      quotaNuncaConsultada(),
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
    const guard = new ProjectPermissionGuard(
      reflector as never,
      {} as never,
      {} as never,
      quotaNuncaConsultada(),
    );

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
      quotaNuncaConsultada(),
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
      quotaNuncaConsultada(),
    );

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });
  /* ─── Asiento congelado (A4 de `docs/PLAN-ASIENTOS-CONGELADOS.md`) ──────── */

  const ORG = '22222222-2222-4222-8222-222222222222';
  const PROYECTO = '11111111-1111-4111-8111-111111111111';

  /** El contexto mínimo para pedir un permiso concreto sobre un proyecto. */
  function contextoPara(userId: string, permiso: ProjectPermission) {
    const request = { user: { userId }, params: { projectId: PROYECTO } };
    const reflector = {
      get: (key: string) => (key === PROJECT_PERMISSION_KEY ? permiso : undefined),
    };
    const context = {
      getHandler: () => () => undefined,
      getClass: () => ({ name: 'ProjectsController' }),
      switchToHttp: () => ({ getRequest: () => request }),
    };
    return { reflector, context };
  }

  /** Un projects-service que devuelve un proyecto de `ORG` con el dueño dado. */
  function projectsDe(ownerId: string) {
    return {
      send: ({ cmd }: { cmd: string }) => {
        if (cmd === 'project_find_one') {
          return of({ ownerId, status: 'ACTIVE', organizationId: ORG });
        }
        return of({ allowed: true });
      },
    } as never;
  }

  it('deniega una escritura a quien tiene el asiento congelado, con SEAT_FROZEN', async () => {
    const { reflector, context } = contextoPara(
      'member-id',
      ProjectPermission.CAN_MANAGE_AUTOMATIONS,
    );
    const guard = new ProjectPermissionGuard(
      reflector as never,
      projectsDe('owner-id'),
      {} as never,
      quotaQueCongela(2),
    );

    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      response: {
        code: SEAT_FROZEN_CODE,
        details: { organizationId: ORG, puesto: 2, tope: 3 },
      },
    });
  });

  it('deja leer a quien tiene el asiento congelado: congelado es solo lectura', async () => {
    const { reflector, context } = contextoPara('member-id', ProjectPermission.CAN_VIEW_PROJECT);
    const guard = new ProjectPermissionGuard(
      reflector as never,
      projectsDe('owner-id'),
      {} as never,
      /* Si el guard preguntara por el asiento en una lectura, esto la tumbaría —
         y es justo lo que no debe pasar: pagaría un viaje TCP por cada carga de
         un tablero, además de dejar sin ver sus propios proyectos a quien está
         congelado. */
      quotaQueCongela(),
    );

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('congela también al dueño del proyecto: el que no se congela es el de la organización', async () => {
    /* 🔴 El orden es el diseño. Si la comprobación fuera después del atajo del
       dueño, cada persona congelada seguiría escribiendo con normalidad en los
       tableros que creó ella —que son los que más toca— y el congelado sería
       una cáscara. Quien nunca se congela es el dueño de la *organización* (D3),
       que se resuelve en billing-service y no tiene por qué ser esta persona. */
    const { reflector, context } = contextoPara(
      'owner-id',
      ProjectPermission.CAN_MANAGE_AUTOMATIONS,
    );
    const guard = new ProjectPermissionGuard(
      reflector as never,
      projectsDe('owner-id'),
      {} as never,
      quotaQueCongela(),
    );

    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      response: { code: SEAT_FROZEN_CODE },
    });
  });

  it('no pregunta por el asiento cuando el proyecto no tiene organización', async () => {
    const { reflector, context } = contextoPara(
      'member-id',
      ProjectPermission.CAN_MANAGE_AUTOMATIONS,
    );
    const projectsClient = {
      send: ({ cmd }: { cmd: string }) => {
        if (cmd === 'project_find_one') return of({ ownerId: 'owner-id', status: 'ACTIVE' });
        return of({ allowed: true });
      },
    };
    const guard = new ProjectPermissionGuard(
      reflector as never,
      projectsClient as never,
      {} as never,
      quotaNuncaConsultada(),
    );

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });
});
