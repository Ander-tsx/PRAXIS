import { BotonDeCompra, Planes, VueltaDelPago } from '@/components/organisms/Planes';
import type { AssistantQuota, EstadoDeFacturacion } from '@/lib/billing';
import { AppHeader } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Planes',
};

/**
 * La página de planes: qué se lleva quien pague, y el botón para pagarlo.
 *
 * ## Qué se decide aquí y qué no
 *
 * Aquí se decide **qué se puede ofrecer**: si el backend no tiene claves de
 * Stripe no hay botón, y si esta persona ya es PRO lo que se ofrece es el
 * portal de facturación, no otra compra. Es la regla de la casa —la lógica en
 * la página, los organismos reciben props y slots— y además es lo que evita
 * enseñar un botón que responde 503 al pulsarlo.
 *
 * Lo que **no** se decide aquí es el plan. Lo concede el webhook de Stripe con
 * la firma comprobada, y nada más: la `success_url` la puede escribir
 * cualquiera en la barra de direcciones. Por eso `?pago=ok` no toca nada — solo
 * enciende la pantalla de enhorabuena, que pregunta hasta que el servidor
 * confirme.
 *
 * ## El precio sale del entorno
 *
 * `NEXT_PUBLIC_PRECIO_PRO` es solo el texto que se enseña. El precio de verdad
 * vive en Stripe, en el `price_…` que usa el checkout: si los dos discrepan,
 * manda Stripe. Se pone aquí para no tener que redesplegar por cambiar una
 * cifra de una tarjeta, y por eso no lleva símbolo — lo pone la tarjeta.
 */
export default async function PlanesPage({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string }>;
}) {
  const { pago } = await searchParams;

  /* Cada `catch` deja su bloque en el estado «no se pudo cargar» en vez de
     tumbar la pantalla: no poder preguntar si hay pasarela no es motivo para no
     poder leer los planes. */
  const [quota, billing] = await Promise.all([
    createServerApiClient()
      .get<AssistantQuota>('/me/assistant/quota')
      .catch(() => null),
    createServerApiClient()
      .get<EstadoDeFacturacion>('/me/billing/estado')
      .catch(() => null),
  ]);

  const plan = quota?.plan ?? 'FREE';
  const sePuedeComprar = billing?.disponible === true && plan === 'FREE';
  const sePuedeGestionar = billing?.disponible === true && billing.gestionable === true;

  return (
    <AppHeader title="Planes">
      <Planes
        quota={quota}
        precioPro={process.env.NEXT_PUBLIC_PRECIO_PRO ?? null}
        accionPro={
          sePuedeComprar ? (
            <BotonDeCompra destino="checkout">Pasar a PRO</BotonDeCompra>
          ) : (
            /* Sin pasarela no se promete nada. Es preferible decir que ahora no
               se puede a enseñar un botón que falla al pulsarlo. */
            billing?.disponible === false && (
              <p className="font-sans text-sm text-text-secondary">
                El pago no está disponible en esta instalación todavía.
              </p>
            )
          )
        }
        accionPortal={
          sePuedeGestionar ? (
            <BotonDeCompra destino="portal">Gestionar suscripción</BotonDeCompra>
          ) : null
        }
        vueltaDelPago={
          pago === 'ok' ? (
            <VueltaDelPago planActual={plan} />
          ) : pago === 'cancelado' ? (
            /* Sin drama y sin culpar a nadie: el botón sigue ahí abajo. */
            <p className="rounded-2xl border border-border bg-surface-elevated px-5 py-4 font-sans text-sm text-text-secondary">
              No se ha cobrado nada. Puedes volver a intentarlo cuando quieras.
            </p>
          ) : null
        }
      />
    </AppHeader>
  );
}
