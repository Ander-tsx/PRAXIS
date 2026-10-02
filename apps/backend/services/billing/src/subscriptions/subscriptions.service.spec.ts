import { PlanTier, SubscriptionStatus } from '@praxis/contracts';
import type { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

/**
 * El mes gratis, una vez por persona y por organización; y los asientos de un
 * plan de precio fijo. Las dos cosas fallan sin dar ningún error: la primera
 * regala el plan para siempre, la segunda congela al equipo.
 */
describe('SubscriptionsService', () => {
  const canjes: {
    userId: string;
    organizationId: string;
    stripeSubscriptionId: string | null;
  }[] = [];
  let escrito: { seats?: number; grantedBy?: string | null; tier?: string } = {};
  let fila: { grantedBy: string | null; tier: string } | null = null;

  const prisma = {
    trialRedemption: {
      findFirst: jest.fn(
        async ({ where }: { where: { OR: { userId?: string; organizationId?: string }[] } }) =>
          canjes.find((c) =>
            where.OR.some((o) => o.userId === c.userId || o.organizationId === c.organizationId),
          ) ?? null,
      ),
      findUnique: jest.fn(
        async ({ where }: { where: { userId: string } }) =>
          canjes.find((c) => c.userId === where.userId) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: (typeof canjes)[number] }) => {
        canjes.push(data);
        return data;
      }),
    },
    subscription: {
      findUnique: jest.fn(async () => fila),
      upsert: jest.fn(async ({ create }: { create: typeof escrito }) => {
        escrito = create;
        return create;
      }),
      update: jest.fn(async ({ data }: { data: typeof escrito }) => {
        escrito = data;
        return data;
      }),
    },
    billingEvent: { create: jest.fn(async () => ({})) },
  };

  const servicio = new SubscriptionsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    canjes.length = 0;
    escrito = {};
    fila = null;
    jest.clearAllMocks();
  });

  const canje = (userId: string, organizationId: string, stripeSubscriptionId: string) =>
    servicio.canjearPrueba({ userId, organizationId, stripeSubscriptionId, tier: PlanTier.PRO });

  it('la primera prueba se canjea, y repetir el mismo evento no la invalida', async () => {
    expect(await canje('ana', 'org-1', 'sub_1')).toEqual({ canjeada: true });
    expect(await canje('ana', 'org-1', 'sub_1')).toEqual({ canjeada: true });
  });

  it('🔴 cancelar y volver a suscribirse no da otro mes gratis', async () => {
    await canje('ana', 'org-1', 'sub_1');

    expect(await servicio.pruebaDisponible('ana', 'org-1')).toBe(false);
    expect(await canje('ana', 'org-1', 'sub_2')).toEqual({ canjeada: false });
  });

  it('🔴 tampoco en otra de sus organizaciones', async () => {
    await canje('ana', 'org-1', 'sub_1');

    expect(await servicio.pruebaDisponible('ana', 'org-2')).toBe(false);
    expect(await canje('ana', 'org-2', 'sub_2')).toEqual({ canjeada: false });
  });

  it('una organización que ya la tuvo no la vuelve a tener con otro dueño', async () => {
    await canje('ana', 'org-1', 'sub_1');

    expect(await servicio.pruebaDisponible('beto', 'org-1')).toBe(false);
  });

  it('otra persona en otra organización sí la tiene', async () => {
    await canje('ana', 'org-1', 'sub_1');

    expect(await servicio.pruebaDisponible('beto', 'org-2')).toBe(true);
  });

  it('🔴 un Pro guarda los asientos del plan, no la cantidad 1 de Stripe', async () => {
    await servicio.aplicar({
      organizationId: 'org-1',
      tier: PlanTier.PRO,
      status: SubscriptionStatus.TRIALING,
      seats: 1,
    });
    expect(escrito.seats).toBe(7);
  });

  it('un plan por asiento guarda la cantidad de Stripe', async () => {
    await servicio.aplicar({
      organizationId: 'org-1',
      tier: PlanTier.TEAM,
      status: SubscriptionStatus.ACTIVE,
      seats: 4,
    });
    expect(escrito.seats).toBe(4);
  });

  it('🔴 con un plan concedido, los eventos de Stripe no tocan la fila', async () => {
    fila = { grantedBy: 'admin', tier: PlanTier.ENTERPRISE };
    await servicio.aplicar({
      organizationId: 'org-1',
      tier: PlanTier.FREE,
      status: SubscriptionStatus.CANCELED,
      seats: 7,
    });
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it('conceder Empresa deja la fila activa, sin Stripe y con asientos de sobra', async () => {
    await servicio.conceder({
      organizationId: 'org-1',
      tier: PlanTier.ENTERPRISE,
      grantedBy: 'admin',
    });
    expect(escrito).toMatchObject({
      tier: PlanTier.ENTERPRISE,
      status: SubscriptionStatus.ACTIVE,
      seats: 1_000,
      grantedBy: 'admin',
      stripeSubscriptionId: null,
      trialEndsAt: null,
    });
  });

  it('retirar solo vale con un plan concedido, y vuelve a Gratis', async () => {
    expect(await servicio.retirarConcesion({ organizationId: 'org-1', by: 'admin' })).toMatchObject(
      {
        codigo: 'NO_EXISTE',
      },
    );
    fila = { grantedBy: 'admin', tier: PlanTier.ENTERPRISE };
    await servicio.retirarConcesion({ organizationId: 'org-1', by: 'admin' });
    expect(escrito).toMatchObject({ tier: PlanTier.FREE, grantedBy: null });
  });
});
