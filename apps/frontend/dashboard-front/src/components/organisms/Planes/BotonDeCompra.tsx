'use client';

import { Button } from '@praxis/commons';
import { abrirPagoAction, abrirPortalAction } from '@praxis/commons/billing/actions';
import type { PlanTier } from '@praxis/commons/billing/planes';
import { useState } from 'react';

/**
 * El botón que abre Stripe.
 *
 * ## Un solo camino hacia el pago
 *
 * Llama a `commons/billing/actions`, que es el mismo sitio al que llama la
 * tarjeta del chat cuando se agota la cuota. Abrir un checkout es la clase de
 * cosa que se duplica sin darse cuenta —un `fetch` aquí, otro allá— y cada
 * copia es un sitio donde olvidar que un 503 significa «esta instalación no
 * tiene claves» y no «vuelve a intentarlo».
 *
 * ## Por qué navega el navegador y no el servidor
 *
 * La acción devuelve la URL en vez de redirigir: Stripe está fuera de la
 * aplicación, así que la pestaña tiene que ir allí de verdad. Un `redirect()`
 * en el servidor lo seguiría la propia Server Function.
 */
export function BotonDeCompra({
  destino,
  tier,
  seats,
  organizationId,
  children,
}: {
  /** `checkout` abre el pago; `portal`, la gestión de una suscripción que ya existe. */
  destino: 'checkout' | 'portal';
  /** Qué plan se compra. Obligatorio en `checkout` y de sobra en `portal`. */
  tier?: PlanTier;
  /** Asientos, solo en los planes de empresa. */
  seats?: number;
  /** Quién paga, solo en los planes de empresa. */
  organizationId?: string;
  children: React.ReactNode;
}) {
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abrir() {
    setAbriendo(true);
    setError(null);

    const { url, error: fallo } =
      destino === 'checkout' && tier
        ? await abrirPagoAction({ tier, seats, organizationId })
        : await abrirPortalAction();

    if (url) {
      if (destino === 'portal') {
        /**
         * El portal, en una pestaña aparte.
         *
         * Gestionar la suscripción es un rodeo —cambiar la tarjeta, mirar un
         * recibo— del que se vuelve, y llevarse la pestaña entera obliga a
         * rehacer el camino hasta donde estabas. La compra es lo contrario: es
         * el final del recorrido y termina volviendo aquí con `?pago=ok`, así
         * que esa sí se lleva la pestaña.
         *
         * `noopener` no es opcional: sin él, la página abierta recibe un
         * `window.opener` con el que puede redirigir la nuestra.
         */
        window.open(url, '_blank', 'noopener,noreferrer');
        setAbriendo(false);
        return;
      }

      window.location.href = url;
      /* No se apaga la espera: la pestaña se está yendo, y un botón que vuelve
         a estar disponible durante la navegación invita a pulsarlo dos veces. */
      return;
    }

    setError(fallo ?? 'No se pudo abrir la página de pago.');
    setAbriendo(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        onClick={abrir}
        isLoading={abriendo}
        variant={destino === 'checkout' ? 'primary' : 'secondary'}
      >
        {children}
      </Button>
      {error && (
        <p role="alert" className="font-sans text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
