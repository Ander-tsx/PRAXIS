import { Injectable, Logger } from '@nestjs/common';
import { PlanTier, SubscriptionStatus } from '@praxis/contracts';
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
    const fecha = (valor?: string | null) => (valor ? new Date(valor) : null);

    const comun = {
      tier: datos.tier,
      status: datos.status,
      ...(datos.seats !== undefined ? { seats: datos.seats } : {}),
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
      create: { organizationId: datos.organizationId, seats: datos.seats ?? 1, ...comun },
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
