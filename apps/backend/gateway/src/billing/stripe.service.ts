import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * El cobro del plan PRO, contra Stripe.
 *
 * ## Checkout alojado, no un formulario nuestro
 *
 * La página donde se escribe la tarjeta **la sirve Stripe**. Nunca vemos un
 * número de tarjeta, no lo guardamos y no viaja por nuestros servidores, así
 * que todo el cumplimiento PCI se queda de su lado. La alternativa —campos de
 * tarjeta propios— se ve mejor y arrastra una auditoría entera.
 *
 * ## Qué pasa sin claves
 *
 * **No se rompe nada al arrancar: la facturación queda apagada.** Es lo que
 * permite levantar el entorno local, y CI, sin cuenta de Stripe. Los endpoints
 * de pago responden 503 con un mensaje claro en vez de fallar de forma rara, y
 * el arranque lo avisa una vez. Es la misma decisión que ya toma `MailService`
 * con `MAIL_API_KEY`.
 */
@Injectable()
export class StripeService {
  private readonly log = new Logger(StripeService.name);
  private readonly stripe?: Stripe;
  private readonly proPrice?: string;
  private readonly webhookSecret?: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY') || undefined;
    this.proPrice = this.config.get<string>('STRIPE_PRICE_PRO') || undefined;
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') || undefined;
    this.appUrl = this.config.get<string>('PUBLIC_APP_URL') || 'http://localhost:4100';

    if (!secretKey || !this.proPrice) {
      this.log.warn(
        'STRIPE_SECRET_KEY o STRIPE_PRICE_PRO no están definidas: la facturación queda desactivada.',
      );
      return;
    }

    this.stripe = new Stripe(secretKey);

    if (!this.webhookSecret) {
      /**
       * ⚠️ Sin este secreto **no se puede verificar quién manda el webhook**, y
       * ese endpoint es público por necesidad. Aceptarlo sin firma sería dejar
       * que cualquiera se regale el plan PRO con un `curl`, así que el manejador
       * rechaza todo mientras falte. Se avisa al arrancar y no media hora antes
       * de una demo.
       */
      this.log.warn(
        'STRIPE_WEBHOOK_SECRET no está definida: el webhook rechazará todo. ' +
          'Sin firma no hay forma de distinguir a Stripe de cualquiera.',
      );
    }
  }

  /** ¿Está configurado el cobro? Lo mira la interfaz para no ofrecer un botón muerto. */
  get enabled(): boolean {
    return this.stripe !== undefined;
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('El cobro no está configurado en este entorno.');
    }
    return this.stripe;
  }

  /**
   * Abre un pago y devuelve a dónde mandar a la persona.
   *
   * `client_reference_id` lleva **nuestro** `userId`. Es lo único que ata el
   * pago a una cuenta de PRAXIS: Stripe no conoce nuestras cuentas, así que sin
   * esto el webhook llegaría sin saber a quién darle el plan.
   *
   * ⚠️ La URL de éxito **no concede nada**. Es una página que dice «gracias» y
   * poco más: quien decide el plan es el webhook. Cualquiera puede escribir esa
   * URL en la barra de direcciones, y si diera PRO, PRO sería gratis.
   */
  async createCheckout(data: {
    userId: string;
    email?: string;
    stripeCustomerId?: string | null;
  }): Promise<{ url: string }> {
    const stripe = this.requireStripe();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: this.proPrice as string, quantity: 1 }],
      client_reference_id: data.userId,
      /* Se reutiliza el cliente si ya existe; si no, se le pasa el correo para
         que Stripe cree uno y esa persona no acabe con varios clientes sueltos
         cuyos recibos Stripe no relaciona entre sí. */
      ...(data.stripeCustomerId
        ? { customer: data.stripeCustomerId }
        : data.email
          ? { customer_email: data.email }
          : {}),
      /* A la página de planes, no a Configuración: es donde está la
         enhorabuena, y es la pantalla que ya sabe esperar al webhook. */
      success_url: `${this.appUrl}/dashboard/planes?pago=ok`,
      cancel_url: `${this.appUrl}/dashboard/planes?pago=cancelado`,
    });

    if (!session.url) {
      throw new ServiceUnavailableException('Stripe no devolvió una página de pago.');
    }

    return { url: session.url };
  }

  /**
   * Abre el portal de facturación: cambiar tarjeta, ver recibos, darse de baja.
   *
   * Se delega en Stripe entero. Construir nuestra propia pantalla de baja
   * significaría reimplementar prorrateos, reintentos y recibos, y todo eso ya
   * existe ahí.
   */
  async createPortal(stripeCustomerId: string): Promise<{ url: string }> {
    const stripe = this.requireStripe();

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${this.appUrl}/dashboard/settings`,
    });

    return { url: session.url };
  }

  /**
   * Comprueba que un webhook viene de Stripe de verdad.
   *
   * ⚠️ **Es la única autenticación que tiene ese endpoint**, que no puede llevar
   * JWT: quien llama es Stripe, no una sesión. La verificación la hace el SDK
   * —compara en tiempo constante y rechaza marcas de tiempo viejas, que es lo
   * que impide reenviar un evento capturado— y por eso no se escribe a mano.
   *
   * Sin secreto configurado no se acepta nada. Devolver `null` y que el
   * manejador conteste 400 es preferible a arrancar sin él y enterarse cuando
   * alguien ya se ha regalado el plan.
   */
  verifyEvent(rawBody: Buffer | undefined, signature: string | undefined): Stripe.Event | null {
    if (!this.stripe || !this.webhookSecret || !rawBody || !signature) return null;

    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (error) {
      this.log.warn(`Webhook de Stripe rechazado: ${(error as Error).message}`);
      return null;
    }
  }
}
