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
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';
import type Stripe from 'stripe';
import { StripeService } from './stripe.service';

/**
 * Lo que Stripe nos cuenta de los cobros.
 *
 * ## Esto decide el plan. La vuelta del navegador no
 *
 * ⚠️ **Es el único sitio donde se concede PRO por un pago.** La `success_url`
 * del checkout es una página que dice «gracias»: la puede visitar cualquiera
 * escribiéndola en la barra de direcciones, así que si diera el plan, el plan
 * sería gratis. Es el error clásico de esta integración y por eso está escrito
 * aquí y en `StripeService`.
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
 * nada.
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
    @Inject('ASSISTANT_SERVICE') private readonly assistantClient: ClientProxy,
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
        await this.onCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.onSubscriptionChanged(event.data.object);
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
   * El `userId` sale de `client_reference_id`, que pusimos nosotros al abrir el
   * pago: es lo único que ata una sesión de Stripe a una cuenta de PRAXIS.
   */
  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.client_reference_id;
    if (!userId) {
      /* Sin referencia no hay a quién dárselo. Se avisa porque significa que
         algo abrió un checkout sin pasar por nuestro endpoint. */
      this.log.warn(`Checkout ${session.id} sin client_reference_id: no se aplica ningún plan.`);
      return;
    }

    await this.aplicar({
      userId,
      plan: 'PRO',
      stripeCustomerId: idDe(session.customer),
      stripeSubscriptionId: idDe(session.subscription),
    });
  }

  /**
   * La suscripción cambió de estado, o se acabó.
   *
   * ⚠️ Aquí **no llega nuestro `userId`**: Stripe no lo conoce fuera del momento
   * del checkout, así que se busca por el id de la suscripción, que sí guardamos.
   *
   * `active` y `trialing` son las dos formas de estar al día. Cualquier otra
   * —impagada, cancelada, incompleta— vuelve a FREE: lo que decide el plan es
   * el estado de la suscripción, no la última cosa que pasó.
   */
  private async onSubscriptionChanged(subscription: Stripe.Subscription) {
    const dueño = await firstValueFrom(
      this.assistantClient.send<{ userId: string } | null>(
        { cmd: 'assistant_billing_by_subscription' },
        { stripeSubscriptionId: subscription.id },
      ),
    ).catch(() => null);

    if (!dueño?.userId) {
      this.log.warn(`Suscripción ${subscription.id} sin cuenta asociada: se ignora.`);
      return;
    }

    const alDia = subscription.status === 'active' || subscription.status === 'trialing';

    await this.aplicar({
      userId: dueño.userId,
      plan: alDia ? 'PRO' : 'FREE',
      stripeCustomerId: idDe(subscription.customer),
      stripeSubscriptionId: subscription.id,
    });
  }

  private async aplicar(datos: {
    userId: string;
    plan: 'FREE' | 'PRO';
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  }) {
    await firstValueFrom(this.assistantClient.send({ cmd: 'assistant_billing_link' }, datos)).catch(
      (error: Error) => {
        /**
         * ⚠️ Se traga el error **a propósito**, y es la decisión más discutible de
         * este archivo. Si esto sube, el manejador responde 500 y Stripe reintenta;
         * con assistant-service caído, ese reintento tampoco funcionaría, y a los
         * pocos días Stripe desactiva el endpoint entero.
         *
         * El pago está cobrado y registrado en Stripe pase lo que pase aquí, así
         * que la vía de recuperación es el registro: queda escrito quién pagó y
         * qué plan había que darle, y se aplica a mano desde administración.
         */
        this.log.error(
          `No se pudo aplicar el plan ${datos.plan} a ${datos.userId} ` +
            `(suscripción ${datos.stripeSubscriptionId}): ${error.message}`,
        );
      },
    );
  }
}

/**
 * Stripe devuelve unos campos como id y otros como el objeto entero, según lo
 * que se haya pedido expandir. Esto se queda con el id en los dos casos.
 */
function idDe(valor: string | { id: string } | null | undefined): string | null {
  if (!valor) return null;
  return typeof valor === 'string' ? valor : valor.id;
}
