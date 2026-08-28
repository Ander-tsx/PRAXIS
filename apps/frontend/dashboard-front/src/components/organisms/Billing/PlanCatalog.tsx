import type {
  BillingSummary,
  PlanSpec,
  PlanTier,
  QuotaExcedida,
  Tope,
} from '@praxis/commons/billing/planes';
import { TEXTO_DE_ESTADO, fechaCorta } from '@praxis/commons/billing/planes';
import type { ReactNode } from 'react';
import { CompareTable } from './CompareTable';

export function tope(valor: Tope): string {
  return valor === null ? 'Ilimitado' : String(valor);
}

export function almacenamiento(mb: Tope): string {
  if (mb === null) return 'Ilimitado';
  return mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`;
}

function CheckIcon() {
  return (
    <svg
      className="w-5 h-5 text-primary shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
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
          Todos los planes de pago van por asiento y se asocian a tu organización. Comienza gratis y
          escala cuando lo necesites.
        </p>
      </div>

      {resumen && <TuConsumo resumen={resumen} accionPortal={accionPortal} />}
      {resumen && <TopesRebasados excedidas={resumen.excedidas} />}

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
                    <span>
                      <strong className="text-white">{tope(plan.quotas.asientos)}</strong> asientos
                    </span>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-white/70">
                    <CheckIcon />
                    <span>
                      <strong className="text-white">{tope(plan.quotas.proyectos)}</strong>{' '}
                      proyectos
                    </span>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-white/70">
                    <CheckIcon />
                    <span>
                      <strong className="text-white">
                        {tope(plan.quotas.iaMensualPorPersona)}
                      </strong>{' '}
                      consultas de IA/mes
                    </span>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-white/70">
                    <CheckIcon />
                    <span>
                      <strong className="text-white">
                        {almacenamiento(plan.quotas.almacenamientoOrgMb)}
                      </strong>{' '}
                      de almacenamiento
                    </span>
                  </li>
                </ul>
              </div>

              <div className="mt-auto pt-6 border-t border-white/5">
                {seVende || plan.contratacion !== 'AUTOSERVICIO' ? (
                  <div
                    className={`w-full flex justify-center ${esDestacado ? 'text-primary' : 'text-white'}`}
                  >
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

/**
 * Cómo se nombra cada tope rebasado, y qué se puede hacer con él.
 *
 * ⚠️ **Cada uno dice su propia salida.** Es la misma regla que el mensaje del
 * 402: quien tiene proyectos de más puede borrar uno y quedarse dentro; quien
 * tiene asientos de más no puede hacer nada salvo sacar a alguien; y quien se
 * pasó de mensajes de IA no puede hacer nada en absoluto hasta el día 1. Una
 * frase genérica los trata igual y solo uno de los tres tiene arreglo barato.
 */
const REBASADO: Record<QuotaExcedida['kind'], (excedida: QuotaExcedida) => string> = {
  proyectos: (e) =>
    `Tienes ${e.actual} proyectos y tu plan llega a ${e.tope}. Se abren y se editan como siempre; lo que no se puede es crear otro.`,
  asientos: (e) =>
    `Hay ${e.actual} asientos ocupados y el plan paga ${e.tope}. Nadie pierde el suyo; no se puede invitar a más hasta que se libere alguno.`,
  almacenamiento: (e) =>
    `Los adjuntos ocupan ${e.actual} MB y el plan da ${e.tope}. Los archivos siguen ahí y se descargan; no se puede subir otro.`,
  ia_mensual: (e) =>
    `Llevas ${e.actual} mensajes a PRAX este mes y el plan da ${e.tope}. El contador vuelve a cero el día 1.`,
  /* Los dos que no pueden llegar aquí, y por qué. El `Record` los exige
     completos, y dejarlos con una cadena vacía sería una tarjeta en blanco el
     día que alguno sí llegue. */
  automatizaciones: (e) =>
    `Un proyecto tiene ${e.actual} automatizaciones activas y el plan da ${e.tope}. Pausa alguna.`,
  organizaciones: (e) =>
    `Tienes ${e.actual} organizaciones a tu nombre y el máximo por persona es ${e.tope}.`,
};

/**
 * Los topes que ya están rebasados.
 *
 * 🔴 **Se llega aquí bajando de plan, no creando de más**, y por eso hace falta
 * dibujarlo: nadie hizo nada: bajó el techo. Sin esta tarjeta, quien administra
 * se entera pulsando un botón que no responde, y un tope rebasado sin
 * explicación se lee como una avería — que no se paga, se abandona.
 *
 * ⚠️ **No dice «has excedido» ni pide arreglarlo.** Nada se ha borrado y nada se
 * va a borrar; lo que cambia es que no entran más. La frase de cada uno lo dice
 * en ese orden a propósito: primero lo que sigue funcionando, después lo que no.
 */
function TopesRebasados({ excedidas }: { excedidas: QuotaExcedida[] }) {
  if (excedidas.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 p-6 sm:p-8 rounded-3xl bg-amber-500/10 border border-amber-500/30 mb-8">
      <h2 className="text-lg font-bold text-white">
        Tu plan actual se queda corto para lo que ya tienes
      </h2>
      <p className="text-sm text-white/60">
        No se ha borrado nada y no se va a borrar. Lo que hay sigue abierto y sigue funcionando; lo
        que no se puede es añadir más hasta que amplíes el plan o liberes sitio.
      </p>
      <ul className="flex flex-col gap-2 mt-2">
        {excedidas.map((excedida) => (
          <li key={excedida.kind} className="text-sm text-white/80 flex gap-3">
            <span aria-hidden="true" className="text-amber-500">
              •
            </span>
            <span>{REBASADO[excedida.kind](excedida)}</span>
          </li>
        ))}
      </ul>
    </section>
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
          Has usado <strong className="text-white">{resumen.uso.iaMensual}</strong> de{' '}
          <strong className="text-white">{topeIa === null ? 'ilimitados' : topeIa}</strong> mensajes
          a PRAX. Se reinician el {fechaCorta(resumen.iaReiniciaEn)}.
        </p>
      </div>
      <div className="shrink-0">{accionPortal}</div>
    </section>
  );
}
