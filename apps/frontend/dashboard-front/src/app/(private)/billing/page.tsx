import { CheckoutButton, PaymentReturn, PlanCatalog } from '@/components/organisms/Billing';
import { AppHeader, Button } from '@praxis/commons';
import { createServerApiClient, loadPrivateChrome } from '@praxis/commons/auth';
import type { BillingSummary, CatalogoDePlanes, PlanTier } from '@praxis/commons/billing/planes';
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

  /* 🔴 **La organización activa, y ya no se pregunta cuál.** Hasta 2026-08-28
     esta pantalla hablaba del plan de la persona y el botón de contratar mandaba
     a elegir organización — dos decisiones para una compra, y la primera ya
     estaba tomada en la barra lateral. Ahora se habla de la que está puesta.

     ⚠️ Va antes que el resto y no en el mismo `Promise.all`: el resumen depende
     de ella. Es la única llamada encadenada de la pantalla, y `loadPrivateChrome`
     es la misma que ya hace el layout. */
  const { organizacionActivaId } = await loadPrivateChrome();

  /* Cada `catch` deja su bloque en «no se pudo cargar» en vez de tumbar la
     pantalla: no poder leer el consumo no es motivo para no poder comparar. */
  const [catalogo, resumen] = await Promise.all([
    createServerApiClient()
      .get<CatalogoDePlanes>('/me/billing/planes')
      .catch(() => null),
    createServerApiClient()
      .get<BillingSummary>(
        organizacionActivaId
          ? `/me/billing/resumen?organizationId=${organizacionActivaId}`
          : '/me/billing/resumen',
      )
      .catch(() => null),
  ]);

  /* Quién es la activa, con `soyDueno` dentro. Sale del propio resumen: es la
     lista que el servidor ya devuelve, y pedirla aparte sería una llamada de más
     para un dato que ya está en la respuesta. */
  const activa = resumen?.organizaciones.find(
    (organizacion) => organizacion.id === organizacionActivaId,
  );

  /* 🔴 **Contratar exige ser el dueño, no `canManageBilling`.** Lo comprueba el
     gateway (`organizacionPropia`): un ADMIN invita y quita gente, pero no
     compromete la tarjeta de nadie. Antes este estado se escondía detrás de la
     pregunta «¿en qué organización?»; dentro del túnel hay que dibujarlo, o el
     botón lleva a un 400 que nadie entiende. */
  const puedeContratar = Boolean(activa?.soyDueno);

  if (!catalogo) {
    return (
      <AppHeader title="Facturación" anchoCompleto={true}>
        <p className="font-sans text-sm text-text-secondary">
          No se pudo cargar el catálogo de planes. Vuelve a intentarlo en un momento.
        </p>
      </AppHeader>
    );
  }

  return (
    <AppHeader title="Facturación" anchoCompleto={true}>
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

          /* ⚠️ **El checkout sigue necesitando saber qué organización paga** —su
             id va en el `client_reference_id` de Stripe, que es lo único que ata
             el pago a algo de PRAXIS—, pero ya no hay que preguntarlo: es la
             activa. Lo que sí queda por decir es cuándo **no** se puede. */
          if (plan.contratacion === 'AUTOSERVICIO') {
            const btnClass =
              plan.tier === 'TEAM'
                ? 'w-full text-center bg-primary text-white font-bold py-3 px-4 rounded-xl hover:bg-primary/90 transition-all shadow-[0_0_20px_-5px_rgba(139,92,246,0.4)]'
                : 'w-full text-center bg-white/10 text-white font-bold py-3 px-4 rounded-xl hover:bg-white/20 transition-all';

            /* Sin organización activa la lista falló al cargar: se manda a
               crearla, que es el camino que siempre funciona. */
            if (!activa) {
              return (
                <Link href="/organizations/new" className={btnClass}>
                  Crear una organización
                </Link>
              );
            }

            /* ⚠️ **Un texto, no un botón apagado.** Quien administra un equipo
               sin ser su dueño no tiene ninguna acción que pulsar aquí: lo que
               necesita es saber a quién pedírselo. Un botón deshabilitado dice
               «no puedes» y se calla la salida. */
            if (!puedeContratar) {
              return (
                <p className="w-full rounded-xl border border-white/10 px-4 py-3 text-center font-sans text-xs text-text-secondary">
                  Solo quien creó {activa.name} puede contratar su plan.
                </p>
              );
            }

            return (
              <Link href={`/organizations/${activa.id}`} className={btnClass}>
                Contratar para {activa.name}
              </Link>
            );
          }

          /* `CONTACTO`: no hay precio en Stripe porque se negocia. Ofrecerle un
             botón de compra sería ofrecer uno que responde 503 al pulsarlo. */
          return (
            <a
              href="mailto:ventas@praxis.com"
              className="w-full text-center border border-white/20 text-white font-bold py-3 px-4 rounded-xl hover:bg-white/5 transition-all"
            >
              Contactar ventas
            </a>
          );
        }}
        accionPortal={
          /* ⚠️ **«Mis suscripciones», en plural y sin nombrar el equipo.** El
             portal de Stripe es del **cliente-persona**, no de la organización
             (`billing.controller.ts` → `cliente(userId)`): quien tenga dos
             suscripciones las verá las dos ahí dentro. No es un riesgo —todo lo
             de dentro es suyo— pero un botón que prometiera «la suscripción de
             este equipo» estaría mintiendo, y la baja equivocada se da dentro de
             Stripe, donde ya no podemos avisar de nada.

             Está en PENDIENTES-BACKEND: el portal necesita aceptar un
             `organizationId`. Hasta entonces, el texto dice la verdad. */
          resumen?.gestionable ? (
            <CheckoutButton destino="portal">Gestionar mis suscripciones</CheckoutButton>
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
