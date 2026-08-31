import { SeatsPanel } from '@/components/organisms/Organizations';
import { CheckoutButton } from '@/components/organisms/Billing/CheckoutButton';
import { PlanCatalog } from '@/components/organisms/Billing';
import { AppHeader } from '@praxis/commons';
import { createServerApiClient, loadPrivateChrome } from '@praxis/commons/auth';
import type {
  BillingEventView,
  CatalogoDePlanes,
  OrganizationView,
  BillingSummary,
} from '@praxis/commons/billing/planes';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PaymentReturn } from '@/components/organisms/Billing/PaymentReturn';

export const metadata: Metadata = { title: 'Facturación' };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const { pago } = await searchParams;
  const { organizacionActivaId } = await loadPrivateChrome();
  const organizationId = organizacionActivaId;

  if (!organizationId) {
    return (
      <AppHeader title="Facturación">
        <p className="font-sans text-sm text-text-secondary">Crea o selecciona una organización primero.</p>
      </AppHeader>
    );
  }

  const api = createServerApiClient();

  const [organizacion, historial, catalogo, resumen] = await Promise.all([
    api.get<OrganizationView>(`/organizations/${organizationId}`).catch(() => null),
    api.get<BillingEventView[]>(`/organizations/${organizationId}/history`).catch(() => null),
    api.get<CatalogoDePlanes>('/me/billing/planes').catch(() => null),
    api.get<BillingSummary>(`/me/billing/resumen?organizationId=${organizationId}`).catch(() => null),
  ]);

  if (!organizacion || !catalogo) {
    return (
      <AppHeader title="Facturación">
        <p className="font-sans text-sm text-text-secondary">No se pudo cargar la información de facturación.</p>
      </AppHeader>
    );
  }

  const permisos = organizacion.myPermissions;
  const esGratis = organizacion.tier === 'FREE';
  const spec = catalogo.planes.find((p) => p.tier === organizacion.tier);
  const activa = resumen?.organizaciones.find((o) => o.id === organizationId);
  const puedeContratar = Boolean(activa?.soyDueno);
  
  const preciosDelEntorno = (): Partial<Record<"FREE"|"TEAM"|"BUSINESS"|"ENTERPRISE", string>> => {
    return {
      FREE: '0',
      ...(process.env.NEXT_PUBLIC_PRECIO_TEAM ? { TEAM: process.env.NEXT_PUBLIC_PRECIO_TEAM } : {}),
      ...(process.env.NEXT_PUBLIC_PRECIO_BUSINESS ? { BUSINESS: process.env.NEXT_PUBLIC_PRECIO_BUSINESS } : {}),
    };
  };

  return (
    <AppHeader title="Facturación" anchoCompleto={true}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 pb-16 px-4">
        <header className="flex flex-col gap-2">
          <h1 className="font-sans text-3xl font-bold text-white tracking-tight">Facturación</h1>
          <p className="max-w-2xl font-sans text-sm text-white">
            Gestiona el plan y los asientos de <span className="text-white">{organizacion.name}</span>.
          </p>
        </header>

        {pago === 'ok' && (
          <PaymentReturn planActual={resumen?.tier ?? 'FREE'} organizationId={organizationId} />
        )}
        {pago === 'cancelado' && (
          <p className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 font-sans text-sm text-white">
            No se ha cobrado nada. Puedes volver a intentarlo cuando quieras.
          </p>
        )}

        <div className="flex flex-col gap-12">
          {esGratis ? (
            <div className="flex flex-col gap-4 text-center items-center my-4">
              <h2 className="text-2xl font-bold text-white tracking-tight">Potencia tu equipo</h2>
              <p className="text-white max-w-lg text-sm">
                Actualmente estás en el plan gratuito. Mejora tu plan para desbloquear características premium, mayor capacidad y soporte prioritario.
              </p>
            </div>
          ) : (
            <section className="flex flex-col gap-6 border-b border-white/[0.08] pb-12 relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none"></div>
              
              <div className="flex justify-between items-start z-10">
                <div className="flex flex-col gap-1">
                  <span className="text-primary font-bold text-xs uppercase tracking-wider">Plan Actual</span>
                  <h2 className="font-sans text-3xl font-bold text-white">{spec?.nombre}</h2>
                  <p className="font-sans text-sm text-white mt-1">Suscripción activa para {organizacion.name}</p>
                </div>
                {resumen?.gestionable && (
                   <CheckoutButton destino="portal">Gestionar en Stripe</CheckoutButton>
                )}
              </div>
              
              <div className="mt-4 z-10">
                <SeatsPanel
                  organizationId={organizationId}
                  contratados={organizacion.seats}
                  ocupados={organizacion.seatsUsed}
                />
              </div>
            </section>
          )}

          <div className="pt-4">
            <PlanCatalog
              planes={catalogo.planes}
              disponibles={catalogo.disponibles}
              resumen={resumen}
              precios={preciosDelEntorno()}
              accionDe={(plan) => {
                const esElMismo = plan.tier === organizacion.tier;
                if (plan.tier === 'FREE') return null;
                if (plan.contratacion === 'AUTOSERVICIO') {
                  if (esElMismo) {
                    return (
                      <span className="w-full text-center bg-white/5 text-white/50 font-bold py-3 px-4 rounded-xl cursor-not-allowed">
                        Plan Actual
                      </span>
                    );
                  }
                  
                  if (!puedeContratar) {
                    return <p className="w-full text-center text-xs text-white">Solo el creador puede mejorar el plan.</p>;
                  }
                  
                  return (
                    <CheckoutButton destino="checkout" tier={plan.tier} organizationId={organizationId} seats={Math.max(plan.asientosMinimos, organizacion.seatsUsed)}>
                      Cambiar a {plan.nombre}
                    </CheckoutButton>
                  );
                }
                return (
                  <a href="mailto:ventas@praxis.com" className="w-full text-center border border-white/20 text-white font-bold py-3 px-4 rounded-xl hover:bg-white/5 transition-all">
                    Contactar ventas
                  </a>
                );
              }}
              accionPortal={null}
              vueltaDelPago={null}
            />
          </div>

          {!esGratis && permisos.canViewAuditLog && (
            <section className="flex flex-col gap-5 pt-8 border-t border-white/[0.08]">
              <div className="flex flex-col gap-1">
                <h2 className="font-sans text-base font-semibold text-white">Registro de facturación</h2>
                <p className="max-w-xl font-sans text-xs text-white">Todo lo que ha movido el plan o los asientos.</p>
              </div>
              
              {historial && historial.length > 0 ? (
                <ol className="flex flex-col">
                  {historial.map((evento) => (
                    <li key={evento.id} className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] py-3.5 last:border-b-0">
                      <span className="font-sans text-sm text-white">{evento.type}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-white/60">{new Date(evento.occurredAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="font-sans text-sm text-white/50 py-4">Todavía no ha pasado nada que registrar.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </AppHeader>
  );
}
