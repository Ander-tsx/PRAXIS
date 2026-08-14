'use client';

import type { DatosGenerados } from '@/lib/generado';
import type { FormaGrafico } from '@/lib/widgets';
import { alpha, colors } from '@praxis/commons';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * El gráfico a medida: **una forma de un conjunto cerrado sobre datos que ya
 * estaban calculados**.
 *
 * Nada de lo que se dibuja aquí lo ha escrito un modelo. Lo que eligió el
 * asistente fue la forma, la métrica, el recorte y el rango; los números salen
 * de `construirDatos`, que solo agrupa y ordena lo que devolvieron los informes.
 * Es la diferencia entre parametrizar y inventar, y es la única de las dos que
 * puede ir en una pantalla que habla del trabajo de gente real.
 *
 * ⚠️ Igual que el resto de gráficos de la zona: los colores van como **valores**
 * a `fill` y `stroke`. Tailwind no pinta dentro del SVG de Recharts.
 */
export function GeneratedChart({
  datos,
  forma,
  aviso,
}: {
  datos: DatosGenerados;
  forma: FormaGrafico;
  /** Lo que hay que decir sobre el dato, si hay algo. Va arriba y no se pliega. */
  aviso?: string | null;
}) {
  if (datos.forma === 'sin-datos') {
    return (
      <div className="flex h-full min-h-32 items-center justify-center px-4 text-center">
        <p className="font-sans text-sm text-text-disabled">{datos.motivo}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {aviso && (
        <p role="note" className="font-sans text-xs text-warning">
          {aviso}
        </p>
      )}
      <div className="min-h-0 flex-1">
        {datos.forma === 'categorias' ? (
          <Categorico datos={datos} forma={forma} />
        ) : (
          <Temporal datos={datos} forma={forma} />
        )}
      </div>
    </div>
  );
}

/* ─── Estilo común, el mismo que el resto de la zona ───────────────────── */

const ejes = {
  stroke: colors.textDisabled,
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

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

/* ─── Categóricas ──────────────────────────────────────────────────────── */

function Categorico({
  datos,
  forma,
}: {
  datos: Extract<DatosGenerados, { forma: 'categorias' }>;
  forma: FormaGrafico;
}) {
  const { datos: filas, unidad } = datos;

  if (forma === 'dona') {
    return (
      <div className="flex h-full flex-col gap-2">
        <ResponsiveContainer width="100%" height="100%" minHeight={160}>
          <PieChart>
            <Pie
              data={filas}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="85%"
              /* 2 px de superficie entre porciones: sin ese hueco, dos tonos
                 vecinos se tocan y el borde se lee como un tercer tono. */
              paddingAngle={2}
              stroke={colors.surface}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {filas.map((fila) => (
                <Cell key={fila.name} fill={fila.color} />
              ))}
            </Pie>
            <Tooltip
              {...tooltipStyle}
              formatter={(valor) => [`${Number(valor ?? 0)} ${unidad}`, '']}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* La leyenda va en HTML, no con `<Legend>`: es la única forma de que
            siga el orden de las porciones —Recharts 3 ya no acepta `payload`—
            y además hereda los estilos del sistema. Con la dona es
            imprescindible: sin eje, sin leyenda la identidad sería solo color. */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {filas.map((fila) => (
            <li
              key={fila.name}
              className="flex items-center gap-2 font-sans text-xs text-text-secondary"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: fila.color }}
              />
              {fila.name}
              <span className="tabular-nums text-text-disabled">{fila.value}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const horizontal = forma === 'barras_horizontales';

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={160}>
      <BarChart
        data={filas}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ left: horizontal ? 8 : -16, right: horizontal ? 24 : 8, top: 8 }}
      >
        <CartesianGrid
          horizontal={!horizontal}
          vertical={horizontal}
          stroke={colors.border}
          strokeDasharray="3 3"
        />
        {horizontal ? (
          <>
            <XAxis type="number" {...ejes} allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={110} {...ejes} />
          </>
        ) : (
          <>
            <XAxis type="category" dataKey="name" {...ejes} interval={0} />
            <YAxis type="number" {...ejes} allowDecimals={false} />
          </>
        )}
        <Tooltip
          {...tooltipStyle}
          cursor={{ fill: alpha(colors.primary, 8) }}
          formatter={(valor) => [`${Number(valor ?? 0)} ${unidad}`, '']}
        />
        <Bar
          dataKey="value"
          radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          barSize={18}
          isAnimationActive={false}
        >
          {filas.map((fila) => (
            <Cell key={fila.name} fill={fila.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Temporales ───────────────────────────────────────────────────────── */

function Temporal({
  datos,
  forma,
}: {
  datos: Extract<DatosGenerados, { forma: 'serie' }>;
  forma: FormaGrafico;
}) {
  const { puntos, series } = datos;
  const apilada = forma === 'area_apilada';

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Con una sola serie no hay leyenda: el título ya la nombra, y una
          leyenda de un elemento solo ocupa sitio. */}
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {series.map((serie) => (
            <li
              key={serie.clave}
              className="flex items-center gap-2 font-sans text-xs text-text-secondary"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: serie.color }}
              />
              {serie.nombre}
            </li>
          ))}
        </ul>
      )}

      <ResponsiveContainer width="100%" height="100%" minHeight={160}>
        {/* Las semanales admiten barras además de línea y área: una semana es un
            tramo cerrado, no un instante, y la barra lo dice mejor que un punto
            unido al siguiente. El flujo acumulado no las admite, y por eso el
            contrato no deja pedirlas. */}
        {forma === 'barras' ? (
          <BarChart data={puntos} margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="x" {...ejes} minTickGap={16} />
            <YAxis {...ejes} allowDecimals={false} />
            <Tooltip {...tooltipStyle} cursor={{ fill: alpha(colors.primary, 8) }} />
            {series.map((serie) => (
              <Bar
                key={serie.clave}
                dataKey={serie.clave}
                name={serie.nombre}
                fill={serie.color}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        ) : apilada ? (
          <AreaChart data={puntos} margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="x" {...ejes} minTickGap={24} />
            <YAxis {...ejes} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            {series.map((serie) => (
              <Area
                key={serie.clave}
                type="monotone"
                dataKey={serie.clave}
                name={serie.nombre}
                stackId="apilado"
                stroke={serie.color}
                fill={serie.color}
                fillOpacity={0.35}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={puntos} margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="x" {...ejes} minTickGap={24} />
            <YAxis {...ejes} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            {series.map((serie) => (
              <Line
                key={serie.clave}
                type="monotone"
                dataKey={serie.clave}
                name={serie.nombre}
                stroke={serie.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
