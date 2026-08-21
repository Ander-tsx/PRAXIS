'use client';

import { Button } from '@praxis/commons';
import { abrirPagoProAction, abrirPortalAction } from '@praxis/commons/billing/actions';
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
  children,
}: {
  /** `checkout` abre el pago; `portal`, la gestión de una suscripción que ya existe. */
  destino: 'checkout' | 'portal';
  children: React.ReactNode;
}) {
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abrir() {
    setAbriendo(true);
    setError(null);

    const { url, error: fallo } =
      destino === 'checkout' ? await abrirPagoProAction() : await abrirPortalAction();

    if (url) {
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
