import { BotonDeCompra, Planes, VueltaDelPago } from '@/components/organisms/Planes';
import { Button } from '@praxis/commons';
import { AppHeader } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { BillingSummary, CatalogoDePlanes, PlanTier } from '@praxis/commons/billing/planes';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Planes',
};

/**
 * Lo que cuesta cada plan, escrito.
 *
 * ⚠️ **Es solo el texto.** El precio de verdad vive en Stripe, en el `price_…`
 * que usa el checkout: si los dos discrepan, manda Stripe. Está en el entorno
 * para no redesplegar por cambiar una cifra de una tarjeta, y por eso no lleva
 * símbolo — lo pone la tarjeta.
 */
function preciosDelEntorno(): Partial<Record<PlanTier, string>> {
  return {
    ...(process.env.NEXT_PUBLIC_PRECIO_PLUS ? { PLUS: process.env.NEXT_PUBLIC_PRECIO_PLUS } : {}),
    ...(process.env.NEXT_PUBLIC_PRECIO_PRO ? { PRO: process.env.NEXT_PUBLIC_PRECIO_PRO } : {}),
    ...(process.env.NEXT_PUBLIC_PRECIO_TEAM ? { TEAM: process.env.NEXT_PUBLIC_PRECIO_TEAM } : {}),
    ...(process.env.NEXT_PUBLIC_PRECIO_BUSINESS
      ? { BUSINESS: process.env.NEXT_PUBLIC_PRECIO_BUSINESS }
      : {}),
    FREE: '0',
  };
}

/**
 * La página de planes: qué se lleva quien pague, y el botón para pagarlo.
 *
 * ## Qué se decide aquí y qué no
 *
 * Aquí se decide **qué se puede ofrecer**: qué planes tiene precio en esta
 * instalación, cuál es el tuyo —al que se le ofrece el portal, no otra compra—
 * y cuáles hay que contratar desde una organización. Es la regla de la casa
 * —la lógica en la página, los organismos reciben props y slots— y además es lo
 * que evita enseñar un botón que responde 503 al pulsarlo.
 *
 * Lo que **no** se decide aquí es el plan. Lo concede el webhook de Stripe con
 * la firma comprobada, y nada más: la `success_url` la puede escribir
 * cualquiera en la barra de direcciones. Por eso `?pago=ok` no toca nada — solo
 * enciende la pantalla de enhorabuena, que pregunta hasta que el servidor
 * confirme.
 */
export default async function PlanesPage({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string }>;
}) {
  const { pago } = await searchParams;

  /* Cada `catch` deja su bloque en el estado «no se pudo cargar» en vez de
     tumbar la pantalla: no poder leer el consumo no es motivo para no poder
     comparar los planes. */
  const [catalogo, resumen] = await Promise.all([
    createServerApiClient()
      .get<CatalogoDePlanes>('/me/billing/planes')
      .catch(() => null),
    createServerApiClient()
      .get<BillingSummary>('/me/billing/resumen')
      .catch(() => null),
  ]);

  if (!catalogo) {
    return (
      <AppHeader title="Planes">
        <p className="font-sans text-sm text-text-secondary">
          No se pudo cargar el catálogo de planes. Vuelve a intentarlo en un momento.
        </p>
      </AppHeader>
    );
  }

  const sePuedeGestionar = resumen?.gestionable === true;

  return (
    <AppHeader title="Planes">
      <Planes
        planes={catalogo.planes}
        disponibles={catalogo.disponibles}
        resumen={resumen}
        precios={preciosDelEntorno()}
        accionDe={(plan) => {
          /* FREE no se contrata: se es. Un botón aquí tendría que significar
             «dame de baja», y la baja vive en el portal de Stripe con su
             confirmación — no en la misma fila que los botones de comprar. */
          if (plan.tier === 'FREE') return null;

          if (plan.audience === 'ENTERPRISE') {
            /* ⚠️ No abre el pago: **hace falta la organización antes**, porque
               es ella quien paga y quien lleva los asientos. El checkout de un
               plan de empresa sin `organizationId` responde 400, así que lo que
               se ofrece es el paso que sí existe. */
            return (
              <Link href={`/organizations/new?tier=${plan.tier}`}>
                <Button type="button" variant="secondary">
                  Crear una organización {plan.nombre}
                </Button>
              </Link>
            );
          }

          return (
            <BotonDeCompra destino="checkout" tier={plan.tier}>
              Pasar a {plan.nombre}
            </BotonDeCompra>
          );
        }}
        accionPortal={
          sePuedeGestionar ? (
            <BotonDeCompra destino="portal">Gestionar suscripción</BotonDeCompra>
          ) : null
        }
        vueltaDelPago={
          pago === 'ok' ? (
            <VueltaDelPago planActual={resumen?.tier ?? 'FREE'} />
          ) : pago === 'cancelado' ? (
            /* Sin drama y sin culpar a nadie: los botones siguen ahí abajo. */
            <p className="rounded-2xl border border-border bg-surface-elevated px-5 py-4 font-sans text-sm text-text-secondary">
              No se ha cobrado nada. Puedes volver a intentarlo cuando quieras.
            </p>
          ) : null
        }
      />
    </AppHeader>
  );
}
