import { CheckoutButton, PaymentReturn, PlanCatalog } from '@/components/organisms/Billing';
import { AppHeader, Button } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type {
  BillingSummary,
  CatalogoDePlanes,
  OrganizationView,
  PlanTier,
} from '@praxis/commons/billing/planes';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Facturación',
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
    FREE: '0',
    ...(process.env.NEXT_PUBLIC_PRECIO_TEAM ? { TEAM: process.env.NEXT_PUBLIC_PRECIO_TEAM } : {}),
    ...(process.env.NEXT_PUBLIC_PRECIO_BUSINESS
      ? { BUSINESS: process.env.NEXT_PUBLIC_PRECIO_BUSINESS }
      : {}),
  };
}

/**
 * Facturación: tu plan, tu consumo y lo que hay.
 *
 * ## Qué se decide aquí y qué no
 *
 * Aquí se decide **qué se puede ofrecer**: qué planes tienen precio en esta
 * instalación, cuál es el tuyo —al que se le ofrece el portal y no otra
 * compra— y cuáles hay que contratar desde una organización. Es la regla de la
 * casa —la lógica en la página, los organismos reciben props y slots— y además
 * es lo que evita enseñar un botón que responde 503 al pulsarlo.
 *
 * Lo que **no** se decide aquí es el plan. Lo concede el webhook de Stripe con
 * la firma comprobada: la `success_url` la puede escribir cualquiera en la
 * barra de direcciones. Por eso `?pago=ok` no toca nada — solo enciende la
 * pantalla de enhorabuena, que pregunta hasta que el servidor confirme.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string }>;
}) {
  const { pago } = await searchParams;

  /* Cada `catch` deja su bloque en «no se pudo cargar» en vez de tumbar la
     pantalla: no poder leer el consumo no es motivo para no poder comparar. */
  const [catalogo, resumen, organizaciones] = await Promise.all([
    createServerApiClient()
      .get<CatalogoDePlanes>('/me/billing/planes')
      .catch(() => null),
    createServerApiClient()
      .get<BillingSummary>('/me/billing/resumen')
      .catch(() => null),
    /* Para saber **dónde** se contrata: con una sola no hay que preguntar
       nada. `[]` si falla — entonces se ofrece crear una, que es el camino que
       siempre funciona. */
    createServerApiClient()
      .get<OrganizationView[]>('/me/organizations')
      .catch(() => [] as OrganizationView[]),
  ]);

  if (!catalogo) {
    return (
      <AppHeader title="Facturación">
        <p className="font-sans text-sm text-text-secondary">
          No se pudo cargar el catálogo de planes. Vuelve a intentarlo en un momento.
        </p>
      </AppHeader>
    );
  }

  return (
    <AppHeader title="Facturación">
      <PlanCatalog
        planes={catalogo.planes}
        disponibles={catalogo.disponibles}
        resumen={resumen}
        precios={preciosDelEntorno()}
        accionDe={(plan) => {
          /* FREE no se contrata: se es. Un botón aquí tendría que significar
             «dame de baja», y la baja vive en el portal de Stripe con su
             confirmación — no en la misma fila que los botones de comprar. */
          if (plan.tier === 'FREE') return null;

          /* ⚠️ **No abre el pago desde aquí, y no es pereza.** El checkout
             necesita saber **qué organización** paga —lleva su id en el
             `client_reference_id` de Stripe, que es lo único que ata el pago a
             algo de PRAXIS— y eso es una elección de quien paga, no del
             servidor. Con una sola organización no hay pregunta y se entra
             directo; con varias, a la lista para elegir. */
          if (plan.contratacion === 'AUTOSERVICIO') {
            const destino =
              organizaciones.length === 1
                ? `/organizations/${organizaciones[0].id}`
                : organizaciones.length > 1
                  ? '/organizations'
                  : '/organizations/new';
            const texto =
              organizaciones.length === 1
                ? `Contratar en ${organizaciones[0].name}`
                : organizaciones.length > 1
                  ? 'Elegir en qué organización'
                  : 'Crear una organización';

            return (
              <Link
                href={destino}
                className="font-sans text-sm text-text-primary underline decoration-border underline-offset-4 transition-colors hover:decoration-primary"
              >
                {texto}
              </Link>
            );
          }

          /* `CONTACTO`: no hay precio en Stripe porque se negocia. Ofrecerle un
             botón de compra sería ofrecer uno que responde 503 al pulsarlo. */
          return (
            <span className="font-sans text-xs text-text-disabled">
              Se acuerda con nosotros. Escríbenos y lo montamos a la medida del equipo.
            </span>
          );
        }}
        accionPortal={
          resumen?.gestionable ? (
            <CheckoutButton destino="portal">Gestionar suscripción</CheckoutButton>
          ) : null
        }
        vueltaDelPago={
          pago === 'ok' ? (
            <PaymentReturn planActual={resumen?.tier ?? 'FREE'} />
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
