import { Injectable, Logger } from '@nestjs/common';
import {
  PLANS,
  PlanTier,
  SIN_TOPE,
  SubscriptionStatus,
  asientosContratados,
} from '@praxis/contracts';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Lo que el webhook de Stripe deja escrito.
 *
 * ## Todo lo de aquí es idempotente, y no por elegancia
 *
 * Stripe **reintenta hasta recibir un 2xx** y manda eventos que se solapan:
 * `checkout.session.completed` y `customer.subscription.updated` describen el
 * mismo hecho. Por eso nada de este archivo incrementa ni transiciona: escribe
 * un **estado final** con un `upsert`. Repetirlo no cambia nada.
 *
 * ## Y todo deja instante
 *
 * 🔴 La trampa 3 del encargo: *«el mes gratis se cobra al segundo, y eso hay que
 * poder demostrarlo»*. Cada aplicación de plan escribe una fila en
 * `billing_events` con el identificador del evento de Stripe que la causó. Es lo
 * que convierte «no me avisaron» en una consulta.
 */
@Injectable()
export class SubscriptionsService {
  private readonly log = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deja el plan de una organización como dice Stripe.
   *
   * ⚠️ `organizationId` llega del `client_reference_id` del checkout, que lo
   * pusimos nosotros al abrirlo. Es lo único que ata una sesión de Stripe a algo
   * de PRAXIS: Stripe no conoce nuestras organizaciones.
   */
  async aplicar(datos: {
    organizationId: string;
    tier: PlanTier;
    status: SubscriptionStatus;
    seats?: number;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripePriceId?: string | null;
    trialEndsAt?: string | null;
    currentPeriodEnd?: string | null;
    cancelAt?: string | null;
    stripeEventId?: string | null;
  }) {
    /* 🔴 **Un plan concedido no lo pisa Stripe.** Cancelar la suscripción de
       pago que había antes de la concesión manda eventos de esa suscripción, y
       aplicarlos bajaría la organización a Gratis. Se anotan y se ignoran. */
    const actual = await this.prisma.subscription.findUnique({
      where: { organizationId: datos.organizationId },
      select: { grantedBy: true },
    });
    if (actual?.grantedBy) {
      this.log.warn(
        `Evento de Stripe ignorado para ${datos.organizationId}: tiene un plan concedido.`,
      );
      await this.registrar(
        datos.organizationId,
        'evento_ignorado_por_concesion',
        datos.stripeEventId ?? null,
        {
          tier: datos.tier,
          status: datos.status,
          stripeSubscriptionId: datos.stripeSubscriptionId ?? null,
        },
      );
      return actual;
    }

    const fecha = (valor?: string | null) => (valor ? new Date(valor) : null);
    /* 🔴 En un plan de precio fijo la cantidad de Stripe es 1 y no son los
       asientos: se guarda el tope del plan. Ver `precioFijo` en contracts. */
    const seats = asientosContratados(datos.tier, datos.seats);

    const comun = {
      tier: datos.tier,
      status: datos.status,
      ...(seats !== undefined ? { seats } : {}),
      stripeCustomerId: datos.stripeCustomerId ?? undefined,
      stripeSubscriptionId: datos.stripeSubscriptionId ?? undefined,
      stripePriceId: datos.stripePriceId ?? undefined,
      trialEndsAt: fecha(datos.trialEndsAt),
      currentPeriodEnd: fecha(datos.currentPeriodEnd),
      cancelAt: fecha(datos.cancelAt),
      canceledAt: datos.status === SubscriptionStatus.CANCELED ? new Date() : null,
    };

    const suscripcion = await this.prisma.subscription.upsert({
      where: { organizationId: datos.organizationId },
      create: { organizationId: datos.organizationId, seats: seats ?? 1, ...comun },
      update: comun,
    });

    await this.registrar(datos.organizationId, 'plan_aplicado', datos.stripeEventId ?? null, {
      tier: datos.tier,
      status: datos.status,
      seats: suscripcion.seats,
      trialEndsAt: datos.trialEndsAt ?? null,
    });

    return suscripcion;
  }

  /**
   * Concede un plan a una organización **sin Stripe**, desde administración.
   *
   * Deja la fila como una suscripción `ACTIVE` del plan, sin fechas de prueba
   * ni de baja, y con `grantedBy`: desde ese momento el webhook no la toca. El
   * `stripeCustomerId` se conserva a propósito —el portal sigue sirviendo para
   * cancelar lo que se pagaba antes—, pero se suelta el de la suscripción.
   *
   * Los asientos: el tope del plan, o 1.000 en uno sin tope (Empresa).
   * `min(seats, quotas.asientos)` usa este número cuando el plan no tiene
   * tope, así que no puede quedarse en el 1 de una organización personal.
   */
  async conceder(datos: { organizationId: string; tier: PlanTier; grantedBy: string }) {
    const tope = PLANS[datos.tier]?.quotas.asientos;
    const seats = tope === SIN_TOPE || tope === undefined ? 1_000 : tope;
    const comun = {
      tier: datos.tier,
      status: SubscriptionStatus.ACTIVE,
      seats,
      stripeSubscriptionId: null,
      stripePriceId: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAt: null,
      canceledAt: null,
      grantedBy: datos.grantedBy,
      grantedAt: new Date(),
    };
    const suscripcion = await this.prisma.subscription.upsert({
      where: { organizationId: datos.organizationId },
      create: { organizationId: datos.organizationId, ...comun },
      update: comun,
    });
    await this.registrar(datos.organizationId, 'plan_concedido', null, {
      tier: datos.tier,
      grantedBy: datos.grantedBy,
    });
    return suscripcion;
  }

  /**
   * Retira un plan concedido: la organización vuelve a Gratis y, desde ese
   * momento, vuelve a mandar Stripe. Una organización sin concesión no se toca
   * (404): esto no sirve para cancelar un plan pagado.
   */
  async retirarConcesion(datos: { organizationId: string; by: string }) {
    const actual = await this.prisma.subscription.findUnique({
      where: { organizationId: datos.organizationId },
      select: { grantedBy: true, tier: true },
    });
    if (!actual?.grantedBy) {
      return {
        error: 'Esa organización no tiene un plan concedido.',
        codigo: 'NO_EXISTE' as const,
      };
    }

    const suscripcion = await this.prisma.subscription.update({
      where: { organizationId: datos.organizationId },
      data: {
        tier: PlanTier.FREE,
        status: SubscriptionStatus.ACTIVE,
        seats: 1,
        grantedBy: null,
        grantedAt: null,
      },
    });
    await this.registrar(datos.organizationId, 'plan_retirado', null, {
      tier: actual.tier,
      by: datos.by,
    });
    return suscripcion;
  }

  /**
   * De qué organización es una suscripción de Stripe.
   *
   * ⚠️ Los eventos de cambio y de baja **no traen nuestro identificador**: solo
   * lo que es de Stripe. Se busca por el de la suscripción, que sí guardamos al
   * aplicar el plan la primera vez.
   */
  porSuscripcionDeStripe(stripeSubscriptionId: string) {
    return this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
      select: { organizationId: true, tier: true, seats: true },
    });
  }

  /**
   * ¿Puede esta persona estrenar el mes gratis en esta organización?
   *
   * No, si ya lo usó ella —en cualquier organización— o si esa organización ya
   * lo tuvo con otra persona. Ver `TrialRedemption` en el esquema.
   */
  async pruebaDisponible(userId: string, organizationId: string): Promise<boolean> {
    const usada = await this.prisma.trialRedemption.findFirst({
      where: { OR: [{ userId }, { organizationId }] },
      select: { id: true },
    });
    return usada === null;
  }

  /**
   * Deja escrito que una suscripción estrenó el mes gratis.
   *
   * 🔴 **Es la garantía, no el checkout.** Devuelve `{ canjeada: false }` cuando
   * esta persona u organización ya tenía una prueba **de otra suscripción**: dos
   * checkouts abiertos a la vez pasan los dos la comprobación previa, y quien
   * llama tiene que cortar la prueba sobrante en Stripe.
   *
   * Idempotente: Stripe repite eventos, y la misma suscripción vuelve a dar
   * `true`.
   */
  async canjearPrueba(datos: {
    userId: string;
    organizationId: string;
    stripeSubscriptionId: string;
    tier: PlanTier;
  }): Promise<{ canjeada: boolean }> {
    const previa = await this.prisma.trialRedemption.findFirst({
      where: { OR: [{ userId: datos.userId }, { organizationId: datos.organizationId }] },
    });
    if (previa) return { canjeada: previa.stripeSubscriptionId === datos.stripeSubscriptionId };

    try {
      await this.prisma.trialRedemption.create({ data: datos });
    } catch (error) {
      /* La carrera: otra suscripción de esta persona se escribió entre la
         lectura y aquí. El índice único lo decide. */
      if ((error as { code?: string }).code === 'P2002') {
        const ganadora = await this.prisma.trialRedemption.findUnique({
          where: { userId: datos.userId },
        });
        return { canjeada: ganadora?.stripeSubscriptionId === datos.stripeSubscriptionId };
      }
      throw error;
    }

    await this.registrar(datos.organizationId, 'prueba_canjeada', null, {
      userId: datos.userId,
      tier: datos.tier,
    });
    return { canjeada: true };
  }

  /** La suscripción de una organización, o `null` si nunca ha pagado nada. */
  deOrganizacion(organizationId: string) {
    return this.prisma.subscription.findUnique({ where: { organizationId } });
  }

  /**
   * El cliente de Stripe de alguien, para reabrir el portal o reutilizarlo.
   *
   * Mira **todas las organizaciones de las que es dueño** —la personal y las de
   * empresa—, que son los sitios donde puede haber pagado él.
   *
   * ⚠️ **No crea la organización personal, y antes sí lo hacía.** Esto lo llama
   * cada carga de `/me/billing/resumen` y de la tarjeta de Configuración: crear
   * la fila aquí convertía en escritura una pantalla que solo mira, para todas
   * las cuentas del sistema. Sin fila no hay cliente de Stripe, que es
   * exactamente la respuesta correcta.
   */
  async clienteDe(userId: string) {
    const propia = await this.prisma.organization.findFirst({
      where: { ownerUserId: userId, subscription: { stripeCustomerId: { not: null } } },
      include: { subscription: true },
      /* Si hubiera varias, la personal primero: es la que abre el portal de un
         plan individual, que es el caso de casi todo el mundo que llega aquí. */
      orderBy: { kind: 'asc' },
    });

    return {
      organizationId: propia?.id ?? null,
      stripeCustomerId: propia?.subscription?.stripeCustomerId ?? null,
    };
  }

  /**
   * Cambia los asientos contratados.
   *
   * ⚠️ **No deja bajar por debajo de lo ocupado.** Bajar asientos con gente
   * dentro dejaría la organización por encima de lo que paga sin que nadie haya
   * hecho nada mal, y la única salida sería echar a alguien automáticamente —que
   * es justo lo que la trampa 4 del encargo prohíbe—. Se dice el número y se
   * deja que lo arregle quien administra.
   */
  async cambiarAsientos(organizationId: string, seats: number) {
    const ocupados = await this.prisma.organizationMember.count({ where: { organizationId } });
    if (seats < ocupados) {
      return {
        error: `Hay ${ocupados} asientos ocupados, contando invitaciones pendientes. Saca a alguien antes de bajar a ${seats}.`,
        codigo: 'NO_VALE' as const,
      };
    }

    const suscripcion = await this.prisma.subscription.update({
      where: { organizationId },
      data: { seats },
    });
    await this.registrar(organizationId, 'asientos_cambiados', null, { seats });
    return suscripcion;
  }

  /**
   * Una línea del registro.
   *
   * ⚠️ El `stripeEventId` es único **y esa es la idempotencia real**: si Stripe
   * reenvía el mismo evento, el índice lo rechaza y aquí se ignora. Comprobarlo
   * antes con un `SELECT` tendría una carrera entre la lectura y la escritura;
   * dejar que lo diga el índice, no.
   */
  private async registrar(
    organizationId: string,
    type: string,
    stripeEventId: string | null,
    payload: unknown,
  ) {
    await this.prisma.billingEvent
      .create({ data: { organizationId, type, stripeEventId, payload: payload as never } })
      .catch((error: { code?: string; message: string }) => {
        if (error.code === 'P2002') return;
        this.log.error(`No se pudo registrar «${type}» de ${organizationId}: ${error.message}`);
      });
  }

  /** El registro de una organización, para el portal. Lo más reciente primero. */
  historial(organizationId: string, limite = 50) {
    return this.prisma.billingEvent.findMany({
      where: { organizationId },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(Math.max(limite, 1), 200),
    });
  }
}
