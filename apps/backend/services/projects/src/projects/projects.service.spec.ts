/// <reference types="jest" />

import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  it('crea el rol Administrador con permisos explícitos de automatizaciones e integraciones', async () => {
    let permisosDelRol: Record<string, boolean> | undefined;

    const prisma = {
      $transaction: async (callback: (tx: unknown) => unknown) =>
        callback({
          project: {
            findUnique: async () => null,
            create: async () => ({ id: 'project-id' }),
          },
          projectRole: {
            create: async ({ data }: { data: { permissions: Record<string, boolean> } }) => {
              permisosDelRol = data.permissions;
              return { id: 'admin-role-id' };
            },
          },
          projectMember: { create: async () => ({ id: 'member-id' }) },
        }),
      findUnique: async () => null,
    };
    const redis = { del: async () => 1 };
    const service = new ProjectsService(prisma as never, redis as never);

    await service.createProject({
      name: 'Automatizaciones',
      ownerId: '11111111-1111-4111-8111-111111111111',
    });

    expect(permisosDelRol).toMatchObject({
      canManageAutomations: true,
      canManageIntegrations: true,
    });
  });
});
