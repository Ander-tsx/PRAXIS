import type { BillingSummary, PlanSpec, PlanTier, Tope } from '@praxis/commons/billing/planes';
import { TEXTO_DE_ESTADO, fechaCorta } from '@praxis/commons/billing/planes';
import type { ReactNode } from 'react';

/**
 * La tabla de precios.
 *
 * ## Una sola escalera, y filas en vez de tarjetas
 *
 * Estaba partida en «Para ti» y «Para un equipo», lo que obligaba a quien la
 * mira a decidir **primero** en cuál de las dos está — una pregunta que nadie
 * sabe contestar la primera vez. Desde que la organización contiene los
 * proyectos no hay dos públicos: quien trabaja solo es una organización de un
 * asiento, así que es una lista y se lee de arriba abajo.
 *
 * Y son filas con una raya punteada, no cuatro cajas en rejilla
 * (`kyloo-design/SKILL.md` §4). Cuatro tarjetas iguales compiten entre sí por la
 * mirada; cuatro filas se comparan.
 *
 * ## Ninguna cifra se escribe aquí
 *
 * 🔴 Los topes salen del catálogo que sirve el servidor, que los lee de `PLANS`
 * —el mismo sitio del que los lee el guard que niega—. Copiarlos aquí sería
 * garantizar que un día la tabla prometa lo que el servidor rechaza, **sin un
 * solo error de compilación**.
 *
 * Los precios son la excepción y tampoco salen de aquí: viven en Stripe, y lo
 * que se enseña es el texto del entorno. Si los dos discrepan **manda Stripe**,
 * así que sin precio se escribe «—» antes que inventarse una cifra.
 */
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
  /** Los que **este** despliegue puede cobrar. */
  disponibles: PlanTier[];
  resumen: BillingSummary | null;
  precios: Partial<Record<PlanTier, string>>;
  /** El botón de cada plan. La página decide cuál lleva y cuál no. */
  accionDe: (plan: PlanSpec) => ReactNode;
  /** El botón del portal de facturación, si ya es cliente. */
  accionPortal: ReactNode;
  /** La enhorabuena, si se vuelve de un pago. */
  vueltaDelPago: ReactNode;
}) {
  const actual = resumen?.tier ?? 'FREE';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      {vueltaDelPago}

      <p className="pb-8 font-serif text-base italic text-text-secondary">
        Todos los planes de pago van por asiento y los contrata una organización. Si trabajas solo,
        la tuya tiene un asiento y funciona igual.
      </p>

      {resumen && <TuConsumo resumen={resumen} accionPortal={accionPortal} />}

      <ol className="flex flex-col border-t border-border">
        {planes.map((plan, i) => {
          const esElTuyo = plan.tier === actual;
          const seVende = disponibles.includes(plan.tier);
          const precio = precios[plan.tier] ?? null;

          return (
            <li
              key={plan.tier}
              className="flex flex-col gap-4 border-b border-dotted border-border py-7 last:border-b-0"
            >
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
                <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-text-disabled">
                  {String(i + 1).padStart(2, '0')}
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2 className="font-display text-2xl text-text-primary">
                    {plan.nombre}
                    {esElTuyo && (
                      /* Tono, no caja: la misma regla que la entrada activa de
                         la barra lateral (§13). */
                      <span className="ml-3 font-sans text-[10px] uppercase tracking-wider text-primary">
                        tu plan
                      </span>
                    )}
                    {plan.diasDePrueba > 0 && !esElTuyo && (
                      <span className="ml-3 font-sans text-[10px] uppercase tracking-wider text-success">
                        primer mes gratis
                      </span>
                    )}
                  </h2>
                  <p className="font-serif text-sm italic text-text-secondary">{plan.paraQuien}</p>
                </div>

                <div className="shrink-0 text-right">
                  <span className="font-display text-2xl tabular-nums text-text-primary">
                    {plan.contratacion === 'NINGUNA'
                      ? 'Gratis'
                      : plan.contratacion === 'CONTACTO'
                        ? 'A medida'
                        : precio === null
                          ? '—'
                          : `$${precio}`}
                  </span>
                  {plan.contratacion === 'AUTOSERVICIO' && (
                    <span className="block font-sans text-[11px] text-text-disabled">
                      por asiento al mes
                    </span>
                  )}
                </div>
              </div>

              {/* Los cuatro números que de verdad se comparan, en una línea. Una
                  tabla de dieciséis celdas para cuatro planes se lee peor que
                  cuatro frases. */}
              <dl className="flex flex-wrap gap-x-8 gap-y-2 pl-11">
                <Dato etiqueta="Asientos" valor={tope(plan.quotas.asientos)} />
                <Dato etiqueta="Proyectos" valor={tope(plan.quotas.proyectos)} />
                <Dato etiqueta="PRAX al mes" valor={tope(plan.quotas.iaMensualPorPersona)} />
                <Dato etiqueta="Adjuntos" valor={almacenamiento(plan.quotas.almacenamientoOrgMb)} />
              </dl>

              <div className="flex flex-wrap items-center gap-4 pl-11">
                {seVende || plan.contratacion !== 'AUTOSERVICIO' ? (
                  accionDe(plan)
                ) : (
                  /* ⚠️ Se dice por qué no se puede contratar, en vez de enseñar
                     un botón que responde 503 al pulsarlo. Cada precio que falte
                     en el entorno apaga **solo su plan**. */
                  <span className="font-sans text-xs text-text-disabled">
                    No disponible en esta instalación.
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Lo que llevas gastado, arriba y en una línea. */
function TuConsumo({
  resumen,
  accionPortal,
}: {
  resumen: BillingSummary;
  accionPortal: ReactNode;
}) {
  const topeIa = resumen.quotas.iaMensualPorPersona;

  return (
    <section className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 py-7">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="font-display text-xl text-text-primary">Lo que llevas este mes</h2>
        <p className="font-sans text-sm text-text-secondary">
          {resumen.uso.iaMensual} de {topeIa === null ? 'ilimitados' : topeIa} mensajes a PRAX.
          Vuelven el {fechaCorta(resumen.iaReiniciaEn)}.
        </p>
        {/* ⚠️ `PAST_DUE` no dice que se haya perdido nada, porque no se ha
            perdido: el acceso sigue mientras Stripe reintenta. */}
        {resumen.status !== 'ACTIVE' && (
          <p className="font-sans text-xs text-warning">{TEXTO_DE_ESTADO[resumen.status]}</p>
        )}
      </div>
      <div className="shrink-0">{accionPortal}</div>
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <dt className="font-sans text-[10px] uppercase tracking-wider text-text-disabled">
        {etiqueta}
      </dt>
      <dd className="font-mono text-sm tabular-nums text-text-secondary">{valor}</dd>
    </div>
  );
}

/**
 * Un tope, escrito.
 *
 * ⚠️ `null` es **sin límite**, no «no se pudo leer». Es una constante del
 * catálogo, no una respuesta que pueda fallar — y por eso aquí se escribe «sin
 * tope» y no un guion.
 */
function tope(valor: Tope): string {
  return valor === null ? 'sin tope' : String(valor);
}

/** Los megabytes, en la unidad que se lee. */
function almacenamiento(mb: Tope): string {
  if (mb === null) return 'sin tope';
  return mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`;
}
