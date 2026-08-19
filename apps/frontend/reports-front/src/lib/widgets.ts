/**
 * El catálogo del lienzo de Análisis: qué se puede poner, qué necesita cada
 * cosa y de qué tamaño nace.
 *
 * ## Por qué está duplicado con `@praxis/contracts`
 *
 * Los mismos valores viven en `contracts/src/reports/report-widget.ts`, que es
 * **la fuente de verdad**: allí los valida el DTO del gateway. Aquí se
 * redeclaran por lo mismo que las formas de `reports.ts` y `assistant.ts`, que
 * ya lo hacen: ese paquete es de backend —arrastra `class-validator` y los
 * decoradores de Swagger— y el frontend solo necesita la forma.
 *
 * ⚠️ **Lo que no puede desviarse son las cadenas de los dos enums.** El resto de
 * este archivo —etiquetas, descripciones, tamaños— es solo de la pantalla y
 * puede cambiar sin avisar a nadie; un valor de `TipoWidget` o de `Metrica` que
 * no exista en el contrato se guarda mal y vuelve como **400**, no como un error
 * de compilación. Si añades uno, añádelo en los dos.
 */

/**
 * Tope de gráficos por lienzo. Espejo de `MAX_REPORT_WIDGETS`.
 *
 * Se comprueba también aquí, y no solo en el gateway, para poder decir por qué
 * no se añade: un 400 sin explicación al aceptar una propuesta del asistente se
 * lee como que el asistente falló.
 */
export const MAX_WIDGETS = 30;

/** Los gráficos que se pueden poner en el lienzo. Espejo de `ReportWidgetKind`. */
export const TIPOS_WIDGET = [
  'resumen',
  'por_columna',
  'por_prioridad',
  'flujo',
  'tiempos',
  'ciclo',
  'prediccion',
  'personas',
  'generado',
] as const;

export type TipoWidget = (typeof TIPOS_WIDGET)[number];

/** Espejo de `ReportChartShape`. */
export type FormaGrafico = 'barras' | 'barras_horizontales' | 'dona' | 'lineas' | 'area_apilada';

/** Espejo de `ReportMetric`. */
export type Metrica =
  | 'tareas_por_columna'
  | 'tareas_por_prioridad'
  | 'tareas_por_etiqueta'
  | 'carga_por_persona'
  | 'cerradas_por_persona'
  | 'vencidas_por_persona'
  | 'paradas_por_columna'
  | 'flujo_por_columna'
  | 'cierres_por_semana'
  | 'creadas_por_semana';

/** La parametrización de un gráfico a medida. Espejo de `ReportChartSpec`. */
export interface EspecificacionGrafico {
  forma: FormaGrafico;
  metrica: Metrica;
  dias?: number;
  soloVencidas?: boolean;
  topN?: number;
  titulo: string;
}

/** Un widget colocado. `x`, `y`, `w`, `h` son celdas, no píxeles. */
export interface Widget {
  id: string;
  tipo: TipoWidget;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Solo en `generado`. */
  grafico?: EspecificacionGrafico;
}

/**
 * De qué informe come cada widget.
 *
 * Es lo que hace que **un lienzo vacío no cueste ni una petición**. La pantalla
 * anterior pedía los cinco informes en cada carga, hubiera o no algo que enseñar
 * con ellos; ahora la page mira el lienzo, junta lo que hace falta y pide solo
 * eso. Quien tenga puesta la instantánea y nada más no paga el recorrido del
 * historial que necesitan los tiempos y la predicción.
 */
export type Informe = 'snapshot' | 'flow' | 'cycle' | 'forecast' | 'people' | 'blocked' | 'weekly';

export interface EntradaDelCatalogo {
  titulo: string;
  /** La frase que dice qué mide. Obligatoria, como en `ChartCard`. */
  descripcion: string;
  informes: Informe[];
  /** Tamaño con el que nace al añadirlo. */
  w: number;
  h: number;
  /** Por debajo de esto el gráfico no se lee. */
  minW: number;
  minH: number;
  /**
   * Si puede haber más de uno en el lienzo.
   *
   * Los fijos no: dos instantáneas idénticas ocupan sitio y no dicen nada nuevo,
   * así que el catálogo los enseña ya puestos en vez de dejar duplicarlos. Los
   * `generado` sí, que es justamente su gracia — dos cortes distintos del mismo
   * proyecto uno al lado del otro.
   */
  repetible: boolean;
}

export const CATALOGO: Record<TipoWidget, EntradaDelCatalogo> = {
  resumen: {
    titulo: 'Resumen',
    descripcion: 'Tareas, abiertas, vencidas y avance del checklist, en cuatro cifras.',
    informes: ['snapshot'],
    w: 12,
    h: 3,
    minW: 4,
    minH: 3,
    repetible: false,
  },
  por_columna: {
    titulo: 'Dónde está el trabajo',
    descripcion: 'Cuántas tareas hay ahora mismo en cada columna del tablero.',
    informes: ['snapshot'],
    w: 6,
    h: 7,
    minW: 3,
    minH: 6,
    repetible: false,
  },
  por_prioridad: {
    titulo: 'Reparto por prioridad',
    descripcion: 'Si casi todo es urgente, en la práctica no hay prioridades.',
    informes: ['snapshot'],
    w: 6,
    h: 7,
    minW: 3,
    minH: 6,
    repetible: false,
  },
  flujo: {
    titulo: 'Flujo acumulado',
    descripcion: 'Cuántas tareas hay en cada columna, día a día.',
    informes: ['flow'],
    w: 12,
    h: 9,
    minW: 6,
    minH: 7,
    repetible: false,
  },
  tiempos: {
    titulo: 'Cuánto tarda una tarea',
    descripcion: 'De crear a cerrar. Cada punto es una tarea; las líneas, la mediana y el p85.',
    informes: ['cycle'],
    w: 12,
    h: 9,
    minW: 6,
    minH: 7,
    repetible: false,
  },
  ciclo: {
    titulo: 'Tiempo de ciclo',
    descripcion: 'Del primer movimiento a cerrar: lo que tarda el trabajo una vez empieza.',
    informes: ['cycle'],
    w: 6,
    h: 5,
    minW: 3,
    minH: 4,
    repetible: false,
  },
  prediccion: {
    titulo: 'Cuándo estaría vacío el tablero',
    descripcion: 'Simulación sobre el ritmo de las últimas semanas, no sobre estimaciones.',
    informes: ['forecast'],
    w: 6,
    h: 6,
    minW: 4,
    minH: 5,
    repetible: false,
  },
  personas: {
    titulo: 'Cómo está repartido el trabajo',
    descripcion: 'Carga y flujo de cada persona.',
    informes: ['people'],
    w: 12,
    h: 8,
    minW: 6,
    minH: 6,
    repetible: false,
  },
  generado: {
    titulo: 'Gráfico a medida',
    descripcion: 'El que pediste al asistente.',
    informes: [],
    w: 6,
    h: 7,
    minW: 3,
    minH: 6,
    repetible: true,
  },
};

/**
 * Qué informes hay que pedir para pintar este lienzo.
 *
 * Los `generado` no salen del catálogo sino de su métrica: cada una declara de
 * qué agregado come, y ese mapa es la garantía de que **ninguno necesita una
 * consulta que no exista**. Si una métrica no está aquí, no se puede pintar.
 */
export const INFORME_DE_METRICA: Record<Metrica, Informe> = {
  tareas_por_columna: 'snapshot',
  tareas_por_prioridad: 'snapshot',
  tareas_por_etiqueta: 'snapshot',
  carga_por_persona: 'people',
  cerradas_por_persona: 'people',
  vencidas_por_persona: 'people',
  paradas_por_columna: 'blocked',
  flujo_por_columna: 'flow',
  cierres_por_semana: 'weekly',
  creadas_por_semana: 'weekly',
};

export function informesNecesarios(widgets: Widget[]): Set<Informe> {
  const necesarios = new Set<Informe>();
  for (const widget of widgets) {
    for (const informe of CATALOGO[widget.tipo]?.informes ?? []) necesarios.add(informe);
    if (widget.grafico) {
      const informe = INFORME_DE_METRICA[widget.grafico.metrica];
      if (informe) necesarios.add(informe);
    }
  }
  return necesarios;
}

/**
 * La disposición con la que arranca un lienzo que **nunca se ha guardado**.
 *
 * ## ⚠️ Esto contradice una decisión escrita, y por eso se explica entera
 *
 * `CanvasVacio` dice, con razón, que **no se rellena con un lienzo por
 * defecto**: poner los cinco gráficos de antes «para que no esté vacío»
 * devolvía el problema que el lienzo vino a resolver — tres tarjetas
 * disculpándose («no hay suficientes datos», «faltan 10 tareas cerradas») en la
 * primera pantalla que ve alguien.
 *
 * Ese argumento sigue siendo cierto **para aquellos cinco**. Lo que no se
 * sostiene es la conclusión de que entonces no haya ninguno: un proyecto con 186
 * tareas y dos meses de historial abría en blanco, y una pantalla en blanco con
 * un catálogo al lado tampoco es una buena primera impresión.
 *
 * La salida es la que hace falsas las dos objeciones a la vez: **solo entran los
 * gráficos que salen de `snapshot`**, que es el único informe que no necesita
 * historial —es una foto del momento— y el único que se pide siempre. Ninguno de
 * los tres puede disculparse por falta de datos, porque si el proyecto tiene
 * tareas, los tres tienen algo que enseñar.
 *
 * Y no cuesta ni una petición más: `snapshot` ya viajaba en el paquete.
 *
 * ## Sigue siendo tuyo
 *
 * No se guarda al pintarlo. Es lo que se ve la primera vez; en cuanto alguien
 * mueve, quita o añade algo, se guarda su versión y esto no vuelve a aparecer —
 * incluida la versión vacía, que es por qué el `actualizadoEn` del lienzo importa
 * más que su número de widgets.
 */
/**
 * 🔴 **Los ids del lienzo de partida son UUID, y tienen que serlo.**
 *
 * Eran `defecto-resumen`, `defecto-columna` y `defecto-prioridad`, que se leen
 * mejor y **rompían el guardado**: `ReportLayoutDto` valida cada `id` con
 * `@IsUUID`, así que el primer arrastre sobre un lienzo de partida respondía
 * `400 widgets.0.id must be a UUID`, la disposición volvía atrás sola y la
 * pantalla decía «Validation failed». No aparecía al abrir —el lienzo se pinta
 * sin guardar nada— sino al mover el primer gráfico.
 *
 * Se descubrió ejecutándolo contra el backend real; ni el typecheck ni
 * `next build` pueden ver esto, porque los dos lados son `string`.
 *
 * Son constantes y no `crypto.randomUUID()` a propósito: esto se ejecuta en el
 * servidor en cada carga, y con ids nuevos cada vez, dos pestañas abiertas del
 * mismo proyecto guardarían dos lienzos distintos y el último ganaría.
 */
const ID_RESUMEN = '00000000-0000-4000-8000-000000000001';
const ID_COLUMNA = '00000000-0000-4000-8000-000000000002';
const ID_PRIORIDAD = '00000000-0000-4000-8000-000000000003';

export function lienzoPorDefecto(): Widget[] {
  const alto = (tipo: TipoWidget) => CATALOGO[tipo].h;

  return [
    { id: ID_RESUMEN, tipo: 'resumen', x: 0, y: 0, w: 12, h: alto('resumen') },
    {
      id: ID_COLUMNA,
      tipo: 'por_columna',
      x: 0,
      y: alto('resumen'),
      w: 6,
      h: alto('por_columna'),
    },
    {
      id: ID_PRIORIDAD,
      tipo: 'por_prioridad',
      x: 6,
      y: alto('resumen'),
      w: 6,
      h: alto('por_prioridad'),
    },
  ];
}

/** Los tipos fijos que ya están puestos, para no ofrecerlos otra vez. */
export function tiposYaPuestos(widgets: Widget[]): Set<TipoWidget> {
  return new Set(widgets.filter((w) => !CATALOGO[w.tipo]?.repetible).map((w) => w.tipo));
}

/**
 * La primera fila libre por debajo de todo.
 *
 * Un widget nuevo se pone **al final y no en el primer hueco**: el hueco puede
 * estar en mitad de la pantalla y ver aparecer algo entre dos gráficos que ya
 * estabas mirando descoloca. Abajo se ve entrar, y moverlo es un gesto.
 */
export function siguienteFila(widgets: Widget[]): number {
  return widgets.reduce((maximo, widget) => Math.max(maximo, widget.y + widget.h), 0);
}

/** Un widget nuevo del catálogo, ya colocado al final del lienzo. */
export function nuevoWidget(
  tipo: TipoWidget,
  widgets: Widget[],
  grafico?: EspecificacionGrafico,
): Widget {
  const entrada = CATALOGO[tipo];
  return {
    id: crypto.randomUUID(),
    tipo,
    x: 0,
    y: siguienteFila(widgets),
    w: entrada.w,
    h: entrada.h,
    ...(grafico ? { grafico } : {}),
  };
}

/** Qué se pinta en la cabecera de un `generado`, que no tiene título fijo. */
export function tituloDe(widget: Widget): string {
  return widget.grafico?.titulo ?? CATALOGO[widget.tipo]?.titulo ?? 'Gráfico';
}
