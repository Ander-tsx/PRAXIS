'use client';

import { colors } from '@praxis/commons';
import { useId, useMemo, useState } from 'react';
import { type Burndown, conUnidad } from './burndown';

const ANCHO = 600;
const ALTO = 180;
const MARGEN = { arriba: 12, derecha: 16, abajo: 22, izquierda: 30 };

const diaCorto = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

/**
 * El burndown del sprint en curso: lo que queda, contra la recta de ir a ritmo.
 *
 * Dos series y un solo eje. «Restante» va en el color de la aplicación y trazo
 * continuo; «ideal» es una referencia, en gris y discontinua — se distinguen
 * por trazo además de por color, y las dos llevan nombre en la leyenda y al
 * final de la línea. Pasar el dedo o el ratón enseña el día; la tabla de abajo
 * es la misma información para quien no ve el gráfico.
 */
export function BurndownChart({ datos }: { datos: Burndown }) {
  const idTitulo = useId();
  const [foco, setFoco] = useState<number | null>(null);

  const { dias, unidad } = datos;
  const vistos = dias.filter((d) => d.transcurrido);
  const maximo = Math.max(1, ...dias.map((d) => Math.max(d.alcance, d.ideal)));

  const escala = useMemo(() => {
    const ancho = ANCHO - MARGEN.izquierda - MARGEN.derecha;
    const alto = ALTO - MARGEN.arriba - MARGEN.abajo;
    const pasos = Math.max(1, dias.length - 1);
    return {
      x: (i: number) => MARGEN.izquierda + (ancho * i) / pasos,
      y: (v: number) => MARGEN.arriba + alto * (1 - v / maximo),
    };
  }, [dias.length, maximo]);

  const linea = (valores: { i: number; v: number }[]) =>
    valores.map(({ i, v }, n) => `${n === 0 ? 'M' : 'L'}${escala.x(i)},${escala.y(v)}`).join(' ');

  const restante = linea(vistos.map((d, i) => ({ i, v: d.restante })));
  const ideal = linea(dias.map((d, i) => ({ i, v: d.ideal })));
  const ultimo = vistos.length - 1;
  const marcas = [0, Math.round(maximo / 2), maximo];

  function alMover(evento: React.PointerEvent<SVGSVGElement>) {
    const caja = evento.currentTarget.getBoundingClientRect();
    const x = ((evento.clientX - caja.left) / caja.width) * ANCHO;
    const pasos = Math.max(1, dias.length - 1);
    const ancho = ANCHO - MARGEN.izquierda - MARGEN.derecha;
    const i = Math.round(((x - MARGEN.izquierda) / ancho) * pasos);
    setFoco(Math.min(dias.length - 1, Math.max(0, i)));
  }

  const enFoco = foco !== null ? dias[foco] : null;

  return (
    <figure className="flex flex-col gap-2" aria-labelledby={idTitulo}>
      <figcaption id={idTitulo} className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-sans text-sm font-semibold text-text-primary">Burndown</span>
        <span className="flex items-center gap-3 font-sans text-[11px] text-text-secondary">
          <Leyenda color={colors.primary} texto={`Restante (${unidad})`} />
          <Leyenda color={colors.textSecondary} texto="Ideal" discontinua />
        </span>
      </figcaption>

      <div className="relative">
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          className="h-auto w-full touch-none select-none"
          role="img"
          aria-label={`Burndown en ${unidad}. Detalle en la tabla de abajo.`}
          onPointerMove={alMover}
          onPointerDown={alMover}
          onPointerLeave={() => setFoco(null)}
        >
          {marcas.map((m) => (
            <g key={m}>
              <line
                x1={MARGEN.izquierda}
                x2={ANCHO - MARGEN.derecha}
                y1={escala.y(m)}
                y2={escala.y(m)}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={1}
              />
              <text
                x={MARGEN.izquierda - 6}
                y={escala.y(m) + 3}
                textAnchor="end"
                fontSize={10}
                fill={colors.textSecondary}
              >
                {m}
              </text>
            </g>
          ))}
          <text x={MARGEN.izquierda} y={ALTO - 6} fontSize={10} fill={colors.textSecondary}>
            {diaCorto.format(dias[0].dia)}
          </text>
          <text
            x={ANCHO - MARGEN.derecha}
            y={ALTO - 6}
            fontSize={10}
            textAnchor="end"
            fill={colors.textSecondary}
          >
            {diaCorto.format(dias[dias.length - 1].dia)}
          </text>

          <path
            d={ideal}
            fill="none"
            stroke={colors.textSecondary}
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
          {vistos.length > 0 && (
            <path
              d={restante}
              fill="none"
              stroke={colors.primary}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {ultimo >= 0 && (
            <circle
              cx={escala.x(ultimo)}
              cy={escala.y(vistos[ultimo].restante)}
              r={4}
              fill={colors.primary}
              stroke="#191919"
              strokeWidth={2}
            />
          )}

          {enFoco && foco !== null && (
            <g>
              <line
                x1={escala.x(foco)}
                x2={escala.x(foco)}
                y1={MARGEN.arriba}
                y2={ALTO - MARGEN.abajo}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth={1}
              />
              {enFoco.transcurrido && (
                <circle
                  cx={escala.x(foco)}
                  cy={escala.y(enFoco.restante)}
                  r={4}
                  fill={colors.primary}
                  stroke="#191919"
                  strokeWidth={2}
                />
              )}
            </g>
          )}
        </svg>

        {enFoco && foco !== null && (
          <div
            className="pointer-events-none absolute top-0 rounded-md border border-border px-2 py-1 font-sans text-[11px] text-text-primary"
            style={{
              background: '#1c1c1b',
              left: `${(escala.x(foco) / ANCHO) * 100}%`,
              transform: foco > dias.length / 2 ? 'translateX(-105%)' : 'translateX(5%)',
            }}
          >
            <div className="font-semibold">{diaCorto.format(enFoco.dia)}</div>
            {enFoco.transcurrido ? (
              <>
                <div>Restante: {conUnidad(enFoco.restante, unidad)}</div>
                <div className="text-text-secondary">
                  Alcance: {conUnidad(enFoco.alcance, unidad)}
                </div>
              </>
            ) : (
              <div className="text-text-secondary">Todavía no</div>
            )}
            <div className="text-text-secondary">
              Ideal: {conUnidad(Math.round(enFoco.ideal * 10) / 10, unidad)}
            </div>
          </div>
        )}
      </div>

      <p className="font-sans text-xs text-text-secondary">
        Alcance al arrancar: {conUnidad(datos.alcanceOriginal, unidad)}
        {datos.anadido > 0 && (
          <>
            {' · '}
            <span className="text-warning">
              añadido después: {conUnidad(datos.anadido, unidad)}
            </span>
          </>
        )}
        {' · '}terminado: {conUnidad(datos.hecho, unidad)}
      </p>

      <details className="font-sans text-xs text-text-secondary">
        <summary className="cursor-pointer select-none">Ver como tabla</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead>
            <tr className="border-b border-border">
              <th className="py-1 font-medium">Día</th>
              <th className="py-1 font-medium">Alcance</th>
              <th className="py-1 font-medium">Restante</th>
              <th className="py-1 font-medium">Ideal</th>
            </tr>
          </thead>
          <tbody>
            {vistos.map((d) => (
              <tr key={d.dia.toISOString()} className="border-b border-border last:border-b-0">
                <td className="py-1">{diaCorto.format(d.dia)}</td>
                <td className="py-1">{d.alcance}</td>
                <td className="py-1 text-text-primary">{d.restante}</td>
                <td className="py-1">{Math.round(d.ideal * 10) / 10}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Leyenda({
  color,
  texto,
  discontinua = false,
}: {
  color: string;
  texto: string;
  discontinua?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="16" height="6" aria-hidden="true">
        <line
          x1="0"
          x2="16"
          y1="3"
          y2="3"
          stroke={color}
          strokeWidth={2}
          strokeDasharray={discontinua ? '4 3' : undefined}
        />
      </svg>
      {texto}
    </span>
  );
}
