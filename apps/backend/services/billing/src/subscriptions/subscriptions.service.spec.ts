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
  let escrito: { seats?: number } = {};

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
      upsert: jest.fn(async ({ create }: { create: { seats: number } }) => {
        escrito = create;
        return create;
      }),
    },
    billingEvent: { create: jest.fn(async () => ({})) },
  };

  const servicio = new SubscriptionsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    canjes.length = 0;
    escrito = {};
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
});
