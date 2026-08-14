/**
 * El catálogo de gráficos del lienzo de Análisis, y el conjunto cerrado sobre
 * el que el asistente puede parametrizar uno.
 *
 * ## Por qué es un conjunto cerrado y no una consulta
 *
 * La alternativa evidente —dejar que el modelo escriba la consulta o el código
 * del gráfico— está descartada, y no por prudencia genérica: va contra la regla
 * 1 del prompt del asistente, que prohíbe **inventar el dato de partida**. Un
 * `SELECT` redactado por un modelo devuelve cifras que nadie ha comprobado y que
 * se leen con la misma autoridad que las medidas; una cifra estimada, igual.
 *
 * Lo que sí puede hacer es **elegir y parametrizar**: forma del gráfico, métrica,
 * filtro y rango, todo sobre agregados que `reports-service` ya calcula. Si la
 * métrica no está en `ReportMetric`, no existe — no hay una vía por la que
 * aparezca un número que no venga de una consulta escrita a mano y revisada.
 *
 * ## Y por qué cada métrica declara qué opciones acepta
 *
 * Un eje de «filtro» genérico habría sido más cómodo y habría mentido. Los
 * agregados no admiten los mismos cortes: `people` ya trae abiertas, cerradas y
 * vencidas por separado —así que ahí el filtro **es** la métrica—, mientras que
 * `snapshot.byColumn` cuenta lo que hay ahora en cada columna y no sabe
 * separarlo. Ofrecer «solo abiertas» sobre esa métrica habría devuelto el mismo
 * número con otra etiqueta, que es la peor clase de error: se lee bien y es
 * falso.
 *
 * Por eso cada métrica declara `aceptaRango`, `aceptaSoloVencidas` y su forma, y
 * `validarGrafico` rechaza lo que no encaje. Un conjunto cerrado que permite
 * combinaciones sin sentido no es un conjunto cerrado.
 */

/**
 * Los gráficos que se pueden poner en el lienzo.
 *
 * Los ocho primeros son los informes que la pantalla ya pintaba —fijos, todos, y
 * siempre— convertidos en piezas que se eligen. El noveno es el que parametriza
 * el asistente.
 */
export enum ReportWidgetKind {
  /** Las cuatro cifras de cabecera: tareas, abiertas, vencidas y checklist. */
  RESUMEN = 'resumen',
  /** Dónde está el trabajo: cuántas tareas hay ahora en cada columna. */
  POR_COLUMNA = 'por_columna',
  /** Reparto por prioridad. Si casi todo es urgente, no hay prioridades. */
  POR_PRIORIDAD = 'por_prioridad',
  /** Flujo acumulado: cada columna como una banda, día a día. */
  FLUJO = 'flujo',
  /** Cuánto tarda una tarea, de crear a cerrar. Nube de puntos con p50 y p85. */
  TIEMPOS = 'tiempos',
  /** Tiempo de ciclo: del primer movimiento a cerrar. */
  CICLO = 'ciclo',
  /** Cuándo estaría vacío el tablero, por simulación de Monte Carlo. */
  PREDICCION = 'prediccion',
  /** Cómo está repartido el trabajo, por persona. */
  PERSONAS = 'personas',
  /** El que elige y parametriza el asistente. Lleva `grafico`. */
  GENERADO = 'generado',
}

/** La forma con la que se dibuja una métrica. */
export enum ReportChartShape {
  BARRAS = 'barras',
  BARRAS_HORIZONTALES = 'barras_horizontales',
  DONA = 'dona',
  LINEAS = 'lineas',
  AREA_APILADA = 'area_apilada',
}

/**
 * Las métricas sobre las que se puede pedir un gráfico a medida.
 *
 * **Todas salen de un agregado que ya existe.** La columna «de dónde sale» no es
 * documentación: es la comprobación de que ninguna necesita una consulta nueva,
 * y por tanto de que ninguna puede devolver una cifra que nadie haya calculado.
 */
export enum ReportMetric {
  /** `snapshot.byColumn` — tareas que hay ahora en cada columna. */
  TAREAS_POR_COLUMNA = 'tareas_por_columna',
  /** `snapshot.byPriority` — reparto por prioridad. */
  TAREAS_POR_PRIORIDAD = 'tareas_por_prioridad',
  /** `snapshot.byLabel` — tareas por etiqueta. */
  TAREAS_POR_ETIQUETA = 'tareas_por_etiqueta',
  /** `people.abiertas` — carga actual de cada persona. */
  CARGA_POR_PERSONA = 'carga_por_persona',
  /** `people.cerradas` — lo que ha cerrado cada persona. */
  CERRADAS_POR_PERSONA = 'cerradas_por_persona',
  /** `people.vencidas` — vencidas que lleva cada persona. */
  VENCIDAS_POR_PERSONA = 'vencidas_por_persona',
  /** `blocked` agrupado por columna — dónde se para el trabajo. */
  PARADAS_POR_COLUMNA = 'paradas_por_columna',
  /** `flow.serie` — el acumulado por columna, día a día. */
  FLUJO_POR_COLUMNA = 'flujo_por_columna',
  /** `weekly.serie.cerradas` — cierres por semana. */
  CIERRES_POR_SEMANA = 'cierres_por_semana',
  /** `weekly.serie.creadas` — entradas por semana. */
  CREADAS_POR_SEMANA = 'creadas_por_semana',
}

/** Qué admite cada métrica. Lo aplica `validarGrafico`, no la buena voluntad. */
export interface ReportMetricSpec {
  /** Formas con las que tiene sentido dibujarla. */
  formas: ReportChartShape[];
  /**
   * Si acepta `rango`.
   *
   * ⚠️ Las de `snapshot` **no**: son una foto del momento, y un «últimos 30
   * días» sobre ellas devolvería el mismo número con una etiqueta que miente.
   */
  aceptaRango: boolean;
  /** Si acepta el corte «solo vencidas». Hoy solo lo permite `blocked`. */
  aceptaSoloVencidas: boolean;
  /** Si acepta `topN`. Solo las categóricas con muchas categorías posibles. */
  aceptaTopN: boolean;
  /** Para el desplegable y para que la tarjeta de propuesta diga qué se pide. */
  etiqueta: string;
}

const CATEGORICA = [
  ReportChartShape.BARRAS,
  ReportChartShape.BARRAS_HORIZONTALES,
  ReportChartShape.DONA,
];
const TEMPORAL = [ReportChartShape.LINEAS, ReportChartShape.AREA_APILADA];

export const REPORT_METRICS: Record<ReportMetric, ReportMetricSpec> = {
  [ReportMetric.TAREAS_POR_COLUMNA]: {
    formas: CATEGORICA,
    aceptaRango: false,
    aceptaSoloVencidas: false,
    aceptaTopN: false,
    etiqueta: 'Tareas por columna',
  },
  [ReportMetric.TAREAS_POR_PRIORIDAD]: {
    formas: CATEGORICA,
    aceptaRango: false,
    aceptaSoloVencidas: false,
    aceptaTopN: false,
    etiqueta: 'Tareas por prioridad',
  },
  [ReportMetric.TAREAS_POR_ETIQUETA]: {
    formas: CATEGORICA,
    aceptaRango: false,
    aceptaSoloVencidas: false,
    aceptaTopN: true,
    etiqueta: 'Tareas por etiqueta',
  },
  [ReportMetric.CARGA_POR_PERSONA]: {
    formas: CATEGORICA,
    aceptaRango: false,
    aceptaSoloVencidas: false,
    aceptaTopN: true,
    etiqueta: 'Carga por persona',
  },
  [ReportMetric.CERRADAS_POR_PERSONA]: {
    formas: CATEGORICA,
    aceptaRango: false,
    aceptaSoloVencidas: false,
    aceptaTopN: true,
    etiqueta: 'Tareas cerradas por persona',
  },
  [ReportMetric.VENCIDAS_POR_PERSONA]: {
    formas: CATEGORICA,
    aceptaRango: false,
    aceptaSoloVencidas: false,
    aceptaTopN: true,
    etiqueta: 'Tareas vencidas por persona',
  },
  [ReportMetric.PARADAS_POR_COLUMNA]: {
    formas: CATEGORICA,
    /* Aquí el rango **es** el umbral de parón: «sin moverse desde hace N días». */
    aceptaRango: true,
    aceptaSoloVencidas: true,
    aceptaTopN: false,
    etiqueta: 'Tareas paradas, por columna',
  },
  [ReportMetric.FLUJO_POR_COLUMNA]: {
    formas: TEMPORAL,
    aceptaRango: true,
    aceptaSoloVencidas: false,
    aceptaTopN: false,
    etiqueta: 'Flujo acumulado por columna',
  },
  [ReportMetric.CIERRES_POR_SEMANA]: {
    formas: [...TEMPORAL, ReportChartShape.BARRAS],
    aceptaRango: true,
    aceptaSoloVencidas: false,
    aceptaTopN: false,
    etiqueta: 'Tareas cerradas por semana',
  },
  [ReportMetric.CREADAS_POR_SEMANA]: {
    formas: [...TEMPORAL, ReportChartShape.BARRAS],
    aceptaRango: true,
    aceptaSoloVencidas: false,
    aceptaTopN: false,
    etiqueta: 'Tareas creadas por semana',
  },
};

/** La parametrización de un gráfico a medida. Solo la lleva `GENERADO`. */
export interface ReportChartSpec {
  forma: ReportChartShape;
  metrica: ReportMetric;
  /**
   * Días de historial. Solo si la métrica lo acepta.
   *
   * En `PARADAS_POR_COLUMNA` no es una ventana sino el umbral de parón, que es
   * lo que significa ahí «rango»: se dice en la etiqueta del widget para que
   * nadie lo lea como «lo que pasó en los últimos N días».
   */
  dias?: number;
  /** Quedarse solo con las vencidas. Solo si la métrica lo acepta. */
  soloVencidas?: boolean;
  /** Quedarse con las N categorías mayores. Solo si la métrica lo acepta. */
  topN?: number;
  /** El título que se pinta. Lo escribe quien lo propone. */
  titulo: string;
}

/** Cuántas columnas tiene la cuadrícula. El `w` de un widget va sobre esto. */
export const REPORT_GRID_COLS = 12;

/**
 * Tope de widgets por lienzo.
 *
 * No es una restricción de producto —nadie va a poner treinta gráficos— sino un
 * cortafuegos: `widgets` es una columna `Json` y sin tope, un cliente que no sea
 * nuestra pantalla puede guardar un documento arbitrariamente grande que después
 * hay que leer entero en cada carga.
 */
export const MAX_REPORT_WIDGETS = 30;

/** Tamaño mínimo de cada tipo, en celdas. Por debajo el gráfico no se lee. */
export const REPORT_WIDGET_MIN: Record<ReportWidgetKind, { w: number; h: number }> = {
  [ReportWidgetKind.RESUMEN]: { w: 4, h: 3 },
  [ReportWidgetKind.POR_COLUMNA]: { w: 3, h: 6 },
  [ReportWidgetKind.POR_PRIORIDAD]: { w: 3, h: 6 },
  [ReportWidgetKind.FLUJO]: { w: 6, h: 7 },
  [ReportWidgetKind.TIEMPOS]: { w: 6, h: 7 },
  [ReportWidgetKind.CICLO]: { w: 3, h: 4 },
  [ReportWidgetKind.PREDICCION]: { w: 4, h: 5 },
  [ReportWidgetKind.PERSONAS]: { w: 6, h: 6 },
  [ReportWidgetKind.GENERADO]: { w: 3, h: 6 },
};

/**
 * Un widget colocado en el lienzo.
 *
 * `x`, `y`, `w`, `h` son celdas de la cuadrícula, no píxeles: lo que se guarda
 * es la composición, no cómo se veía en la pantalla de quien la hizo.
 */
export interface ReportWidget {
  /** Identidad dentro del lienzo. Permite dos gráficos generados distintos. */
  id: string;
  tipo: ReportWidgetKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Obligatorio si `tipo` es `GENERADO`, prohibido en el resto. */
  grafico?: ReportChartSpec;
}

/**
 * Comprueba que una parametrización cae dentro del conjunto cerrado.
 *
 * Devuelve el motivo cuando no, para que el asistente pueda decir por qué no
 * propone el gráfico en vez de proponer uno que no se puede dibujar.
 *
 * Se usa en **dos sitios y a propósito**: en el DTO que guarda el lienzo y al
 * validar la propuesta del modelo. Son dos puertas distintas —una la cruza la
 * pantalla, la otra Gemini— y ninguna puede fiarse de que la otra ya miró.
 */
export function validarGrafico(grafico: ReportChartSpec): string | null {
  const spec = REPORT_METRICS[grafico.metrica];
  if (!spec) return `La métrica «${grafico.metrica}» no existe`;

  if (!spec.formas.includes(grafico.forma)) {
    return `«${spec.etiqueta}» no se puede dibujar como ${grafico.forma}`;
  }
  if (grafico.dias !== undefined) {
    if (!spec.aceptaRango) return `«${spec.etiqueta}» es una foto del momento: no admite rango`;
    if (!Number.isInteger(grafico.dias) || grafico.dias < 1 || grafico.dias > 365) {
      return 'El rango va de 1 a 365 días';
    }
  }
  if (grafico.soloVencidas && !spec.aceptaSoloVencidas) {
    return `«${spec.etiqueta}» no distingue las vencidas`;
  }
  if (grafico.topN !== undefined) {
    if (!spec.aceptaTopN) return `«${spec.etiqueta}» no admite recorte por top N`;
    if (!Number.isInteger(grafico.topN) || grafico.topN < 2 || grafico.topN > 20) {
      return 'El top N va de 2 a 20';
    }
  }
  if (!grafico.titulo?.trim()) return 'Falta el título del gráfico';
  if (grafico.titulo.length > 80) return 'El título no puede superar 80 caracteres';

  return null;
}
