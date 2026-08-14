'use client';

import { type ReportCycleTime, type ReportFlow, formatDay, formatDuration } from '@/lib/reports';
import { alpha, colors } from '@praxis/commons';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * Los gráficos, todos aquí y todos de cliente.
 *
 * Recharts pinta en el navegador —mide el contenedor para ser responsive— así
 * que cada gráfico es una isla `'use client'`. **Reciben las series ya
 * calculadas por props**: el `fetch` y la forma de los datos viven en la page,
 * que es la regla del repo (CLAUDE.md) y aquí además evita que la librería se
 * cuele en el árbol de servidor.
 *
 * ⚠️ Los colores van como **valores**, no como clases. Tailwind no pinta dentro
 * del SVG que genera Recharts; lo que sí funciona es pasar `var(--color-*)` a
 * `fill` y `stroke`, porque el SVG está dentro del documento y hereda las
 * variables. Por eso se usan los tokens de `commons/tokens` y no utilidades.
 */

/** Estilo común de los ejes: el mismo gris tenue del resto de la interfaz. */
const ejes = {
  stroke: colors.textDisabled,
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

/** El recuadro flotante, con el fondo elevado del sistema. */
const tooltipStyle = {
  contentStyle: {
    background: colors.surfaceElevated,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    fontSize: 13,
  },
  labelStyle: { color: colors.textPrimary },
  itemStyle: { color: colors.textSecondary },
} as const;

/* ─── Reparto por columna o por prioridad ─────────────────────────────── */

export interface BarDatum {
  name: string;
  value: number;
  color: string;
}

/**
 * Barras horizontales para los repartos.
 *
 * Horizontales y no verticales porque las etiquetas son nombres de columna
 * («En revisión») y en vertical habría que girarlas o recortarlas.
 */
export function DistributionBars({ data, unit }: { data: BarDatum[]; unit: string }) {
  if (data.length === 0) {
    return <p className="py-8 text-center font-sans text-sm text-text-disabled">Sin datos.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} stroke={colors.border} strokeDasharray="3 3" />
        <XAxis type="number" {...ejes} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={110} {...ejes} />
        <Tooltip
          {...tooltipStyle}
          cursor={{ fill: alpha(colors.primary, 8) }}
          /* El valor llega tipado como `ValueType | undefined`: Recharts no
             sabe qué hay en `dataKey`. Se normaliza en vez de forzar el tipo. */
          formatter={(value) => [`${Number(value ?? 0)} ${unit}`, '']}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
          {data.map((item) => (
            <Cell key={item.name} fill={item.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Flujo acumulado ─────────────────────────────────────────────────── */

/**
 * Diagrama de flujo acumulado.
 *
 * Cada banda es **cuántas tareas hay** en esa columna ese día, apiladas. Se lee
 * por el grosor: una banda que engorda es trabajo que entra más rápido de lo que
 * sale, y el ancho horizontal entre el borde de arriba y el de abajo es,
 * aproximadamente, el tiempo que tarda una tarea en atravesar el tablero.
 *
 * Las columnas van apiladas **en su orden del tablero**, no por tamaño: el
 * gráfico tiene que leerse igual que el tablero o no significa lo mismo.
 */
export function FlowChart({ flow }: { flow: ReportFlow }) {
  const data = flow.serie.map((punto) => ({
    day: formatDay(punto.day),
    ...punto.porColumna,
  }));

  return (
    <div className="flex flex-col gap-3">
      {/**
       * La leyenda se pinta a mano, no con `<Legend>` de Recharts.
       *
       * Dos motivos. Recharts la ordenaba **distinto de como apila** —empezaba
       * por «En curso» aunque la primera banda fuera «Por hacer»—, y una leyenda
       * que no sigue el orden del gráfico hace leer mal las bandas, que es lo
       * único que este gráfico comunica. Y en Recharts 3 ya no se le puede pasar
       * un `payload` explícito para corregirlo. En HTML el orden es el del
       * tablero por construcción, y además hereda los estilos del sistema.
       */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {flow.columnas.map((columna) => (
          <li
            key={columna.id}
            className="flex items-center gap-2 font-sans text-xs text-text-secondary"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: tokenFill(columna.color) }}
            />
            {columna.name}
          </li>
        ))}
      </ul>

      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
          <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="day" {...ejes} minTickGap={24} />
          <YAxis {...ejes} allowDecimals={false} />
          <Tooltip {...tooltipStyle} />
          {flow.columnas.map((columna) => {
            const color = tokenFill(columna.color);
            return (
              <Area
                key={columna.id}
                type="monotone"
                dataKey={columna.id}
                name={columna.name}
                stackId="flujo"
                stroke={color}
                fill={color}
                fillOpacity={0.35}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Tiempos de ciclo ────────────────────────────────────────────────── */

/**
 * Nube de puntos de los tiempos, con las líneas de percentil.
 *
 * Se enseña la **dispersión** y no solo los percentiles porque es donde está la
 * información útil: dos equipos con la misma mediana pueden tener uno todos los
 * puntos juntos y el otro la mitad disparados, y solo el segundo tiene un
 * problema. Las dos líneas dicen dónde caen el 50 % y el 85 %.
 */
export function CycleTimeScatter({ cycle }: { cycle: ReportCycleTime }) {
  const data = cycle.muestras.map((muestra) => ({
    x: new Date(muestra.completedAt).getTime(),
    y: muestra.leadHours / 24,
    dia: formatDay(muestra.completedAt.slice(0, 10)),
  }));

  const p50 = cycle.lead.p50 !== null ? cycle.lead.p50 / 24 : null;
  const p85 = cycle.lead.p85 !== null ? cycle.lead.p85 / 24 : null;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ left: -16, right: 12, top: 8, bottom: 8 }}>
        <CartesianGrid stroke={colors.border} strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          domain={['dataMin', 'dataMax']}
          {...ejes}
          tickFormatter={(value: number) => formatDay(new Date(value).toISOString().slice(0, 10))}
          minTickGap={40}
        />
        <YAxis
          type="number"
          dataKey="y"
          {...ejes}
          tickFormatter={(value: number) => `${value} d`}
        />
        <Tooltip
          {...tooltipStyle}
          cursor={{ stroke: colors.borderStrong, strokeDasharray: '3 3' }}
          formatter={(value) => [formatDuration(Number(value ?? 0) * 24), 'Entrega']}
          labelFormatter={() => ''}
        />

        {p50 !== null && (
          <ReferenceLine
            y={p50}
            stroke={colors.info}
            strokeDasharray="6 4"
            label={{
              value: `p50 · ${formatDuration(cycle.lead.p50)}`,
              position: 'insideTopRight',
              fill: colors.info,
              fontSize: 11,
            }}
          />
        )}
        {p85 !== null && (
          <ReferenceLine
            y={p85}
            stroke={colors.warning}
            strokeDasharray="6 4"
            label={{
              value: `p85 · ${formatDuration(cycle.lead.p85)}`,
              position: 'insideTopRight',
              fill: colors.warning,
              fontSize: 11,
            }}
          />
        )}

        <Scatter data={data} fill={colors.primary} fillOpacity={0.75} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/* ─── Utilidad local ──────────────────────────────────────────────────── */

/**
 * Igual que `tokenColor` de `lib/reports`, pero local para que este archivo no
 * arrastre el módulo de servidor al cliente.
 */
function tokenFill(token: string | null): string {
  const mapa: Record<string, string> = {
    primary: colors.primary,
    accent: colors.accent,
    info: colors.info,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
  };
  return (token && mapa[token]) || colors.textSecondary;
}
