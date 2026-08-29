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
          <p className="max-w-2xl font-sans text-sm text-white/50">
            Gestiona el plan y los asientos de <span className="text-white/80">{organizacion.name}</span>.
          </p>
        </header>

        {pago === 'ok' && (
          <PaymentReturn planActual={resumen?.tier ?? 'FREE'} organizationId={organizationId} />
        )}
        {pago === 'cancelado' && (
          <p className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 font-sans text-sm text-white/70">
            No se ha cobrado nada. Puedes volver a intentarlo cuando quieras.
          </p>
        )}

        {esGratis ? (
          <div className="flex flex-col gap-12">
            <div className="flex flex-col gap-4 text-center items-center my-8">
              <h2 className="text-2xl font-bold text-white tracking-tight">Potencia tu equipo</h2>
              <p className="text-white/60 max-w-lg text-sm">
                Actualmente estás en el plan gratuito. Mejora tu plan para desbloquear características premium, mayor capacidad y soporte prioritario.
              </p>
            </div>
            
            <PlanCatalog
              planes={catalogo.planes}
              disponibles={catalogo.disponibles}
              resumen={resumen}
              precios={preciosDelEntorno()}
              accionDe={(plan) => {
                if (plan.tier === 'FREE') return null;
                if (plan.contratacion === 'AUTOSERVICIO') {
                  const btnClass = plan.tier === 'TEAM'
                    ? 'w-full text-center bg-white text-black font-bold py-3 px-4 rounded-xl hover:bg-white/90 transition-all'
                    : 'w-full text-center bg-white/10 text-white font-bold py-3 px-4 rounded-xl hover:bg-white/20 border border-white/20 transition-all';
                  
                  if (!puedeContratar) {
                    return <p className="w-full text-center text-xs text-white/40">Solo el creador puede mejorar el plan.</p>;
                  }
                  
                  return (
                    <CheckoutButton destino="checkout" tier={plan.tier} organizationId={organizationId} seats={Math.max(plan.asientosMinimos, organizacion.seatsUsed)}>
                      Actualizar a {plan.nombre}
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
        ) : (
          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-6 rounded-3xl border border-white/[0.06] bg-[#0A0A0A] p-8 relative overflow-hidden">
              {/* Decorative accent */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none"></div>
              
              <div className="flex justify-between items-start z-10">
                <div className="flex flex-col gap-1">
                  <span className="text-emerald-400 font-bold text-xs uppercase tracking-wider">Plan Actual</span>
                  <h2 className="font-sans text-3xl font-bold text-white">{spec?.nombre}</h2>
                  <p className="font-sans text-sm text-white/50 mt-1">Suscripción activa para {organizacion.name}</p>
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

            {permisos.canViewAuditLog && (
              <section className="flex flex-col gap-5 rounded-2xl border border-white/[0.06] bg-[#0A0A0A] p-6 sm:p-7">
                <div className="flex flex-col gap-1">
                  <h2 className="font-sans text-base font-semibold text-white/90">Registro de facturación</h2>
                  <p className="max-w-xl font-sans text-xs text-white/40">Todo lo que ha movido el plan o los asientos.</p>
                </div>
                
                {historial && historial.length > 0 ? (
                  <ol className="flex flex-col">
                    {historial.map((evento) => (
                      <li key={evento.id} className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] py-3.5 last:border-b-0">
                        <span className="font-sans text-sm text-white/80">{evento.type}</span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-white/30">{new Date(evento.occurredAt).toLocaleString()}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="rounded-xl border border-white/[0.06] bg-black/20 p-5 font-sans text-sm text-white/45">Todavía no ha pasado nada que registrar.</p>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </AppHeader>
  );
}
