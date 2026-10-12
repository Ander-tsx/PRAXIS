import { formatearTokens } from '@praxis/commons/api/assistant';
import type {
  BillingSummary,
  PlanSpec,
  PlanTier,
  QuotaExcedida,
  Tope,
} from '@praxis/commons/billing/planes';
import { TEXTO_DE_ESTADO, fechaCorta } from '@praxis/commons/billing/planes';
import type { ReactNode } from 'react';

/** Un tope, escrito para una celda de la matriz. `null` es «sin límite». */
function tope(valor: Tope): string {
  return valor === null ? 'Ilimitado' : String(valor);
}

/** Los MB de una cuota, en la unidad que se lee de un vistazo. */
function almacenamiento(mb: Tope): string {
  if (mb === null) return 'Ilimitado';
  return mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`;
}

/** El historial de Análisis: días hacia atrás, o «completo» cuando no acota. */
function historial(dias: Tope): string {
  return dias === null ? 'Completo' : `${dias} días`;
}

/**
 * El catálogo de planes, como **una sola matriz de comparación** — no cuatro
 * tarjetas.
 *
 * ## Por qué se rehízo entero
 *
 * Eran cuatro tarjetas con degradado, sombra difusa, esquinas de 32 px y un
 * `hover:-translate-y-2`: todo lo que el lenguaje de la aplicación evita a
 * propósito (nada que grite, radios tenues, jerarquía por tono y no por caja).
 * Y para colmo repetían la información de la tabla de comparación que había
 * justo debajo, colapsada tras un botón.
 *
 * Ahora es una tabla: los planes son columnas, las cuotas son filas, y el plan
 * activo se marca tiñendo su columna un punto —no con una píldora flotante ni
 * una sombra de color—. La acción de cada plan vive en el pie de su columna.
 * Una sola lectura, de izquierda a derecha, sin nada que desplegar.
 */
export function PlanCatalog({
  planes,
  disponibles,
  resumen,
  precios,
  accionDe,
}: {
  planes: PlanSpec[];
  disponibles: PlanTier[];
  resumen: BillingSummary | null;
  precios: Partial<Record<PlanTier, string>>;
  accionDe: (plan: PlanSpec) => ReactNode;
}) {
  const actual = resumen?.tier ?? 'FREE';

  return (
    <div className="flex flex-col gap-8">
      {resumen && <TuConsumo resumen={resumen} />}
      {resumen && <TopesRebasados excedidas={resumen.excedidas} />}

      {/* En móvil la tabla se desplaza de lado y la primera columna —qué se
          compara— se queda fija (M6 de docs/PLAN-MOVIL.md): sin eso, a la
          tercera columna ya no se sabía de qué fila hablaba cada número. */}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-surface">
        <table className="w-full min-w-[760px] text-left font-sans text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th
                scope="col"
                className="w-[26%] px-5 py-5 align-bottom max-md:sticky max-md:left-0 max-md:z-10 max-md:bg-surface"
              >
                <span className="font-sans text-xs font-medium uppercase tracking-wider text-white/40">
                  Planes
                </span>
              </th>
              {planes.map((plan) => {
                const esActual = plan.tier === actual;
                /* Pro desde 2026-10-02: el plan fijo para equipos pequeños
                   (docs/PLAN-PRO-INTEGRACIONES.md). */
                const destacado = plan.tier === 'PRO';
                return (
                  <th
                    key={plan.tier}
                    scope="col"
                    className={`px-5 py-5 align-bottom ${esActual ? 'bg-white/[0.03]' : ''}`}
                  >
                    <div className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-sans text-base font-semibold text-white">
                          {plan.nombre}
                        </span>
                        {esActual && <Marca tono="actual">Tu plan</Marca>}
                        {destacado && !esActual && <Marca tono="popular">Popular</Marca>}
                      </span>
                      <span className="font-sans text-xs font-normal text-white/50">
                        {plan.paraQuien}
                      </span>
                      <Precio plan={plan} precio={precios[plan.tier] ?? null} />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-white/[0.06]">
            {[
              /* ⚠️ **«Asientos (máximo)», no «Asientos».** Con la etiqueta a
                 secas, la fila decía «Equipo: 15» y se leía como «Equipo trae
                 15 asientos» — que es exactamente lo que no pasa: el precio es
                 por asiento y el 15 es el techo. Ver el aviso de `SeatsPanel`. */
              {
                label: 'Asientos (máximo)',
                /* En un precio fijo el máximo viene incluido: no se compran. */
                valor: (p: PlanSpec) =>
                  p.precioFijo ? `${tope(p.quotas.asientos)}, incluidos` : tope(p.quotas.asientos),
              },
              { label: 'Proyectos', valor: (p: PlanSpec) => tope(p.quotas.proyectos) },
              {
                /* Tokens PRAX por persona (D8 de docs/PLAN-PRAX-SEMIAGENTICO.md): un
                   mensaje ya no cuesta lo mismo que otro desde que PRAX consulta
                   antes de responder. La explicación va debajo de la tabla. */
                label: 'Tokens de IA / mes por persona',
                valor: (p: PlanSpec) =>
                  p.quotas.iaTokensMensualesPorPersona === null
                    ? 'Ilimitado'
                    : formatearTokens(p.quotas.iaTokensMensualesPorPersona),
              },
              {
                label: 'Automatizaciones por proyecto',
                valor: (p: PlanSpec) => tope(p.quotas.automatizacionesPorProyecto),
              },
              {
                label: 'Almacenamiento',
                valor: (p: PlanSpec) => almacenamiento(p.quotas.almacenamientoOrgMb),
              },
              {
                label: 'Historial de Análisis',
                valor: (p: PlanSpec) => historial(p.quotas.historialAnalisisDias),
              },
            ].map((fila) => (
              <tr key={fila.label}>
                <th
                  scope="row"
                  className="px-5 py-3.5 font-sans font-medium text-white/60 max-md:sticky max-md:left-0 max-md:z-10 max-md:bg-surface"
                >
                  {fila.label}
                </th>
                {planes.map((plan) => {
                  const esActual = plan.tier === actual;
                  return (
                    <td
                      key={plan.tier}
                      className={`px-5 py-3.5 font-sans tabular-nums text-white ${
                        esActual ? 'bg-white/[0.03]' : ''
                      }`}
                    >
                      {fila.valor(plan)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t border-white/10">
              <td className="px-5 py-5 max-md:sticky max-md:left-0 max-md:z-10 max-md:bg-surface" />
              {planes.map((plan) => {
                const esActual = plan.tier === actual;
                const seVende = disponibles.includes(plan.tier);
                const noDisponible = !seVende && plan.contratacion === 'AUTOSERVICIO';
                return (
                  <td
                    key={plan.tier}
                    className={`px-5 py-5 align-top ${esActual ? 'bg-white/[0.03]' : ''}`}
                  >
                    {noDisponible ? (
                      <span className="font-sans text-xs text-white/40">
                        No disponible en esta instalación
                      </span>
                    ) : (
                      accionDe(plan)
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Qué es un token PRAX, dicho donde se compra (D8). Sin esto la fila de la
          tabla es un número que nadie sabe traducir a «cuánto puedo usarlo». */}
      <p className="max-w-3xl font-sans text-xs text-white/40">
        <strong className="text-white/60">Tokens:</strong> lo que gasta el asistente, medido como lo
        cobra el modelo. Lo que PRAX lee cuenta una vez; lo que escribe, ocho, porque cuesta ocho
        veces más. Una pregunta corta sobre un proyecto ronda los 15-20 mil; consultar varios
        proyectos o mantener una conversación muy larga gasta más, y PRAX te avisa cuando seguirla
        sale caro. Cada persona tiene su cuota entera dentro de la organización.
      </p>

      <p className="max-w-3xl font-sans text-xs text-white/40">
        Pro es un <strong className="text-white/60">precio fijo</strong> para toda la organización,
        con sus asientos incluidos, y el primer mes es gratis —una vez por persona y por
        organización—. Los demás planes de pago se cobran{' '}
        <strong className="text-white/60">por asiento</strong>: contratarlos no compra sus asientos,
        las cifras de la tabla son el <strong className="text-white/60">máximo</strong> al que deja
        llegar cada plan, y los asientos se añaden uno a uno desde «Tu plan», arriba. Empieza gratis
        y cambia cuando lo necesites.
      </p>
    </div>
  );
}

/** El precio de una columna: cifra grande y la unidad en pequeño al lado. */
function Precio({ plan, precio }: { plan: PlanSpec; precio: string | null }) {
  const texto =
    plan.contratacion === 'NINGUNA'
      ? 'Gratis'
      : plan.contratacion === 'CONTACTO'
        ? 'A medida'
        : precio === null
          ? '—'
          : `$${precio}`;

  return (
    <span className="mt-1 flex items-baseline gap-1">
      <span className="font-sans text-xl font-semibold text-white">{texto}</span>
      {plan.contratacion === 'AUTOSERVICIO' && precio !== null && (
        <span className="font-sans text-xs font-normal text-white/40">
          {plan.precioFijo ? '/ mes' : '/ asiento · mes'}
        </span>
      )}
    </span>
  );
}

/** Una marca discreta en la cabecera de columna: «Tu plan», «Popular». */
function Marca({ tono, children }: { tono: 'actual' | 'popular'; children: ReactNode }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider ${
        tono === 'actual' ? 'border-white/20 text-white/70' : 'border-primary/40 text-primary'
      }`}
    >
      {children}
    </span>
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
    `Llevas ${formatearTokens(e.actual)} tokens este mes y el plan da ${formatearTokens(e.tope)}. El contador vuelve a cero el día 1.`,
  /* Los dos que no pueden llegar aquí, y por qué. El `Record` los exige
     completos, y dejarlos con una cadena vacía sería una línea en blanco el
     día que alguno sí llegue. */
  automatizaciones: (e) =>
    `Un proyecto tiene ${e.actual} automatizaciones activas y el plan da ${e.tope}. Pausa alguna.`,
  organizaciones: (e) =>
    `Tienes ${e.actual} organizaciones a tu nombre y el máximo por persona es ${e.tope}.`,
  /* Tampoco llega aquí: no es un número que se rebase sino una capacidad que
     el plan no trae. Los tokens que hubiera dejan de funcionar solos. */
  integraciones: () =>
    'Este plan no trae integraciones: los agentes conectados por MCP dejan de funcionar hasta volver a Pro.',
};

/**
 * Los topes que ya están rebasados.
 *
 * 🔴 **Se llega aquí bajando de plan, no creando de más**: nadie hizo nada, bajó
 * el techo. Sin decirlo, quien administra se entera pulsando un botón que no
 * responde, y un tope rebasado sin explicación se lee como una avería.
 *
 * ⚠️ **No dice «has excedido» ni pide arreglarlo.** Nada se ha borrado y nada se
 * va a borrar; lo que cambia es que no entran más. Una raya de acento a la
 * izquierda, no una caja tintada — el mismo recurso que los avisos del resto
 * del portal.
 */
function TopesRebasados({ excedidas }: { excedidas: QuotaExcedida[] }) {
  if (excedidas.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 rounded-r-lg border-l-2 border-warning bg-warning/[0.06] py-4 pl-4 pr-4">
      <h3 className="font-sans text-sm font-semibold text-white">
        Tu plan se queda corto para lo que ya tienes
      </h3>
      <p className="font-sans text-sm text-white/60">
        No se ha borrado nada y no se va a borrar. Lo que hay sigue abierto y sigue funcionando; lo
        que no se puede es añadir más hasta que amplíes el plan o liberes sitio.
      </p>
      <ul className="mt-1 flex flex-col gap-1.5">
        {excedidas.map((excedida) => (
          <li key={excedida.kind} className="flex gap-2 font-sans text-sm text-white/70">
            <span aria-hidden="true" className="text-warning">
              •
            </span>
            <span>{REBASADO[excedida.kind](excedida)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** El consumo del mes en curso: una línea, con el estado si no es «al día». */
function TuConsumo({ resumen }: { resumen: BillingSummary }) {
  const topeIa = resumen.quotas.iaTokensMensualesPorPersona;

  return (
    <div className="flex flex-col gap-1 border-b border-white/[0.08] pb-5">
      <div className="flex items-center gap-2">
        <h3 className="font-sans text-sm font-semibold text-white">Tu consumo este mes</h3>
        {resumen.status !== 'ACTIVE' && (
          <span className="rounded border border-error/40 px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-error">
            {TEXTO_DE_ESTADO[resumen.status]}
          </span>
        )}
      </div>
      <p className="font-sans text-sm text-white/60">
        <span className="tabular-nums text-white">{formatearTokens(resumen.uso.iaMensual)}</span> de{' '}
        <span className="tabular-nums text-white">
          {topeIa === null ? 'ilimitados' : formatearTokens(topeIa)}
        </span>{' '}
        tokens. Se reinician el {fechaCorta(resumen.iaReiniciaEn)}.
      </p>
    </div>
  );
}
