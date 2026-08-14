'use client';

import { alpha, colors } from '@praxis/commons';
import { createApiClient } from '@praxis/commons/api';
import { useState } from 'react';

/** Toda petición del navegador pasa por el proxy de la zona, que pone el Bearer. */
const api = createApiClient({ gatewayPath: '/dashboard/api/gateway' });

export interface PlanActionButtonProps {
  /** `checkout` abre el pago; `portal`, la gestión de una suscripción que ya existe. */
  accion: 'checkout' | 'portal';
  children: string;
}

/**
 * Lleva a Stripe.
 *
 * El servidor devuelve una URL en vez de un redirect, y el salto lo da esta
 * función con `window.location`. Es deliberado: un 303 desde el gateway lo
 * seguiría el propio `fetch` —acabaría con el HTML de Stripe dentro de una
 * respuesta JSON— en lugar de mover la pestaña.
 *
 * ⚠️ **No hay estado de «ya pagaste» aquí.** Al volver de Stripe, el plan lo ha
 * puesto el webhook, y esta pantalla lo lee de `/me/assistant/quota` al
 * renderizarse en el servidor. Guardar aquí un «comprado» sería inventarse una
 * segunda verdad que además puede mentir: el webhook puede tardar un segundo, o
 * el pago puede acabar rechazado.
 */
export function PlanActionButton({ accion, children }: PlanActionButtonProps) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ir() {
    setEnviando(true);
    setError(null);

    try {
      const { url } = await api.post<{ url: string }>(`/me/billing/${accion}`, {});
      if (!url) throw new Error('sin url');
      window.location.href = url;
    } catch {
      setError('No se pudo abrir la página de pago. Inténtalo de nuevo en un momento.');
      /* Solo se rehabilita al fallar: si salió bien, la pestaña ya se está
         yendo y volver a habilitarlo invita a un segundo clic que abriría dos
         pagos. */
      setEnviando(false);
    }
  }

  return (
    <div className="mt-auto flex flex-col gap-2">
      <button
        type="button"
        onClick={ir}
        disabled={enviando}
        className="w-fit cursor-pointer rounded-lg px-4 py-2 font-sans text-sm font-medium text-text-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: alpha(colors.primary, 20) }}
      >
        {enviando ? 'Abriendo…' : children}
      </button>

      {error && (
        <p role="alert" className="font-sans text-xs" style={{ color: colors.error }}>
          {error}
        </p>
      )}
    </div>
  );
}
