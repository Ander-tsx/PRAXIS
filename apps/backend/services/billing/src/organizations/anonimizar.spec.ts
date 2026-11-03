import { OrganizationKind, PlanTier, SubscriptionStatus } from '../generated/prisma-client';
import { OrganizationsService } from './organizations.service';

interface Org {
  id: string;
  kind: OrganizationKind;
  subscription: { tier: PlanTier; status: SubscriptionStatus } | null;
}

/** Un billing con lo mínimo que mira `anonimizarPersona`, y un registro de lo que escribió. */
function montar(opciones: { orgs: Org[]; herederoPor: Record<string, string | null> }) {
  const escrituras: Array<{ op: string; args: unknown }> = [];
  const olvidos: string[] = [];
  const prisma = {
    organization: {
      findMany: async () => opciones.orgs,
      update: async (args: unknown) => void escrituras.push({ op: 'org.update', args }),
    },
    organizationMember: {
      deleteMany: async (args: unknown) => {
        escrituras.push({ op: 'member.deleteMany', args });
        return { count: 1 };
      },
      updateMany: async (args: unknown) => {
        escrituras.push({ op: 'member.updateMany', args });
        return { count: 1 };
      },
      /* El primero que se pide es la fila de la dueña (roleId); el segundo, el heredero. */
      findFirst: async (args: {
        where: { organizationId: string; userId?: unknown; roleId?: string };
      }) => {
        if (args.where.roleId === undefined) return { roleId: 'rol-admin' };
        const heredero = opciones.herederoPor[args.where.organizationId];
        return heredero ? { userId: heredero } : null;
      },
    },
  };
  const redis = {
    olvidarOrganizacion: async (id: string) => void olvidos.push(`org:${id}`),
    olvidarUsuario: async (id: string) => void olvidos.push(`user:${id}`),
  };
  const servicio = new OrganizationsService(
    prisma as never,
    redis as never,
    { get: () => undefined } as never,
  );
  return { servicio, escrituras, olvidos };
}

const equipo = (id: string, plan: PlanTier = PlanTier.FREE): Org => ({
  id,
  kind: OrganizationKind.ENTERPRISE,
  subscription: { tier: plan, status: SubscriptionStatus.ACTIVE },
});

describe('OrganizationsService.anonimizarPersona', () => {
  it('con otra persona del mismo papel, la propiedad pasa a ella y se libera el asiento', async () => {
    const { servicio, escrituras, olvidos } = montar({
      orgs: [equipo('org-1')],
      herederoPor: { 'org-1': 'ana' },
    });
    const resultado = await servicio.anonimizarPersona('u-1', 'baja@ejemplo.com');

    expect(resultado.transferidas).toEqual(['org-1']);
    expect(resultado.huerfanas).toEqual([]);
    expect(escrituras).toContainEqual({
      op: 'org.update',
      args: { where: { id: 'org-1' }, data: { ownerUserId: 'ana' } },
    });
    // Ya no es dueña de ninguna: su membresía se borra en todas.
    expect(escrituras).toContainEqual({
      op: 'member.deleteMany',
      args: { where: { userId: 'u-1', organizationId: { notIn: [] } } },
    });
    expect(olvidos).toEqual(expect.arrayContaining(['org:org-1', 'user:ana', 'user:u-1']));
  });

  it('🔴 sin heredero la organización se conserva intacta y se avisa, con su plan', async () => {
    const { servicio, escrituras } = montar({
      orgs: [equipo('org-2', PlanTier.PRO)],
      herederoPor: { 'org-2': null },
    });
    const resultado = await servicio.anonimizarPersona('u-1', 'baja@ejemplo.com');

    expect(resultado.transferidas).toEqual([]);
    expect(resultado.huerfanas).toEqual([{ organizationId: 'org-2', plan: 'PRO/ACTIVE' }]);
    expect(escrituras.some((e) => e.op === 'org.update')).toBe(false);
    // Su membresía en la huérfana NO se borra: solo se anonimiza el correo.
    expect(escrituras).toContainEqual({
      op: 'member.deleteMany',
      args: { where: { userId: 'u-1', organizationId: { notIn: ['org-2'] } } },
    });
  });

  it('🔴 el heredero se busca con el MISMO papel: alguien con menos papel nunca recibe la facturación', async () => {
    const buscado: unknown[] = [];
    const { servicio } = montar({ orgs: [equipo('org-1')], herederoPor: {} });
    const original = (
      servicio as unknown as { prisma: { organizationMember: { findFirst: unknown } } }
    ).prisma.organizationMember;
    const anterior = original.findFirst as (args: unknown) => Promise<unknown>;
    original.findFirst = async (args: unknown) => {
      buscado.push(args);
      return anterior(args);
    };
    await servicio.anonimizarPersona('u-1', 'baja@ejemplo.com');
    const busqueda = buscado.find(
      (args) => (args as { where: { roleId?: string } }).where.roleId,
    ) as {
      where: Record<string, unknown>;
      orderBy: unknown;
    };
    expect(busqueda.where).toMatchObject({ roleId: 'rol-admin', status: 'ACTIVE' });
    expect(busqueda.orderBy).toEqual({ joinedAt: 'asc' });
  });

  it('la organización personal no se toca: sigue siendo suya y solo se anonimiza el correo', async () => {
    const { servicio, escrituras } = montar({
      orgs: [{ id: 'personal', kind: OrganizationKind.PERSONAL, subscription: null }],
      herederoPor: {},
    });
    const resultado = await servicio.anonimizarPersona('u-1', 'baja@ejemplo.com');
    expect(resultado.transferidas).toEqual([]);
    expect(resultado.huerfanas).toEqual([]);
    expect(escrituras.some((e) => e.op === 'org.update')).toBe(false);
    expect(escrituras).toContainEqual({
      op: 'member.deleteMany',
      args: { where: { userId: 'u-1', organizationId: { notIn: ['personal'] } } },
    });
  });

  it('borra solo las invitaciones PENDIENTES a su correo y anonimiza el de sus membresías', async () => {
    const { servicio, escrituras } = montar({ orgs: [], herederoPor: {} });
    await servicio.anonimizarPersona('u-1', 'Baja@Ejemplo.com');
    expect(escrituras[0]).toEqual({
      op: 'member.deleteMany',
      args: {
        where: { status: 'INVITED', email: { equals: 'Baja@Ejemplo.com', mode: 'insensitive' } },
      },
    });
    expect(escrituras).toContainEqual({
      op: 'member.updateMany',
      args: { where: { userId: 'u-1' }, data: { email: 'eliminada-u-1@eliminada.invalid' } },
    });
  });
});
