import { OrganizationKind, PlanTier, SubscriptionStatus } from '../generated/prisma-client';
import { OrganizationsService } from './organizations.service';

/** Una organización con lo mínimo que mira `eliminar`. */
function organizacion(sobre: Record<string, unknown> = {}) {
  return {
    id: 'org-1',
    kind: OrganizationKind.ENTERPRISE,
    ownerUserId: 'dueno',
    subscription: { tier: PlanTier.FREE, status: SubscriptionStatus.ACTIVE },
    ...sobre,
  };
}

function montar(org: ReturnType<typeof organizacion> | null, propias = 2) {
  const llamadas: string[] = [];
  const tx = {
    organizationMember: { deleteMany: async () => void llamadas.push('miembros') },
    organizationRole: { deleteMany: async () => void llamadas.push('papeles') },
    projectRoleTemplate: { deleteMany: async () => void llamadas.push('plantillas') },
    organization: { delete: async () => void llamadas.push('organizacion') },
  };
  const prisma = {
    organization: { findUnique: async () => org, count: async () => propias },
    organizationMember: {
      findMany: async () => [{ userId: 'dueno' }, { userId: 'ana' }, { userId: null }],
    },
    $transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
  };
  const olvidados: string[] = [];
  const redis = {
    olvidarOrganizacion: async () => void olvidados.push('org'),
    olvidarUsuario: async (id: string) => void olvidados.push(id),
  };
  const servicio = new OrganizationsService(
    prisma as never,
    redis as never,
    { get: () => undefined } as never,
  );
  return { servicio, llamadas, olvidados };
}

describe('OrganizationsService.eliminar', () => {
  it('borra miembros y papeles antes que la organización, y olvida la caché de todos', async () => {
    const { servicio, llamadas, olvidados } = montar(organizacion());
    const res = await servicio.eliminar({ organizationId: 'org-1', porUserId: 'dueno' });
    expect(res).toEqual({ ok: true });
    /* `OrganizationMember.roleId` es Restrict: los miembros tienen que ir primero. */
    expect(llamadas).toEqual(['miembros', 'papeles', 'plantillas', 'organizacion']);
    expect(olvidados).toEqual(expect.arrayContaining(['org', 'dueno', 'ana']));
  });

  it('solo la elimina su dueño', async () => {
    const { servicio, llamadas } = montar(organizacion());
    const res = await servicio.eliminar({ organizationId: 'org-1', porUserId: 'otra-persona' });
    expect(res).toMatchObject({ codigo: 'SIN_PERMISO' });
    expect(llamadas).toEqual([]);
  });

  it('elimina el espacio personal si le queda otra organización propia', async () => {
    const { servicio, llamadas } = montar(organizacion({ kind: OrganizationKind.PERSONAL }), 2);
    const res = await servicio.eliminar({ organizationId: 'org-1', porUserId: 'dueno' });
    expect(res).toEqual({ ok: true });
    expect(llamadas).toContain('organizacion');
  });

  it('no elimina la única organización propia, sea cual sea', async () => {
    for (const kind of [OrganizationKind.PERSONAL, OrganizationKind.ENTERPRISE]) {
      const { servicio, llamadas } = montar(organizacion({ kind }), 1);
      const res = await servicio.eliminar({ organizationId: 'org-1', porUserId: 'dueno' });
      expect(res).toMatchObject({ codigo: 'NO_VALE' });
      expect(llamadas).toEqual([]);
    }
  });

  it('no elimina con una suscripción de pago viva: borrarla no deja de cobrarla', async () => {
    for (const status of [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.TRIALING,
      SubscriptionStatus.PAST_DUE,
    ]) {
      const { servicio, llamadas } = montar(
        organizacion({ subscription: { tier: PlanTier.PRO, status } }),
      );
      const res = await servicio.eliminar({ organizationId: 'org-1', porUserId: 'dueno' });
      expect(res).toMatchObject({ codigo: 'EN_USO' });
      expect(llamadas).toEqual([]);
    }
  });

  it('sí elimina si la suscripción de pago ya está cancelada', async () => {
    const { servicio } = montar(
      organizacion({ subscription: { tier: PlanTier.PRO, status: SubscriptionStatus.CANCELED } }),
    );
    expect(await servicio.eliminar({ organizationId: 'org-1', porUserId: 'dueno' })).toEqual({
      ok: true,
    });
  });

  it('una organización que no existe da NO_EXISTE', async () => {
    const { servicio } = montar(null);
    expect(await servicio.eliminar({ organizationId: 'x', porUserId: 'dueno' })).toMatchObject({
      codigo: 'NO_EXISTE',
    });
  });
});
