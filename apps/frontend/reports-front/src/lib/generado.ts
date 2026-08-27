import { MAX_SERIES, serieColors } from '@praxis/commons';
import {
  PRIORITY_COLOR,
  PRIORITY_ORDER,
  type ReportBlocked,
  type ReportColumnTime,
  type ReportCycleTime,
  type ReportDynamics,
  type ReportFlow,
  type ReportMatrix,
  type ReportPerson,
  type ReportSnapshot,
  type ReportWeekly,
  formatDay,
  tokenColor,
} from './reports';
import type { EspecificacionGrafico, Metrica } from './widgets';
import { parteDeCruce } from './widgets';

/**
 * De una parametrización a los datos que se dibujan.
 *
 * ## Lo que este archivo garantiza
 *
 * **Ningún número sale de aquí que no venga de un agregado del servidor.** No
 * hay una sola operación que estime, extrapole o rellene un hueco: se agrupa, se
 * ordena, se recorta y se le pone nombre y color a lo que ya vino calculado. Es
 * la mitad frontend de la misma regla que sostiene el conjunto cerrado del
 * contrato — el asistente elige de una lista, y lo que la lista puede dibujar es
 * exactamente esto.
 *
 * Si una métrica necesitara un dato que no está en ninguno de los siete
 * informes, la forma de añadirla es un comando nuevo en el servicio dueño del
 * dato, no un cálculo aquí.
 *
 * ## Y el color sigue a la entidad
 *
 * Una columna del tablero y una prioridad **traen el suyo**, y se respeta: un
 * gráfico de columnas que las pintara de otro color dejaría de leerse igual que
 * el tablero, que es de donde viene quien lo mira. Los seis tonos de serie se
 * usan solo donde la categoría no tiene ninguno —etiquetas, personas— y solo en
 * la dona, que es la única forma sin eje donde el nombre no está escrito al
 * lado.
 */

/** Una categoría con su valor. El color puede venir de la entidad o del orden. */
export interface Categoria {
  name: string;
  value: number;
  color: string;
}

/** Un punto de una serie temporal. `x` es la etiqueta del eje. */
export interface PuntoSerie {
  x: string;
  [clave: string]: string | number;
}

export type DatosGenerados =
  | { forma: 'categorias'; datos: Categoria[]; unidad: string }
  | {
      forma: 'serie';
      puntos: PuntoSerie[];
      series: { clave: string; nombre: string; color: string }[];
      unidad: string;
    }
  | {
      forma: 'distribucion';
      tramos: { min: number; max: number; count: number }[];
      unidadY: string;
      unidadX: string;
    }
  | {
      forma: 'matriz';
      filas: { clave: string; nombre: string }[];
      columnas: { clave: string; nombre: string }[];
      valores: Record<string, Record<string, number>>;
      unidad: string;
    }
  /** No hay con qué dibujarlo. `motivo` se enseña tal cual. */
  | { forma: 'sin-datos'; motivo: string };

/** Los informes que puede necesitar un gráfico generado. */
export interface FuentesGeneradas {
  snapshot?: ReportSnapshot | null;
  people?: ReportPerson[] | null;
  blocked?: ReportBlocked | null;
  flow?: ReportFlow | null;
  weekly?: ReportWeekly | null;
  dynamics?: ReportDynamics | null;
  columnTime?: ReportColumnTime | null;
  cycle?: ReportCycleTime | null;
  matrices?: Record<string, ReportMatrix>;
}

/** `userId`/`labelId` → nombre. Lo resuelve la page, que es quien los pide. */
export interface Nombres {
  personas: Record<string, string>;
  etiquetas: Record<string, string>;
}

export function construirDatos(
  grafico: EspecificacionGrafico,
  fuentes: FuentesGeneradas,
  nombres: Nombres,
): DatosGenerados {
  /**
   * ⚠️ **El reparto se decide por la métrica, no solo por la forma.**
   *
   * Empezó siendo `forma === 'histograma'` a secas, y eso dejaba un agujero:
   * `distribucion_de_entrega` acepta las dos formas de `DISTRIBUCION`
   * —histograma y barras— pero el único sitio que sabe leer `cycle.muestras` es
   * `construirDistribucion`. Pedida como barras se caía hasta el `default` de
   * `construirSerie` y salía «Esa métrica no se puede dibujar», sobre una
   * combinación que el contrato **acepta** y que el constructor **ofrece**.
   *
   * Así que las distribuciones se reparten por métrica y la forma solo decide
   * si las barras van pegadas o separadas. Las otras dos métricas de
   * `DISTRIBUCION` —rotación y volatilidad— vienen del servidor ya agrupadas en
   * tramos y las sabe leer también `construirCategorias`, que es por donde
   * salen cuando se piden como barras.
   */
  if (grafico.metrica === 'distribucion_de_entrega' || grafico.forma === 'histograma') {
    return construirDistribucion(grafico, fuentes);
  }
  if (grafico.metrica === 'cruce' && grafico.forma === 'mapa_calor') {
    return construirMatriz(grafico, fuentes, nombres);
  }

  const categoricas = construirCategorias(grafico, fuentes, nombres);
  if (categoricas) return categoricas;
  return construirSerie(grafico, fuentes, nombres);
}

/* ─── Categóricas ──────────────────────────────────────────────────────── */

function construirCategorias(
  grafico: EspecificacionGrafico,
  fuentes: FuentesGeneradas,
  nombres: Nombres,
): DatosGenerados | null {
  const { metrica, topN } = grafico;
  /**
   * Las que traen el color de la entidad: una columna del tablero y una
   * prioridad se pintan del suyo o el gráfico deja de leerse como el tablero.
   */
  const conColorPropio = new Set<Metrica>([
    'tareas_por_columna',
    'tareas_por_prioridad',
    'reaperturas_por_columna',
    'cambios_de_prioridad',
    'tiempo_en_columna',
    'espera_actual_por_columna',
  ]);
  /**
   * Las que **no** se ordenan de mayor a menor.
   *
   * ⚠️ Antes esto era el mismo conjunto que el de arriba, y confundirlos rompe
   * los histogramas: «1 mano, 2 manos, 3 manos» ordenado por tamaño sale
   * «2, 1, 3» y deja de ser una distribución — pasa a ser un ranking de barras
   * que se parece mucho a un histograma y no lo es. El orden **es** el dato.
   */
  const ordenNatural = new Set<Metrica>([
    ...conColorPropio,
    'rotacion_por_tarea',
    'volatilidad_por_tarea',
  ]);

  let crudas: Categoria[] | null = null;
  let unidad = 'tareas';

  switch (metrica) {
    case 'tareas_por_columna': {
      const snapshot = fuentes.snapshot;
      if (!snapshot) return sinDatos('No se pudo leer la instantánea del proyecto.');
      crudas = snapshot.byColumn.map((columna) => ({
        name: columna.name,
        value: columna.count,
        color: tokenColor(columna.color),
      }));
      break;
    }

    case 'tareas_por_prioridad': {
      const snapshot = fuentes.snapshot;
      if (!snapshot) return sinDatos('No se pudo leer la instantánea del proyecto.');
      crudas = PRIORITY_ORDER.map((prioridad) => ({
        name: ETIQUETA_PRIORIDAD[prioridad],
        value: snapshot.byPriority.find((fila) => fila.priority === prioridad)?.count ?? 0,
        color: PRIORITY_COLOR[prioridad],
      })).filter((fila) => fila.value > 0);
      break;
    }

    case 'tareas_por_etiqueta': {
      const snapshot = fuentes.snapshot;
      if (!snapshot) return sinDatos('No se pudo leer la instantánea del proyecto.');
      crudas = snapshot.byLabel.map((fila) => ({
        name: nombres.etiquetas[fila.labelId] ?? 'Etiqueta que ya no existe',
        value: fila.count,
        color: '',
      }));
      break;
    }

    case 'carga_por_persona':
    case 'cerradas_por_persona':
    case 'vencidas_por_persona': {
      const people = fuentes.people;
      if (!people) return sinDatos('No se pudo leer el reparto por persona.');
      const campo =
        metrica === 'carga_por_persona'
          ? 'abiertas'
          : metrica === 'cerradas_por_persona'
            ? 'cerradas'
            : 'vencidas';
      crudas = people
        .map((persona) => ({
          name: nombres.personas[persona.userId] ?? 'Alguien que ya no está',
          value: persona[campo],
          color: '',
        }))
        .filter((fila) => fila.value > 0);
      break;
    }

    case 'paradas_por_columna': {
      const blocked = fuentes.blocked;
      if (!blocked) return sinDatos('No se pudo leer qué está parado.');
      /* `soloVencidas` se aplica sobre las tareas, no sobre el total: el
         agregado trae la bandera por tarea, así que el corte es un filtro y no
         una estimación. */
      const tareas = grafico.soloVencidas
        ? blocked.tareas.filter((tarea) => tarea.vencida)
        : blocked.tareas;

      const porColumna = new Map<string, number>();
      for (const tarea of tareas) {
        porColumna.set(tarea.columna, (porColumna.get(tarea.columna) ?? 0) + 1);
      }
      crudas = [...porColumna].map(([name, value]) => ({ name, value, color: '' }));
      unidad = 'paradas';
      break;
    }

    /* ─── Los tres de R9.1, todos sobre `dynamics` ────────────────────── */

    case 'reaperturas_por_columna': {
      const dynamics = fuentes.dynamics;
      if (!dynamics) return sinDatos('No se pudo leer el historial de eventos.');
      crudas = dynamics.retrabajo.porColumna.map((fila) => ({
        name: fila.name,
        value: fila.count,
        color: tokenColor(fila.color),
      }));
      unidad = 'reaperturas';
      break;
    }

    case 'rotacion_por_tarea': {
      const dynamics = fuentes.dynamics;
      if (!dynamics) return sinDatos('No se pudo leer el historial de eventos.');
      crudas = dynamics.rotacion.distribucion.map((fila) => ({
        name: etiquetaDeManos(fila.manos),
        value: fila.tareas,
        color: '',
      }));
      break;
    }

    case 'volatilidad_por_tarea': {
      const dynamics = fuentes.dynamics;
      if (!dynamics) return sinDatos('No se pudo leer el historial de eventos.');
      crudas = dynamics.volatilidad.distribucion.map((fila) => ({
        name: etiquetaDeCambios(fila.cambios),
        value: fila.tareas,
        color: '',
      }));
      break;
    }

    case 'cambios_de_prioridad': {
      const dynamics = fuentes.dynamics;
      if (!dynamics) return sinDatos('No se pudo leer el historial de eventos.');
      /* La matriz completa se suma por destino: «a qué prioridad acaba
         llegando el trabajo». El origen no se pierde —viaja entero en
         `matriz`— pero una barra por celda serían dieciséis barras para
         contestar una pregunta de cuatro. */
      const porDestino = new Map<string, number>();
      for (const celda of dynamics.volatilidad.matriz) {
        porDestino.set(celda.hasta, (porDestino.get(celda.hasta) ?? 0) + celda.count);
      }
      crudas = PRIORITY_ORDER.map((prioridad) => ({
        name: ETIQUETA_PRIORIDAD[prioridad] ?? prioridad,
        value: porDestino.get(prioridad) ?? 0,
        color: PRIORITY_COLOR[prioridad] ?? '',
      })).filter((fila) => fila.value > 0);
      unidad = 'cambios';
      break;
    }

    /* ─── R9.2: dónde espera el trabajo ───────────────────────────────── */

    case 'tiempo_en_columna':
    case 'espera_actual_por_columna': {
      const columnTime = fuentes.columnTime;
      if (!columnTime) return sinDatos('No se pudo leer el tiempo por columna.');
      const actual = metrica === 'espera_actual_por_columna';
      crudas = columnTime.columnas
        .map((columna) => ({
          name: columna.name,
          /* En horas y con un decimal: el eje necesita un número, y la unidad
             va en el rótulo. Redondear aquí y no al pintar evita que el
             tooltip y la barra digan cosas distintas. */
          value: redondear(actual ? columna.enCursoP50Horas : columna.p50Horas),
          color: tokenColor(columna.color),
        }))
        .filter((fila) => fila.value > 0);
      unidad = 'h (mediana)';
      break;
    }

    default:
      return null;
  }

  if (crudas.length === 0) {
    return sinDatos('Todavía no hay nada que contar aquí.');
  }

  /* Las que traen color propio conservan su orden natural —el del tablero, el de
     la prioridad—; las demás se ordenan de mayor a menor, que es lo único que
     ordena una lista de nombres. */
  const ordenadas = ordenNatural.has(metrica)
    ? crudas
    : [...crudas].sort((a, b) => b.value - a.value);

  const recortadas = recortar(ordenadas, topN);
  const conColor = conColorPropio.has(metrica) ? recortadas : pintarPorOrden(recortadas);

  return { forma: 'categorias', datos: conColor, unidad };
}

/**
 * Recorta a `topN`, y agrupa el resto en «Otras» en vez de tirarlo.
 *
 * Tirarlo cambiaría el total sin decirlo: una dona de las cinco etiquetas
 * mayores sin ese resto parece el reparto completo del proyecto, y no lo es.
 */
function recortar(categorias: Categoria[], topN?: number): Categoria[] {
  if (topN === undefined || categorias.length <= topN) return categorias;

  const cabeza = categorias.slice(0, topN);
  const resto = categorias.slice(topN).reduce((suma, fila) => suma + fila.value, 0);
  return resto > 0 ? [...cabeza, { name: 'Otras', value: resto, color: '' }] : cabeza;
}

/**
 * Asigna los tonos de serie **por posición y sin ciclar**.
 *
 * A partir de la sexta categoría se agrupan en «Otras»: repetir un tono haría
 * que dos categorías distintas se leyeran como la misma, y generar uno nuevo
 * daría un tono que ya no se distingue de alguno de los seis medidos. «Otras»
 * va siempre en el gris del texto secundario, que no es ninguna categoría.
 */
function pintarPorOrden(categorias: Categoria[]): Categoria[] {
  if (categorias.length <= MAX_SERIES) {
    return categorias.map((fila, i) => ({
      ...fila,
      color: fila.name === 'Otras' ? COLOR_OTRAS : serieColors[i],
    }));
  }

  const cabeza = categorias.slice(0, MAX_SERIES - 1);
  const resto = categorias.slice(MAX_SERIES - 1).reduce((suma, fila) => suma + fila.value, 0);

  return [
    ...cabeza.map((fila, i) => ({ ...fila, color: serieColors[i] })),
    { name: 'Otras', value: resto, color: COLOR_OTRAS },
  ];
}

const COLOR_OTRAS = 'var(--color-text-disabled)';

/**
 * La clave del segmento «Otras» en un cruce apilado.
 *
 * Lleva un prefijo que no puede ser un UUID ni una prioridad porque **comparte
 * espacio de nombres con las claves reales**: es un campo más del objeto que
 * lee Recharts, y si coincidiera con el id de una columna del cruce, el
 * agrupado pisaría su segmento sin dar ningún error.
 */
const CLAVE_OTRAS = '__otras__';

/**
 * El rótulo de un tramo del histograma de manos.
 *
 * La última barra acumula «5 o más» (`MAX_MANOS` en tasks-service), y decirlo es
 * obligatorio: una barra rotulada «5» sobre un tramo que también contiene las de
 * doce manos es un recorte mudo, que es lo que este repositorio no hace.
 */
function etiquetaDeManos(manos: number): string {
  if (manos === 0) return 'Sin responsable';
  if (manos >= TOPE_HISTOGRAMA) return `${TOPE_HISTOGRAMA} o más`;
  return manos === 1 ? '1 persona' : `${manos} personas`;
}

/** Lo mismo para los cambios de prioridad de una misma tarea. */
function etiquetaDeCambios(cambios: number): string {
  if (cambios >= TOPE_HISTOGRAMA) return `${TOPE_HISTOGRAMA} o más`;
  return cambios === 1 ? '1 cambio' : `${cambios} cambios`;
}

/**
 * Dónde corta el histograma. Espejo de `MAX_MANOS` y `MAX_CAMBIOS` en
 * `tasks/stats.service.ts`, que son el mismo número por ahora.
 *
 * ⚠️ Si allí cambia y aquí no, el rótulo dice «5 o más» sobre un tramo que ya
 * no es ese. No da ningún error: da una etiqueta equivocada sobre una barra
 * correcta.
 */
const TOPE_HISTOGRAMA = 5;

/** Horas con un decimal, o 0 si no hay medida. El filtro de después lo quita. */
function redondear(horas: number | null): number {
  return horas === null ? 0 : Math.round(horas * 10) / 10;
}

const ETIQUETA_PRIORIDAD: Record<string, string> = {
  URGENT: 'Urgente',
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
};

/* ─── Temporales ───────────────────────────────────────────────────────── */

function construirSerie(
  grafico: EspecificacionGrafico,
  fuentes: FuentesGeneradas,
  nombres: Nombres,
): DatosGenerados {
  switch (grafico.metrica) {
    case 'flujo_por_columna': {
      const flow = fuentes.flow;
      if (!flow) return sinDatos('No se pudo leer el flujo del proyecto.');
      if (flow.serie.length < 2) {
        return sinDatos('Hace falta más de un día de historial para dibujar una evolución.');
      }
      return {
        forma: 'serie',
        puntos: flow.serie.map((punto) => ({ x: formatDay(punto.day), ...punto.porColumna })),
        /* Las columnas van en el orden del tablero, no por tamaño: el gráfico
           tiene que apilarse como se lee el tablero o no significa lo mismo. */
        series: flow.columnas.map((columna) => ({
          clave: columna.id,
          nombre: columna.name,
          color: tokenColor(columna.color),
        })),
        unidad: 'tareas',
      };
    }

    case 'cierres_por_semana':
    case 'creadas_por_semana': {
      const weekly = fuentes.weekly;
      if (!weekly) return sinDatos('No se pudo leer la serie semanal.');
      if (weekly.serie.length === 0) return sinDatos('Todavía no hay ninguna semana registrada.');

      const cerradas = grafico.metrica === 'cierres_por_semana';
      return {
        forma: 'serie',
        puntos: weekly.serie.map((semana) => ({
          x: formatDay(semana.semana),
          valor: cerradas ? semana.cerradas : semana.creadas,
        })),
        series: [
          {
            clave: 'valor',
            nombre: cerradas ? 'Cerradas' : 'Creadas',
            /* Una sola serie: el color de marca, no un tono de categoría. No hay
               nada de lo que distinguirla. */
            color: 'var(--color-primary)',
          },
        ],
        unidad: 'tareas',
      };
    }

    case 'entradas_contra_cierres': {
      const weekly = fuentes.weekly;
      if (!weekly) return sinDatos('No se pudo leer la serie semanal.');
      if (weekly.serie.length === 0) return sinDatos('Todavía no hay ninguna semana registrada.');

      return {
        forma: 'serie',
        puntos: weekly.serie.map((semana) => ({
          x: formatDay(semana.semana),
          creadas: semana.creadas,
          /**
           * ⚠️ **Los cierres viajan en negativo, y es la métrica entera.**
           *
           * Es lo único que separa unas barras divergentes de unas barras
           * apiladas: el signo pone los cierres por debajo del cero y deja el
           * saldo de la semana a la vista —si la parte de arriba es más larga
           * que la de abajo, entra más de lo que sale—. Con las dos en positivo
           * el gráfico se dibuja igual de bien y hay que restar de cabeza.
           *
           * Por eso `BARRAS_DIVERGENTES` es la **única** forma que el contrato
           * acepta para esta métrica: pedida como línea, la de cierres saldría
           * bajo el eje y se leería como una caída que no existe.
           */
          cerradas: -semana.cerradas,
        })),
        series: [
          { clave: 'creadas', nombre: 'Entradas', color: 'var(--color-primary)' },
          { clave: 'cerradas', nombre: 'Cierres', color: 'var(--color-success)' },
        ],
        unidad: 'tareas',
      };
    }

    /**
     * El cruce apilado: una barra por valor de `agruparPor`, partida dentro por
     * `partirPor`. El mismo dato que el mapa de calor, leído al revés — aquel
     * compara celda contra celda, esta compara el total de cada barra.
     */
    case 'cruce': {
      const matriz = matrizDe(grafico, fuentes);
      if (typeof matriz === 'string') return sinDatos(matriz);

      const { filas, columnas, valores } = celdasEnTabla(matriz, nombres);

      /**
       * ⚠️ **Las series se recortan a los seis tonos medidos, como en la dona.**
       *
       * Un cruce de persona contra etiqueta puede traer treinta valores en el
       * eje partido, y el código anterior ciclaba `serieColors` con un módulo:
       * a partir del séptimo, dos segmentos distintos de la **misma barra** se
       * pintaban del mismo color. No da ningún error y el gráfico deja de poder
       * leerse — que es exactamente lo que `pintarPorOrden` evita en el resto
       * del archivo, y por lo mismo se evita aquí.
       *
       * Lo que sobra se suma en «Otras», no se tira: una barra a la que le
       * faltaran segmentos tendría una altura que no es la del total.
       */
      const totales = columnas.map((columna) => ({
        columna,
        total: filas.reduce((suma, fila) => suma + (valores[fila.clave]?.[columna.clave] ?? 0), 0),
      }));
      totales.sort((a, b) => b.total - a.total);

      const cabeza = totales.slice(0, MAX_SERIES - 1).map((fila) => fila.columna);
      const resto = totales.slice(MAX_SERIES - 1).map((fila) => fila.columna);
      const agrupa = resto.length > 1;

      const series = [
        ...cabeza.map((columna, i) => ({
          clave: columna.clave,
          nombre: columna.nombre,
          color: serieColors[i],
        })),
        ...(agrupa
          ? [{ clave: CLAVE_OTRAS, nombre: 'Otras', color: COLOR_OTRAS }]
          : resto.map((columna, i) => ({
              clave: columna.clave,
              nombre: columna.nombre,
              color: serieColors[cabeza.length + i],
            }))),
      ];

      /* La clave de cada segmento es la del **valor**, no su nombre: dos
         personas homónimas son dos segmentos, y con el nombre por clave serían
         uno con la suma de los dos. El nombre solo se pinta. */
      const puntos: PuntoSerie[] = filas.map((fila) => {
        const punto: PuntoSerie = { x: fila.nombre };
        for (const columna of cabeza) {
          punto[columna.clave] = valores[fila.clave]?.[columna.clave] ?? 0;
        }
        if (agrupa) {
          punto[CLAVE_OTRAS] = resto.reduce(
            (suma, columna) => suma + (valores[fila.clave]?.[columna.clave] ?? 0),
            0,
          );
        } else {
          for (const columna of resto) {
            punto[columna.clave] = valores[fila.clave]?.[columna.clave] ?? 0;
          }
        }
        return punto;
      });

      return { forma: 'serie', puntos, series, unidad: 'tareas' };
    }

    default:
      return sinDatos('Esa métrica no se puede dibujar.');
  }
}

function sinDatos(motivo: string): DatosGenerados {
  return { forma: 'sin-datos', motivo };
}

/**
 * ⚠️ La semana en curso está **a medias**.
 *
 * Un gráfico semanal cuya última barra siempre parece una caída es un gráfico
 * que se lee mal todos los lunes. Quien lo pinte tiene que decirlo, y por eso
 * esto viaja aparte en vez de recortarse en silencio: quitar la semana en curso
 * escondería el dato más reciente, que suele ser el que se quiere ver.
 */
export function avisoDeSemanaIncompleta(weekly: ReportWeekly | null | undefined): string | null {
  if (!weekly || weekly.semana.diasTranscurridos >= 7) return null;
  return `La última semana lleva ${weekly.semana.diasTranscurridos} de 7 días, así que su barra todavía no es comparable con las anteriores.`;
}

/**
 * Las métricas del constructor cuyo número **es un tiempo**.
 *
 * No es la lista de las que aceptan un rango de días: `cierres_por_semana`
 * también se acota por fechas y su número son tareas, no días. Aquí están solo
 * aquellas en las que lo que se dibuja es una duración, que son las que heredan
 * el sesgo del calendario.
 */
const METRICAS_EN_TIEMPO: Metrica[] = [
  'tiempo_en_columna',
  'espera_actual_por_columna',
  'distribucion_de_entrega',
  /* `paradas_por_columna` cuenta tareas, pero el umbral que decide cuáles están
     paradas se mide en días, así que el sesgo entra por ahí. */
  'paradas_por_columna',
];

/**
 * ⚠️ Todo se cuenta en **días de calendario**, y el gráfico tiene que decirlo.
 *
 * Es la trampa 1 de R9. Los widgets del catálogo lo explican en su «cómo se lee
 * esto»; un gráfico del constructor no tiene esa vuelta, así que el aviso viaja
 * al lado del dato por la misma vía que el de la semana a medias.
 *
 * Viaja aparte y no dentro de `construirDatos` por el mismo motivo que aquel:
 * es algo que hay que **decir** sobre el dato, no una forma de recortarlo.
 */
export function avisoDeDiasNaturales(metrica: Metrica): string | null {
  if (!METRICAS_EN_TIEMPO.includes(metrica)) return null;
  return 'Se cuentan días naturales: no se descuentan fines de semana ni festivos.';
}

/**
 * Cuántos tramos tiene un histograma de tiempos de entrega.
 *
 * ⚠️ **No es una preferencia estética: sin esto el gráfico es ilegible.** La
 * primera versión hacía un tramo por día entre el mínimo y el máximo de la
 * muestra, y una sola tarea que tardara siete meses convertía el histograma en
 * doscientas barras de un píxel con todo el volumen aplastado contra el margen
 * izquierdo. La distribución seguía siendo correcta y no se veía.
 */
const TRAMOS_DE_ENTREGA = 12;

/**
 * Anchos de tramo que una persona lee sin traducir.
 *
 * El ancho «ideal» de un histograma de doce tramos sale casi siempre en decimal
 * —3,417 días— y un eje que dice «de 3,4 a 6,8» no se lee: se descifra. Se
 * redondea hacia arriba al primero de estos que llegue, así que los tramos
 * siempre empiezan y acaban en un número que alguien diría en voz alta.
 */
const ANCHOS_LEGIBLES = [1, 2, 3, 5, 7, 10, 14, 21, 30, 60, 90, 180, 365] as const;

/** El mayor de la lista: el tope de `days` es 365, así que no hay recorrido más ancho. */
const ANCHO_MAXIMO = ANCHOS_LEGIBLES[ANCHOS_LEGIBLES.length - 1];

function anchoDeTramo(recorrido: number): number {
  const ideal = recorrido / TRAMOS_DE_ENTREGA;
  return ANCHOS_LEGIBLES.find((ancho) => ancho >= ideal) ?? ANCHO_MAXIMO;
}

/**
 * Las métricas cuya respuesta **es una distribución**: cuántas tareas caen en
 * cada tramo, con el orden de los tramos como parte del dato.
 *
 * Las dos de `dynamics` llegan ya agrupadas por el servidor —«tres tareas
 * pasaron por dos manos»— y aquí solo se les cambia el nombre a los campos. La
 * de entrega llega como una muestra por tarea y hay que agruparla, que es lo
 * único de este archivo que se parece a un cálculo. Sigue sin estimar nada:
 * contar cuántas muestras caen en un tramo no inventa ninguna.
 */
function construirDistribucion(
  grafico: EspecificacionGrafico,
  fuentes: FuentesGeneradas,
): DatosGenerados {
  if (grafico.metrica === 'distribucion_de_entrega') {
    const cycle = fuentes.cycle;
    if (!cycle) return sinDatos('No se pudo leer el tiempo de entrega.');
    if (cycle.muestras.length === 0) return sinDatos('No hay tareas cerradas que medir.');

    const dias = cycle.muestras.map((muestra) => muestra.leadHours / 24);
    const maximo = Math.max(...dias);
    /**
     * El eje arranca en cero, no en el mínimo de la muestra.
     *
     * Es la diferencia entre «esto es lo que se tarda» y «esto es lo que se
     * tarda descontando lo rápido». Un proyecto cuya tarea más rápida son cinco
     * días tiene un problema, y un eje que empezara en cinco lo escondería
     * justamente en el gráfico que existe para verlo.
     */
    const ancho = anchoDeTramo(Math.max(maximo, 1));
    const tramos = Array.from({ length: Math.max(Math.ceil(maximo / ancho), 1) }, (_, indice) => ({
      min: indice * ancho,
      max: (indice + 1) * ancho,
      count: 0,
    }));

    for (const valor of dias) {
      /* El último tramo se lleva el máximo: con `[min, max)` a secas, la tarea
         más lenta de todas cae fuera del array y desaparece del gráfico. */
      const indice = Math.min(Math.floor(valor / ancho), tramos.length - 1);
      tramos[indice].count += 1;
    }

    return { forma: 'distribucion', tramos, unidadY: 'tareas', unidadX: 'días' };
  }

  if (grafico.metrica === 'rotacion_por_tarea' || grafico.metrica === 'volatilidad_por_tarea') {
    const dynamics = fuentes.dynamics;
    if (!dynamics) return sinDatos('No se pudo leer el historial del proyecto.');

    const rotacion = grafico.metrica === 'rotacion_por_tarea';
    const distribucion = rotacion
      ? dynamics.rotacion.distribucion
      : dynamics.volatilidad.distribucion;
    if (distribucion.length === 0) {
      return sinDatos(
        rotacion
          ? 'Ninguna tarea ha cambiado de responsable en el historial capturado.'
          : 'Ninguna tarea ha cambiado de prioridad en el historial capturado.',
      );
    }

    return {
      forma: 'distribucion',
      /* Los tramos de estas dos son enteros sueltos —una mano, dos manos— así
         que `max` es siempre `min + 1`: el ancho no es un dato, es la unidad. */
      tramos: distribucion.map((fila) => {
        const valor = 'manos' in fila ? fila.manos : fila.cambios;
        return { min: valor, max: valor + 1, count: fila.tareas };
      }),
      unidadY: 'tareas',
      unidadX: rotacion ? 'personas' : 'cambios',
    };
  }

  return sinDatos('Esa métrica no se puede dibujar como distribución.');
}

/* ─── El cruce de dos dimensiones ──────────────────────────────────────── */

/**
 * El nombre que se pinta para un valor de una dimensión del cruce.
 *
 * ⚠️ **El servidor solo resuelve una de las cuatro dimensiones.** `matrix`
 * traduce `columna` —el nombre está en projects-service, que es a quien le
 * pregunta— y devuelve `persona` y `etiqueta` como el identificador crudo y
 * `prioridad` como la constante del enum. No es un descuido suyo: los nombres de
 * las personas los resuelve el directorio y los de las etiquetas ya viajan a
 * esta pantalla para la barra de filtros, así que pedírselos otra vez sería un
 * viaje de ida y vuelta por datos que la page ya tiene delante.
 *
 * Lo que sí era un descuido, y costó encontrarse: esto miraba **solo**
 * `nombres.personas`, así que un cruce partido por etiqueta pintaba una columna
 * por UUID y una fila de prioridades decía `URGENT`. Salía plausible —la tabla
 * se dibujaba entera y las cifras eran correctas— y no se podía leer.
 */
function nombreDeDimension(
  dimension: string,
  clave: string,
  delServidor: string | null,
  nombres: Nombres,
): string {
  if (delServidor !== null) return delServidor;
  if (dimension === 'persona') return nombres.personas[clave] ?? clave;
  if (dimension === 'etiqueta') return nombres.etiquetas[clave] ?? clave;
  if (dimension === 'prioridad') return ETIQUETA_PRIORIDAD[clave] ?? clave;
  return clave;
}

/** Lo que se pinta en el hueco de una tarea sin valor en esa dimensión. */
const SIN_VALOR = 'Sin asignar';

/**
 * El cruce leído como tabla: una fila por valor de `agruparPor`, una columna por
 * valor de `partirPor` y el recuento dentro.
 *
 * ⚠️ **Las claves se conservan además de los nombres.** Dos personas pueden
 * llamarse igual, y una tabla indexada por el nombre las fundiría en una fila
 * con la suma de las dos — que se lee perfectamente y es mentira.
 */
function celdasEnTabla(matriz: ReportMatrix, nombres: Nombres) {
  const filas = new Map<string, string>();
  const columnas = new Map<string, string>();
  const valores: Record<string, Record<string, number>> = {};

  for (const celda of matriz.celdas) {
    const a = celda.a ?? SIN_VALOR;
    const b = celda.b ?? SIN_VALOR;

    filas.set(
      a,
      celda.a === null
        ? SIN_VALOR
        : nombreDeDimension(matriz.agruparPor, a, celda.aNombre, nombres),
    );
    columnas.set(
      b,
      celda.b === null ? SIN_VALOR : nombreDeDimension(matriz.partirPor, b, celda.bNombre, nombres),
    );

    valores[a] ??= {};
    valores[a][b] = celda.count;
  }

  const enLista = (mapa: Map<string, string>) =>
    Array.from(mapa, ([clave, nombre]) => ({ clave, nombre }));

  return { filas: enLista(filas), columnas: enLista(columnas), valores };
}

/** El cruce de un `mapa_calor`. */
function construirMatriz(
  grafico: EspecificacionGrafico,
  fuentes: FuentesGeneradas,
  nombres: Nombres,
): DatosGenerados {
  const matriz = matrizDe(grafico, fuentes);
  if (typeof matriz === 'string') return sinDatos(matriz);

  const { filas, columnas, valores } = celdasEnTabla(matriz, nombres);
  return { forma: 'matriz', filas, columnas, valores, unidad: 'tareas' };
}

/**
 * El cruce en el paquete de informes, o el motivo por el que no está.
 *
 * Devuelve la matriz o la frase que hay que enseñar en su hueco, en vez de
 * `null`: el motivo distingue «no se pudo leer» de «no hay nada que enseñar», y
 * son dos pantallas distintas (invariante 6).
 */
function matrizDe(
  grafico: EspecificacionGrafico,
  fuentes: FuentesGeneradas,
): ReportMatrix | string {
  const parte = parteDeCruce(grafico);
  const matriz = parte ? fuentes.matrices?.[parte] : undefined;
  if (!matriz) return 'No se pudo leer el cruce.';
  if (matriz.celdas.length === 0) return 'No hay ninguna tarea que caiga en este cruce.';
  return matriz;
}
