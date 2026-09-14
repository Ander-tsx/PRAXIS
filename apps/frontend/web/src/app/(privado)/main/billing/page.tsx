import { PlanCatalog } from '@/components/organisms/Billing';
import { CheckoutButton } from '@/components/organisms/Billing/CheckoutButton';
import { PaymentReturn } from '@/components/organisms/Billing/PaymentReturn';
import { SeatsPanel } from '@/components/organisms/Organizations';
import { AppHeader } from '@praxis/commons';
import { createServerApiClient, loadPrivateChrome } from '@praxis/commons/auth';
import type {
  BillingEventView,
  BillingSummary,
  CatalogoDePlanes,
  OrganizationView,
  PlanTier,
} from '@praxis/commons/billing/planes';
import type { Metadata } from 'next';
import { BillingTabs } from './BillingTabs';

export const metadata: Metadata = { title: 'Facturación' };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string }>;
}) {
  const { pago } = await searchParams;
  const { organizacionActivaId } = await loadPrivateChrome();
  const organizationId = organizacionActivaId;

  if (!organizationId) {
    return (
      <AppHeader title="Facturación">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
          <header className="flex flex-col gap-2 border-b border-white/[0.08] pb-6">
            <h1 className="font-sans text-3xl font-semibold tracking-tight text-white">
              Facturación
            </h1>
            <p className="font-sans text-sm text-white/70">
              Crea o selecciona una organización primero.
            </p>
          </header>
        </div>
      </AppHeader>
    );
  }

  const api = createServerApiClient();

  const [organizacion, historial, catalogo, resumen] = await Promise.all([
    api.get<OrganizationView>(`/organizations/${organizationId}`).catch(() => null),
    api.get<BillingEventView[]>(`/organizations/${organizationId}/history`).catch(() => null),
    api.get<CatalogoDePlanes>('/me/billing/planes').catch(() => null),
    api
      .get<BillingSummary>(`/me/billing/resumen?organizationId=${organizationId}`)
      .catch(() => null),
  ]);

  if (!organizacion || !catalogo) {
    return (
      <AppHeader title="Facturación">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
          <header className="flex flex-col gap-2 border-b border-white/[0.08] pb-6">
            <h1 className="font-sans text-3xl font-semibold tracking-tight text-white">
              Facturación
            </h1>
            <p className="font-sans text-sm text-white/70">
              No se pudo cargar la información de facturación.
            </p>
          </header>
        </div>
      </AppHeader>
    );
  }

  const permisos = organizacion.myPermissions;
  const esGratis = organizacion.tier === 'FREE';
  const spec = catalogo.planes.find((p) => p.tier === organizacion.tier);
  const activa = resumen?.organizaciones.find((o) => o.id === organizationId);
  const puedeContratar = Boolean(activa?.soyDueno);

  /**
   * Los precios los pone el entorno: la tabla los pinta, no los decide. FREE es
   * siempre 0; el resto solo aparece si esta instalación tiene la variable.
   */
  const precios = (): Partial<Record<PlanTier, string>> => ({
    FREE: '0',
    /* ⚠️ **Uno por plan de autoservicio, y hay que acordarse al añadir uno.**
       Pro se estrenó sin su línea aquí: el plan salía en la tabla, con su botón
       de compra, y **sin precio** — que es peor que no ofrecerlo. No hay nada
       que avise, porque un plan sin entrada simplemente no pinta la cifra. */
    ...(process.env.NEXT_PUBLIC_PRECIO_PRO ? { PRO: process.env.NEXT_PUBLIC_PRECIO_PRO } : {}),
    ...(process.env.NEXT_PUBLIC_PRECIO_TEAM ? { TEAM: process.env.NEXT_PUBLIC_PRECIO_TEAM } : {}),
    ...(process.env.NEXT_PUBLIC_PRECIO_BUSINESS
      ? { BUSINESS: process.env.NEXT_PUBLIC_PRECIO_BUSINESS }
      : {}),
  });

  /** Qué se ofrece en el pie de la columna de cada plan. */
  const accionDe = (plan: (typeof catalogo.planes)[number]) => {
    if (plan.tier === 'FREE') return null;

    if (plan.contratacion === 'AUTOSERVICIO') {
      if (plan.tier === organizacion.tier) {
        return <span className="font-sans text-xs text-white/40">Plan actual</span>;
      }
      if (!puedeContratar) {
        return (
          <p className="font-sans text-xs text-white/50">
            Solo quien creó la organización puede cambiar el plan.
          </p>
        );
      }
      return (
        <CheckoutButton
          destino="checkout"
          tier={plan.tier}
          organizationId={organizationId}
          /**
           * ⚠️ **Se lleva los asientos CONTRATADOS, no los ocupados.**
           *
           * Estaba con `seatsUsed`, y eso es lo que se está usando ahora
           * mismo — no lo que se paga. Una organización con 8 contratados y 5
           * dentro cambiaba de plan y salía con **5**: perdía tres asientos por
           * los que venía pagando, en silencio y sin nada que lo dijera, porque
           * el plan nuevo sí aparecía en la barra lateral. Se toma el mayor de
           * los dos por si el mínimo del plan destino es más alto.
           */
          seats={Math.max(plan.asientosMinimos, organizacion.seats)}
        >
          Cambiar a {plan.nombre}
        </CheckoutButton>
      );
    }

    return (
      <a
        href="mailto:ventas@praxis.com"
        className="inline-flex items-center justify-center rounded-lg border border-white/20 px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-white/5"
      >
        Contactar ventas
      </a>
    );
  };

  /**
   * El tope de asientos del plan contratado, o `null` si es ilimitado.
   *
   * 🔴 **Contratar un plan NO da sus asientos: da derecho a comprarlos.** Es la
   * confusión que trajo esta pantalla al taller. Alguien paga «Equipo», la barra
   * lateral pone «Plan Equipo», y sigue con los asientos que tenía —el mínimo—
   * porque `Subscription.seats` es lo que se contrata en Stripe y el catálogo
   * solo pone el **techo**. Nada falla, nada avisa: el equipo simplemente no
   * cabe, y el mensaje que sale al invitar habla de asientos ocupados, no de
   * que falte comprarlos.
   *
   * No se arregla dando el máximo al pagar —el precio es **por asiento**, así
   * que regalarlos sería regalar dinero—, se arregla **diciéndolo**: de aquí
   * sale la línea que separa las dos cifras.
   *
   * `SIN_TOPE` es `null` y un plan sin `spec` también da `null`: los dos se
   * pintan igual —«sin tope»— así que el `??` los junta a propósito.
   */
  const topeDeAsientos = spec?.quotas.asientos ?? null;

  const tuPlanSlot = esGratis ? null : (
    <div className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-[#191919] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-sans text-xs font-semibold uppercase tracking-wider text-primary">
            Tu plan
          </span>
          <h2 className="font-sans text-2xl font-semibold tracking-tight text-white">
            {spec?.nombre ?? organizacion.tier}
          </h2>
          <p className="font-sans text-sm text-white/60">
            Suscripción activa para {organizacion.name}.
          </p>
        </div>
        {resumen?.gestionable && (
          <CheckoutButton destino="portal">Gestionar en Stripe</CheckoutButton>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-6">
        <div className="flex flex-col gap-1">
          <h3 className="font-sans text-sm font-semibold text-white">Asientos</h3>
          <p className="max-w-2xl font-sans text-sm text-white/60">
            Cada persona de la organización ocupa uno; las invitaciones sin aceptar también.
          </p>
        </div>

        {/**
         * ⚠️ **Las dos cifras, juntas y dichas con todas las letras.**
         *
         * «Contratados» es lo que se paga y lo que de verdad limita; el tope del
         * plan es solo hasta dónde se puede subir sin cambiar de plan. Verlas
         * separadas —una aquí y otra en la tabla de abajo— es exactamente lo que
         * hacía leer «Equipo: 15 asientos» como «tengo 15».
         */}
        <p className="max-w-2xl rounded-r-lg border-l-2 border-primary bg-primary/5 py-3 pl-4 pr-4 font-sans text-sm text-white/80">
          Tienes <strong className="font-semibold text-white">{organizacion.seats}</strong>{' '}
          {organizacion.seats === 1 ? 'asiento contratado' : 'asientos contratados'}
          {topeDeAsientos !== null ? (
            <>
              , y {spec?.nombre ?? 'tu plan'} admite hasta{' '}
              <strong className="font-semibold text-white">{topeDeAsientos}</strong>.
            </>
          ) : (
            <>, y {spec?.nombre ?? 'tu plan'} no tiene tope.</>
          )}{' '}
          <strong className="font-semibold text-white">
            Pagar el plan no compra los asientos:
          </strong>{' '}
          el precio es por asiento y los añades tú aquí abajo. El tope del plan es hasta dónde
          puedes llegar, no lo que ya tienes.
        </p>

        <SeatsPanel
          organizationId={organizationId}
          contratados={organizacion.seats}
          ocupados={organizacion.seatsUsed}
          tope={topeDeAsientos}
          nombreDelPlan={spec?.nombre ?? organizacion.tier}
        />
      </div>
    </div>
  );

  /**
   * Quién se ha quedado en solo lectura, para quien puede resolverlo.
   *
   * 🔴 **Es lo que sustituye al periodo de gracia** (D12 de
   * `docs/PLAN-ASIENTOS-CONGELADOS.md`). No hay plazo que avise antes de
   * congelar a nadie, porque congelar no borra nada y se deshace en cuanto se
   * paga; lo que sí hace falta es que quien puede ampliar el plan **se entere**,
   * y en un equipo de cinco ese casi nunca es quien se quedó fuera.
   *
   * ⚠️ **`null` es «no te toca saberlo», no «no hay nadie».** El servidor solo
   * manda la lista a quien tiene `canManageBilling` —y al dueño—, así que
   * distinguirlo del array vacío es lo que evita decirle «no hay nadie
   * congelado» a alguien que simplemente no puede verlo.
   *
   * Va **arriba del todo y fuera de `tuPlanSlot`**, que es `null` en el plan
   * gratuito: gratis es justo donde más gente se congela.
   */
  const congelados = resumen?.congelados ?? null;

  const congeladosSlot =
    congelados && congelados.length > 0 ? (
      <div className="flex flex-col gap-4 rounded-2xl border border-warning/30 bg-warning-muted p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-sans text-lg font-semibold tracking-tight text-text-primary">
            {congelados.length === 1
              ? 'Una persona está en solo lectura'
              : `${congelados.length} personas están en solo lectura`}
          </h2>
          <p className="max-w-2xl font-sans text-sm text-text-secondary">
            Tu organización tiene más gente que asientos, así que quienes llegaron más tarde pueden
            verlo todo y no pueden escribir.{' '}
            <strong className="font-semibold text-text-primary">No se ha ido nadie</strong>: siguen
            dentro, con su papel y sus tareas, y recuperan el asiento solos —por orden— en cuanto
            amplíes el plan o se libere uno.
          </p>
        </div>

        <ul className="flex flex-col gap-1.5">
          {congelados.map((quien) => (
            <li
              key={quien.id}
              className="flex flex-wrap items-baseline gap-x-2 font-sans text-sm text-text-primary"
            >
              <span className="font-medium">{quien.email}</span>
              <span className="text-text-secondary">
                {quien.puesto === 1 ? '· el 1.º en volver' : `· el ${quien.puesto}.º en volver`}
              </span>
              {quien.userId === null && (
                <span className="text-text-secondary">· invitación sin aceptar</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  /**
   * Una sola pestaña: lo tuyo arriba, la comparativa debajo.
   *
   * Antes eran dos —«Tu plan» y «Todos los planes»— y los asientos vivían en la
   * primera, que es la que nadie abre después del primer día. Ver `BillingTabs`.
   */
  const planesSlot = (
    <div className="flex flex-col gap-8">
      {congeladosSlot}
      {tuPlanSlot}

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-sans text-xl font-medium tracking-tight text-white">
            {esGratis ? 'Elige tu plan' : 'Compara los planes'}
          </h2>
          <p className="max-w-2xl font-sans text-sm text-white/60">
            {esGratis
              ? 'Estás en el plan gratuito. Sube de plan para desbloquear más asientos, más proyectos, más capacidad y más consultas al asistente.'
              : 'Las cifras de cada columna son topes: hasta dónde deja llegar ese plan. Los asientos se contratan aparte, uno a uno.'}
          </p>
        </div>
        <PlanCatalog
          planes={catalogo.planes}
          disponibles={catalogo.disponibles}
          resumen={resumen}
          precios={precios()}
          accionDe={accionDe}
        />
      </div>
    </div>
  );

  const historialSlot =
    !esGratis && permisos.canViewAuditLog ? (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-sans text-xl font-medium tracking-tight text-white">
            Registro de facturación
          </h2>
          <p className="max-w-2xl font-sans text-sm text-white/60">
            Todo lo que ha movido el plan o los asientos.
          </p>
        </div>

        {historial && historial.length > 0 ? (
          <ol className="overflow-hidden rounded-xl border border-white/10 bg-[#191919]">
            {historial.map((evento) => (
              <li
                key={evento.id}
                className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] px-5 py-3.5 last:border-b-0"
              >
                <span className="font-sans text-sm text-white">{evento.type}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-white/40">
                  {new Date(evento.occurredAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="font-sans text-sm text-white/40">
            Todavía no ha pasado nada que registrar.
          </p>
        )}
      </div>
    ) : null;

  return (
    <AppHeader title="Facturación">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
        <header className="flex flex-col gap-2 border-b border-white/[0.08] pb-6">
          <h1 className="font-sans text-3xl font-semibold tracking-tight text-white">
            Facturación
          </h1>
          <p className="max-w-2xl font-sans text-sm text-white/70">
            Gestiona el plan y los asientos de{' '}
            <strong className="font-medium text-white">{organizacion.name}</strong>.
          </p>
        </header>

        {pago === 'ok' && (
          <PaymentReturn planActual={resumen?.tier ?? 'FREE'} organizationId={organizationId} />
        )}
        {pago === 'cancelado' && (
          <p className="rounded-r-lg border-l-2 border-white/20 bg-white/[0.03] py-3 pl-4 pr-4 font-sans text-sm text-white/70">
            No se ha cobrado nada. Puedes volver a intentarlo cuando quieras.
          </p>
        )}

        <BillingTabs planes={planesSlot} historial={historialSlot} />
      </div>
    </AppHeader>
  );
}
