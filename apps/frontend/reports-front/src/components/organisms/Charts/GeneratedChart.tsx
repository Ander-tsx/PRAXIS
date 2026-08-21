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
  ReferenceLine,
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
        ) : datos.forma === 'serie' ? (
          <Temporal datos={datos} forma={forma} />
        ) : datos.forma === 'distribucion' ? (
          <Distribucion datos={datos} forma={forma} />
        ) : (
          <Matriz datos={datos} />
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
        {forma === 'barras' || forma === 'barras_apiladas' || forma === 'barras_divergentes' ? (
          <BarChart data={puntos} margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="x" {...ejes} minTickGap={16} />
            <YAxis {...ejes} allowDecimals={false} />
            {forma === 'barras_divergentes' && <ReferenceLine y={0} stroke={colors.border} />}
            <Tooltip {...tooltipStyle} cursor={{ fill: alpha(colors.primary, 8) }} />
            {series.map((serie) => (
              <Bar
                key={serie.clave}
                dataKey={serie.clave}
                name={serie.nombre}
                fill={serie.color}
                stackId={forma === 'barras_apiladas' ? 'apilado' : undefined}
                radius={forma === 'barras_apiladas' ? 0 : [4, 4, 0, 0]}
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

/**
 * La distribución: barras sobre tramos contiguos, no sobre categorías sueltas.
 *
 * ⚠️ **Lo único que cambia entre `histograma` y `barras` es el hueco**, y no es
 * un detalle de estilo. En un histograma los tramos son contiguos —«de 0 a 3
 * días» acaba justo donde empieza «de 3 a 6»— y el hueco insinuaría que entre
 * los dos hay algo que no se cuenta. Con las barras separadas, el mismo dato se
 * lee como categorías independientes, que es lo que quiere quien las pide así.
 *
 * El eje **no se ordena por tamaño**: el orden de los tramos es el dato, y por
 * eso `construirDatos` reparte estas métricas antes de llegar al ordenador de
 * `construirCategorias`.
 */
function Distribucion({
  datos,
  forma,
}: {
  datos: Extract<DatosGenerados, { forma: 'distribucion' }>;
  forma: FormaGrafico;
}) {
  const { tramos, unidadX, unidadY } = datos;
  /* Los tramos de ancho uno son enteros sueltos —una mano, dos manos— y ahí el
     rótulo «1-2» se leería como un intervalo que no existe. */
  const enteros = tramos.every((tramo) => tramo.max - tramo.min === 1);
  const rotulo = (tramo: { min: number; max: number }) =>
    enteros ? `${tramo.min}` : `${tramo.min}-${tramo.max}`;

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={160}>
      <BarChart
        data={tramos}
        margin={{ left: -16, right: 8, top: 8 }}
        barCategoryGap={forma === 'histograma' ? 1 : '20%'}
      >
        <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="min"
          {...ejes}
          minTickGap={8}
          tickFormatter={(_valor, indice) => {
            const tramo = tramos[indice];
            return tramo ? rotulo(tramo) : '';
          }}
        />
        <YAxis {...ejes} allowDecimals={false} />
        <Tooltip
          {...tooltipStyle}
          cursor={{ fill: alpha(colors.primary, 8) }}
          formatter={(valor) => [`${valor} ${unidadY}`, '']}
          labelFormatter={(etiqueta, carga) => {
            const tramo = carga[0]?.payload as { min: number; max: number } | undefined;
            if (!tramo) return etiqueta;
            return enteros
              ? `${tramo.min} ${unidadX}`
              : `De ${tramo.min} a ${tramo.max} ${unidadX}`;
          }}
        />
        <Bar
          dataKey="count"
          fill={colors.primary}
          /* El histograma va a ras: unas esquinas redondeadas sobre barras
             pegadas dibujan una muesca entre tramos que no significa nada. */
          radius={forma === 'histograma' ? 0 : [4, 4, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * El cruce como mapa de calor: una tabla donde el color dice cuánto.
 *
 * ## Por qué es una `<table>` y no un SVG
 *
 * Porque **es** una tabla: dos dimensiones categóricas y un número en cada
 * cruce. Dibujarla en Recharts habría costado una malla de rectángulos que un
 * lector de pantalla recorre como una lista de nada, mientras que aquí cada
 * cifra está en su celda con su fila y su columna nombradas. El color es un
 * refuerzo del número, no su sustituto — la celda dice `12` además de pintarse.
 *
 * ⚠️ **Con la escala al lado, siempre.** Un degradado sin leyenda no dice si lo
 * oscuro es mucho o es poco, y esa es exactamente la pregunta que responde un
 * mapa de calor. Va debajo con el máximo escrito.
 */
function Matriz({ datos }: { datos: Extract<DatosGenerados, { forma: 'matriz' }> }) {
  const { filas, columnas, valores } = datos;

  if (filas.length === 0 || columnas.length === 0) {
    return (
      <div className="flex h-full min-h-32 items-center justify-center px-4 text-center">
        <p className="font-sans text-sm text-text-disabled">No hay nada en este cruce.</p>
      </div>
    );
  }

  let max = 0;
  for (const fila of filas) {
    for (const columna of columnas) {
      const valor = valores[fila.clave]?.[columna.clave] ?? 0;
      if (valor > max) max = valor;
    }
  }

  /**
   * De un recuento a su intensidad.
   *
   * Arranca en 12 y no en 0 para que **una celda con un 1 se distinga de una
   * vacía**: con la escala pegada al cero, el valor más bajo de una matriz con
   * un máximo alto sale transparente y se lee como «aquí no hay nada», que es
   * justo lo contrario de lo que dice.
   */
  const intensidad = (valor: number) => (max > 0 ? 12 + (valor / max) * 78 : 0);
  /* Por encima de la mitad de la escala el fondo ya no deja leer el texto del
     cuerpo, así que la cifra se pinta del color de la superficie. */
  const invierte = (valor: number) => intensidad(valor) > 55;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse font-sans text-sm">
          <caption className="sr-only">
            Cruce de dos dimensiones. Cada celda cuenta las tareas que comparten la fila y la
            columna.
          </caption>
          <thead>
            <tr>
              {/* La esquina no rotula nada: los dos ejes ya llevan su nombre en
                  el título del gráfico, que es donde se eligió el cruce. */}
              <th className="sticky top-0 left-0 z-20 border border-border bg-surface-elevated p-2" />
              {columnas.map((columna) => (
                <th
                  key={columna.clave}
                  scope="col"
                  title={columna.nombre}
                  className="sticky top-0 z-10 max-w-[120px] min-w-[80px] truncate border border-border bg-surface-elevated p-2 text-center font-medium text-text-secondary"
                >
                  {columna.nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.clave}>
                <th
                  scope="row"
                  title={fila.nombre}
                  className="sticky left-0 z-10 max-w-[150px] truncate border border-border bg-surface p-2 text-left font-medium text-text-secondary"
                >
                  {fila.nombre}
                </th>
                {columnas.map((columna) => {
                  const valor = valores[fila.clave]?.[columna.clave] ?? 0;
                  return (
                    <td
                      key={columna.clave}
                      className="border border-border p-2 text-center tabular-nums"
                      style={{
                        background:
                          valor > 0 ? alpha(colors.primary, intensidad(valor)) : 'transparent',
                        color: invierte(valor) ? colors.surface : colors.textPrimary,
                      }}
                    >
                      {/* El cero va como raya y no como «0»: una matriz llena de
                          ceros esconde los números que sí hay. */}
                      {valor > 0 ? valor : <span className="text-border-strong">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 items-center gap-2 font-sans text-xs text-text-disabled">
        <span>0</span>
        <span
          aria-hidden="true"
          className="h-2 flex-1 rounded-full"
          style={{
            background: `linear-gradient(to right, ${alpha(colors.primary, 12)}, ${alpha(colors.primary, 90)})`,
          }}
        />
        <span>
          {max} {datos.unidad}
        </span>
      </div>
    </div>
  );
}
