import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PLAN_TIERS, PlanTier, SubscriptionStatus } from '@praxis/contracts';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';
import type Stripe from 'stripe';
import { StripeService } from './stripe.service';

/**
 * Lo que Stripe nos cuenta de los cobros.
 *
 * ## Esto decide el plan. La vuelta del navegador no
 *
 * ⚠️ **Es el único sitio donde se concede un plan por un pago.** La
 * `success_url` del checkout es una página que dice «gracias»: la puede visitar
 * cualquiera escribiéndola en la barra de direcciones, así que si diera el
 * plan, el plan sería gratis. Es el error clásico de esta integración y por eso
 * está escrito aquí y en `StripeService`.
 *
 * ## Por qué no lleva JWT
 *
 * Quien llama es Stripe, no una sesión: no hay token que mandar. Su
 * autenticación es **la firma** del cuerpo, que `StripeService.verifyEvent`
 * comprueba contra `STRIPE_WEBHOOK_SECRET`. Sin firma válida no se hace nada.
 *
 * ## Idempotencia
 *
 * Stripe **reintenta hasta recibir un 2xx**, y manda eventos que se solapan
 * —`checkout.session.completed` y `customer.subscription.updated` describen el
 * mismo hecho—. Todo lo que se hace aquí escribe un estado final con un
 * `upsert`, nunca un incremento ni una transición, así que repetirlo no cambia
 * nada. Y el `stripeEventId` viaja hasta `billing_events`, cuyo índice único
 * hace que el registro tampoco se duplique.
 *
 * ## Siempre 200, salvo firma inválida
 *
 * Un evento que no sabemos tratar se contesta con 200 y se ignora. Devolver un
 * error haría que Stripe lo reintentara durante días y acabara desactivando el
 * endpoint, llevándose por delante los eventos que sí importan.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly log = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripe: StripeService,
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    /* `req.rawBody` y no `req.body`: la firma se calcula sobre los bytes
       exactos, y el parser de JSON los reconstruye. Ver la nota de `main.ts`. */
    const event = this.stripe.verifyEvent(req.rawBody, signature);
    if (!event) throw new BadRequestException('Firma de Stripe inválida.');

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object, event.id);
        break;

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.onSubscriptionChanged(event.data.object, event.id);
        break;

      default:
        /* Ni un aviso por cada evento que no tratamos: Stripe manda decenas de
           tipos y llenaría el log de ruido. */
        break;
    }

    return { received: true };
  }

  /**
   * Alguien acaba de pagar.
   *
   * El `organizationId` sale de `client_reference_id`, que pusimos nosotros al
   * abrir el pago: es lo único que ata una sesión de Stripe a algo de PRAXIS.
   *
   * ⚠️ **Se contesta 200 aunque falte.** Significa que algo abrió un checkout
   * sin pasar por nuestro endpoint, y devolver un error solo conseguiría que
   * Stripe lo reintentara durante días sobre una sesión que nunca vamos a saber
   * de quién es.
   */
  private async onCheckoutCompleted(session: Stripe.Checkout.Session, eventId: string) {
    const organizationId = session.client_reference_id;
    if (!organizationId) {
      this.log.warn(`Checkout ${session.id} sin client_reference_id: no se aplica ningún plan.`);
      return;
    }

    const tier = this.planDe(session.metadata?.tier, null);
    if (!tier) {
      this.log.error(`Checkout ${session.id} sin plan reconocible: no se aplica nada.`);
      return;
    }

    await this.aplicar({
      organizationId,
      tier,
      /**
       * ⚠️ **`TRIALING` si hay mes gratis, y no `ACTIVE`.**
       *
       * Los dos dan acceso, así que la diferencia no cambia lo que se puede
       * hacer — cambia lo que se puede **decir**. Sin este estado la pantalla no
       * podría avisar de que el cobro llega el mes que viene, que es justo la
       * trampa 3 del encargo: «no me avisaron» es la queja más cara de este
       * terreno.
       */
      status:
        session.subscription && sesionEnPrueba(session)
          ? SubscriptionStatus.TRIALING
          : SubscriptionStatus.ACTIVE,
      seats: Number(session.metadata?.seats) || undefined,
      stripeCustomerId: idDe(session.customer),
      stripeSubscriptionId: idDe(session.subscription),
      stripeEventId: eventId,
    });
  }

  /**
   * La suscripción cambió de estado, o se acabó.
   *
   * ⚠️ Aquí **no llega el identificador de la organización en el cuerpo del
   * evento**, salvo por los metadatos que le pusimos al crearla. Se intenta por
   * ahí primero y, si no está —una suscripción anterior a esta etapa, o creada a
   * mano en el panel de Stripe—, se busca por el id de la suscripción, que sí
   * guardamos.
   */
  private async onSubscriptionChanged(subscription: Stripe.Subscription, eventId: string) {
    const guardada = await firstValueFrom(
      this.billingClient.send<{ organizationId: string; tier: PlanTier } | null>(
        { cmd: 'billing_by_stripe_subscription' },
        { stripeSubscriptionId: subscription.id },
      ),
    ).catch(() => null);

    const organizationId = subscription.metadata?.organizationId || guardada?.organizationId;
    if (!organizationId) {
      this.log.warn(`Suscripción ${subscription.id} sin organización asociada: se ignora.`);
      return;
    }

    const tier = this.planDe(
      subscription.metadata?.tier,
      subscription.items.data[0]?.price?.id ?? null,
      guardada?.tier,
    );
    if (!tier) {
      this.log.error(`Suscripción ${subscription.id} sin plan reconocible: se ignora.`);
      return;
    }

    const status = traducirEstado(subscription.status);

    await this.aplicar({
      organizationId,
      /**
       * ⚠️ **Al caerse la suscripción, el plan vuelve a FREE de verdad.**
       *
       * Guardar el plan contratado con estado `CANCELED` habría dejado una fila
       * que dice BUSINESS, y cualquier consulta que mirase `tier` sin mirar
       * `status` —hoy no hay ninguna, mañana quién sabe— regalaría el plan más
       * caro. Con `FREE` dentro, olvidarse de mirar el estado falla hacia el
       * lado seguro.
       */
      tier: status === SubscriptionStatus.CANCELED ? PlanTier.FREE : tier,
      status,
      seats: subscription.items.data[0]?.quantity ?? undefined,
      stripeCustomerId: idDe(subscription.customer),
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price?.id ?? null,
      trialEndsAt: enIso(subscription.trial_end),
      cancelAt: enIso(subscription.cancel_at),
      stripeEventId: eventId,
    });
  }

  /**
   * Qué plan es, mirando los metadatos primero y el precio después.
   *
   * ⚠️ El orden importa: el id del precio solo se puede traducir si **este**
   * gateway tiene esa variable de entorno puesta, y el que atiende el webhook no
   * tiene por qué ser el mismo que abrió el checkout. Los metadatos viajan con
   * la suscripción y no dependen de la configuración de nadie.
   */
  private planDe(
    deMetadatos: string | undefined,
    priceId: string | null,
    guardado?: PlanTier,
  ): PlanTier | null {
    const candidato = deMetadatos as PlanTier | undefined;
    /* `PLAN_TIERS.includes` y no `candidato in PlanTier`: lo segundo funciona
       hoy **por accidente**, porque las claves del enum coinciden con sus
       valores. El día que alguien escriba `PLUS = 'plus'` deja de funcionar sin
       dar ningún error de tipos. */
    if (candidato && PLAN_TIERS.includes(candidato)) return candidato;
    return this.stripe.planDePrecio(priceId) ?? guardado ?? null;
  }

  private async aplicar(datos: Record<string, unknown>) {
    await firstValueFrom(this.billingClient.send({ cmd: 'billing_apply_plan' }, datos)).catch(
      (error: Error) => {
        /**
         * ⚠️ Se traga el error **a propósito**, y es la decisión más discutible de
         * este archivo. Si esto sube, el manejador responde 500 y Stripe reintenta;
         * con billing-service caído, ese reintento tampoco funcionaría, y a los
         * pocos días Stripe desactiva el endpoint entero.
         *
         * El pago está cobrado y registrado en Stripe pase lo que pase aquí, así
         * que la vía de recuperación es el registro: queda escrito quién pagó y
         * qué plan había que darle, y se aplica a mano desde administración.
         */
        this.log.error(
          `No se pudo aplicar ${datos.tier} a la organización ${datos.organizationId} ` +
            `(suscripción ${datos.stripeSubscriptionId}): ${error.message}`,
        );
      },
    );
  }
}

/**
 * Los ocho estados de Stripe, en los cuatro nuestros.
 *
 * ⚠️ `active` y `trialing` son las dos formas de estar al día. `past_due` y
 * `unpaid` son un cobro que falló y Stripe sigue intentando: **no cortan el
 * acceso**, porque una tarjeta caducada es lo más común del mundo y quitarle
 * los proyectos a alguien por eso es la peor forma de enterarse. Todo lo demás
 * —cancelada, incompleta, caducada, pausada— es no tener plan.
 */
function traducirEstado(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
      return SubscriptionStatus.ACTIVE;
    case 'trialing':
      return SubscriptionStatus.TRIALING;
    case 'past_due':
    case 'unpaid':
      return SubscriptionStatus.PAST_DUE;
    default:
      return SubscriptionStatus.CANCELED;
  }
}

/** ¿La sesión abrió una suscripción en periodo de prueba? */
function sesionEnPrueba(session: Stripe.Checkout.Session): boolean {
  const suscripcion = session.subscription;
  if (!suscripcion || typeof suscripcion === 'string') {
    /* Sin expandir no se puede saber, y **se asume que no**: marcar `TRIALING`
       de más diría en la pantalla que hay un mes gratis que quizá no existe, y
       prometer gratis lo que se cobra es peor que lo contrario. El evento de
       `customer.subscription.updated` llega justo después con el estado real. */
    return false;
  }
  return suscripcion.status === 'trialing';
}

/** Los segundos de Stripe, en ISO. `null` se queda en `null`. */
function enIso(segundos: number | null | undefined): string | null {
  return segundos ? new Date(segundos * 1000).toISOString() : null;
}

/**
 * Stripe devuelve unos campos como id y otros como el objeto entero, según lo
 * que se haya pedido expandir. Esto se queda con el id en los dos casos.
 */
function idDe(valor: string | { id: string } | null | undefined): string | null {
  if (!valor) return null;
  return typeof valor === 'string' ? valor : valor.id;
}
