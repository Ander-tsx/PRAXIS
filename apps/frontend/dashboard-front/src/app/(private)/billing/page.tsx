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
          seats={Math.max(plan.asientosMinimos, organizacion.seatsUsed)}
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

  const tuPlanSlot = esGratis ? null : (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-sans text-xs font-semibold uppercase tracking-wider text-primary">
            Plan actual
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
        <SeatsPanel
          organizationId={organizationId}
          contratados={organizacion.seats}
          ocupados={organizacion.seatsUsed}
        />
      </div>
    </div>
  );

  const planesSlot = (
    <div className="flex flex-col gap-6">
      {esGratis && (
        <div className="flex flex-col gap-1.5">
          <h2 className="font-sans text-xl font-medium tracking-tight text-white">Elige tu plan</h2>
          <p className="max-w-2xl font-sans text-sm text-white/60">
            Estás en el plan gratuito. Sube de plan para desbloquear más asientos, más proyectos,
            más capacidad y más consultas al asistente.
          </p>
        </div>
      )}
      <PlanCatalog
        planes={catalogo.planes}
        disponibles={catalogo.disponibles}
        resumen={resumen}
        precios={precios()}
        accionDe={accionDe}
      />
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

        <BillingTabs tuPlan={tuPlanSlot} planes={planesSlot} historial={historialSlot} />
      </div>
    </AppHeader>
  );
}
