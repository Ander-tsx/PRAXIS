import { CompareTable } from './CompareTable';
import type { BillingSummary, PlanSpec, PlanTier, Tope } from '@praxis/commons/billing/planes';
import { TEXTO_DE_ESTADO, fechaCorta } from '@praxis/commons/billing/planes';
import type { ReactNode } from 'react';

export function tope(valor: Tope): string {
  return valor === null ? 'Ilimitado' : String(valor);
}

export function almacenamiento(mb: Tope): string {
  if (mb === null) return 'Ilimitado';
  return mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`;
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function PlanCatalog({
  planes,
  disponibles,
  resumen,
  precios,
  accionDe,
  accionPortal,
  vueltaDelPago,
}: {
  planes: PlanSpec[];
  disponibles: PlanTier[];
  resumen: BillingSummary | null;
  precios: Partial<Record<PlanTier, string>>;
  accionDe: (plan: PlanSpec) => ReactNode;
  accionPortal: ReactNode;
  vueltaDelPago: ReactNode;
}) {
  const actual = resumen?.tier ?? 'FREE';

  return (
    <div className="w-full max-w-[1600px] mx-auto flex flex-col px-4 sm:px-6 lg:px-8 pb-20">
      {vueltaDelPago}

      <div className="text-center mt-10 mb-12">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-4">
          Planes a la medida de tu equipo
        </h1>
        <p className="text-lg text-white/50 max-w-2xl mx-auto font-sans">
          Todos los planes de pago van por asiento y se asocian a tu organización.
          Comienza gratis y escala cuando lo necesites.
        </p>
      </div>

      {resumen && <TuConsumo resumen={resumen} accionPortal={accionPortal} />}

      {/* Tarjetas de Precios */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 xl:gap-8 mt-8">
        {planes.map((plan) => {
          const esElTuyo = plan.tier === actual;
          const seVende = disponibles.includes(plan.tier);
          const precio = precios[plan.tier] ?? null;
          const esDestacado = plan.tier === 'TEAM';

          return (
            <div 
              key={plan.tier} 
              className={`relative flex flex-col rounded-[32px] p-6 xl:p-8 transition-transform duration-300 hover:-translate-y-2 ${
                esDestacado 
                  ? 'bg-gradient-to-b from-[#1F1626] to-[#0A0A0A] border border-primary/50 shadow-[0_0_40px_-15px_rgba(139,92,246,0.3)]' 
                  : 'bg-[#0F0F0F] border border-white/5'
              }`}
            >
              {esElTuyo && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-white text-black text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg">
                  Tu Plan Actual
                </div>
              )}
              {esDestacado && !esElTuyo && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg shadow-primary/30">
                  Más Popular
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-2">{plan.nombre}</h3>
                <p className="text-sm text-white/50 h-10">{plan.paraQuien}</p>
              </div>

              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-white">
                    {plan.contratacion === 'NINGUNA'
                      ? 'Gratis'
                      : plan.contratacion === 'CONTACTO'
                        ? 'A medida'
                        : precio === null
                          ? '—'
                          : `$${precio}`}
                  </span>
                  {plan.contratacion === 'AUTOSERVICIO' && (
                    <span className="text-sm text-white/40 font-medium">/ mes</span>
                  )}
                </div>
                {plan.contratacion === 'AUTOSERVICIO' && (
                  <p className="text-xs text-white/30 mt-1">facturado por asiento</p>
                )}
              </div>

              <div className="mb-8 flex-1">
                <ul className="flex flex-col gap-4">
                  <li className="flex items-start gap-3 text-sm text-white/70">
                    <CheckIcon />
                    <span><strong className="text-white">{tope(plan.quotas.asientos)}</strong> asientos</span>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-white/70">
                    <CheckIcon />
                    <span><strong className="text-white">{tope(plan.quotas.proyectos)}</strong> proyectos</span>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-white/70">
                    <CheckIcon />
                    <span><strong className="text-white">{tope(plan.quotas.iaMensualPorPersona)}</strong> consultas de IA/mes</span>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-white/70">
                    <CheckIcon />
                    <span><strong className="text-white">{almacenamiento(plan.quotas.almacenamientoOrgMb)}</strong> de almacenamiento</span>
                  </li>
                </ul>
              </div>

              <div className="mt-auto pt-6 border-t border-white/5">
                {seVende || plan.contratacion !== 'AUTOSERVICIO' ? (
                  <div className={`w-full flex justify-center ${esDestacado ? 'text-primary' : 'text-white'}`}>
                    {accionDe(plan)}
                  </div>
                ) : (
                  <span className="block text-center font-sans text-xs text-red-400 bg-red-400/10 py-2.5 rounded-xl">
                    No disponible en esta instalación.
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CompareTable planes={planes} />
    </div>
  );
}

function TuConsumo({
  resumen,
  accionPortal,
}: {
  resumen: BillingSummary;
  accionPortal: ReactNode;
}) {
  const topeIa = resumen.quotas.iaMensualPorPersona;

  return (
    <section className="flex flex-col sm:flex-row items-center justify-between gap-6 p-6 sm:p-8 rounded-3xl bg-white/5 border border-white/10 mb-8 backdrop-blur-sm">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold text-white flex items-center gap-3">
          Resumen de tu cuenta
          {resumen.status !== 'ACTIVE' && (
            <span className="text-[10px] uppercase tracking-widest bg-red-500/20 text-red-500 px-3 py-1 rounded-full font-bold">
              {TEXTO_DE_ESTADO[resumen.status]}
            </span>
          )}
        </h2>
        <p className="text-sm text-white/60">
          Has usado <strong className="text-white">{resumen.uso.iaMensual}</strong> de <strong className="text-white">{topeIa === null ? 'ilimitados' : topeIa}</strong> mensajes a PRAX. 
          Se reinician el {fechaCorta(resumen.iaReiniciaEn)}.
        </p>
      </div>
      <div className="shrink-0">{accionPortal}</div>
    </section>
  );
}
