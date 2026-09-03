import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PLANS, PlanTier } from '@praxis/contracts';
import Stripe from 'stripe';

/**
 * El cobro, contra Stripe.
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
 *
 * ⚠️ **Y cada precio que falte apaga solo su plan.** Desde que hay cinco, un
 * despliegue puede tener PRO configurado y los de empresa no; la pantalla de
 * precios pregunta cuáles se pueden contratar (`planesDisponibles`) y no ofrece
 * los otros, en vez de ofrecer un botón que responde 503 al pulsarlo.
 */
@Injectable()
export class StripeService {
  private readonly log = new Logger(StripeService.name);
  private readonly stripe?: Stripe;
  private readonly webhookSecret?: string;
  private readonly appUrl: string;
  /** Plan → id de precio. Solo entran los que tienen su variable puesta. */
  private readonly precios = new Map<PlanTier, string>();

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY') || undefined;
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') || undefined;
    this.appUrl = this.config.get<string>('PUBLIC_APP_URL') || 'http://localhost:4100';

    for (const plan of Object.values(PLANS)) {
      if (!plan.envPrecio) continue;
      const precio = this.config.get<string>(plan.envPrecio);
      if (precio) this.precios.set(plan.tier, precio);
    }

    if (!secretKey) {
      this.log.warn('STRIPE_SECRET_KEY no está definida: la facturación queda desactivada.');
      return;
    }

    this.stripe = new Stripe(secretKey);

    const sinPrecio = Object.values(PLANS)
      .filter((plan) => plan.envPrecio && !this.precios.has(plan.tier))
      .map((plan) => plan.envPrecio);
    if (sinPrecio.length > 0) {
      /* Se avisa por plan y no en bloque: «falta STRIPE_PRICE_TEAM» se arregla;
         «faltan precios» hay que ir a buscarlo. */
      this.log.warn(`Sin precio configurado, esos planes no se ofrecen: ${sinPrecio.join(', ')}.`);
    }

    if (!this.webhookSecret) {
      /**
       * ⚠️ Sin este secreto **no se puede verificar quién manda el webhook**, y
       * ese endpoint es público por necesidad. Aceptarlo sin firma sería dejar
       * que cualquiera se regale un plan con un `curl`, así que el manejador
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

  /**
   * Qué planes se pueden contratar **en este despliegue**.
   *
   * FREE siempre: no se contrata, se es. Los demás, solo si su precio está
   * configurado. Es lo que separa «este plan no existe» de «este plan no está
   * enchufado aquí», que para quien mira la pantalla es lo mismo pero para quien
   * despliega no.
   */
  planesDisponibles(): PlanTier[] {
    if (!this.enabled) return [PlanTier.FREE];
    return [PlanTier.FREE, ...this.precios.keys()];
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
   * `client_reference_id` lleva **el id de la organización**, no el de la
   * persona. Es lo único que ata el pago a algo de PRAXIS —Stripe no conoce
   * nuestras cuentas— y es la organización porque es la que paga: en un plan
   * individual será la personal de quien compra, y en uno de empresa, la suya.
   * Sin esto el webhook llegaría sin saber a quién darle el plan.
   *
   * ⚠️ La URL de éxito **no concede nada**. Es una página que dice «gracias» y
   * poco más: quien decide el plan es el webhook. Cualquiera puede escribir esa
   * URL en la barra de direcciones, y si diera un plan, el plan sería gratis.
   */
  async createCheckout(data: {
    organizationId: string;
    tier: PlanTier;
    seats?: number;
    email?: string;
    stripeCustomerId?: string | null;
    /** A dónde volver. La pantalla de planes o el portal de la organización. */
    volverA?: string;
  }): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    const spec = PLANS[data.tier];
    const precio = this.precios.get(data.tier);

    if (!spec || !precio) {
      throw new ServiceUnavailableException(
        `El plan ${spec?.nombre ?? data.tier} no está disponible en este entorno.`,
      );
    }

    /* La cantidad **es** lo que se cobra: con `quantity: 1` sobre un precio por
       unidad, cincuenta asientos costarían lo que uno. Ya no hay planes a tanto
       alzado — desde 2026-08-26 todos van por asiento, y uno solo es el caso de
       quien trabaja en su organización personal. */
    const cantidad = Math.max(data.seats ?? spec.asientosMinimos, 1);

    /* ⚠️ `/main`, no `/dashboard`: el `basePath` de dashboard-front se renombró
       y estos literales del backend se quedaron atrás. Ver `volverA` en
       `billing.controller.ts` para el fallo entero. */
    const vuelta = data.volverA ?? '/main/billing';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: precio, quantity: cantidad }],
      client_reference_id: data.organizationId,
      /* Se reutiliza el cliente si ya existe; si no, se le pasa el correo para
         que Stripe cree uno y esa persona no acabe con varios clientes sueltos
         cuyos recibos Stripe no relaciona entre sí. */
      ...(data.stripeCustomerId
        ? { customer: data.stripeCustomerId }
        : data.email
          ? { customer_email: data.email }
          : {}),
      /**
       * ⚠️ **El plan viaja también en los metadatos, además del precio.**
       *
       * El webhook tiene que saber qué plan conceder, y deducirlo del id del
       * precio obliga a que el gateway que atiende el webhook tenga configuradas
       * exactamente las mismas variables que el que abrió el checkout. Con el
       * plan escrito en la sesión, un despliegue al que le falte una variable
       * sigue aplicando bien el pago que ya se hizo.
       */
      metadata: { tier: data.tier, seats: String(cantidad) },
      subscription_data: {
        /**
         * 🔴 **El mes gratis, y solo aquí.**
         *
         * Lo aplica Stripe, no un temporizador nuestro: el cobro llega al
         * segundo mes porque Stripe lo programa, con sus reintentos y sus
         * recibos.
         *
         * ⚠️ Si además se configura un periodo de prueba **en el propio precio**
         * dentro del panel de Stripe, los dos se suman y quedarían dos meses
         * gratis. No da ningún error y no se nota hasta el recibo que no llega.
         */
        ...(spec.diasDePrueba > 0 ? { trial_period_days: spec.diasDePrueba } : {}),
        /* ⚠️ Y aquí también, no solo en la sesión: los eventos de
           `customer.subscription.*` **no traen los metadatos de la sesión**, así
           que sin esto una renovación o una baja llegaría sin saber de qué plan
           ni de qué organización habla. */
        metadata: { tier: data.tier, organizationId: data.organizationId },
      },
      success_url: `${this.appUrl}${vuelta}?pago=ok`,
      cancel_url: `${this.appUrl}${vuelta}?pago=cancelado`,
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
  async createPortal(stripeCustomerId: string, volverA?: string): Promise<{ url: string }> {
    const stripe = this.requireStripe();

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${this.appUrl}${volverA ?? '/main/billing'}`,
    });

    return { url: session.url };
  }

  /**
   * Cambia los asientos de una suscripción viva.
   *
   * ⚠️ **Es lo único de este archivo que cobra sin pasar por una página de
   * Stripe**, así que quien llame tiene que haber comprobado el papel de quien
   * pide. `proration_behavior` en `create_prorations` es lo que hace que subir
   * de tres a diez a mitad de mes cueste la parte proporcional y no un mes
   * entero — al revés sería cobrar dos veces por los mismos días.
   */
  async cambiarAsientos(stripeSubscriptionId: string, seats: number): Promise<void> {
    const stripe = this.requireStripe();

    const suscripcion = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const linea = suscripcion.items.data[0];
    if (!linea) {
      throw new ServiceUnavailableException('Esa suscripción no tiene ninguna línea que ajustar.');
    }

    await stripe.subscriptions.update(stripeSubscriptionId, {
      items: [{ id: linea.id, quantity: seats }],
      proration_behavior: 'create_prorations',
    });
  }

  /**
   * De qué plan es un precio.
   *
   * Es el camino de vuelta de `precios`, y se usa **solo como respaldo**: lo
   * normal es que el plan venga en los metadatos de la suscripción. Ver la nota
   * de `createCheckout`.
   */
  planDePrecio(priceId: string | null | undefined): PlanTier | null {
    if (!priceId) return null;
    for (const [tier, precio] of this.precios) {
      if (precio === priceId) return tier;
    }
    return null;
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
