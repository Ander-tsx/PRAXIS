import { MAX_SERIES, serieColors } from '@praxis/commons';
import {
  PRIORITY_COLOR,
  PRIORITY_ORDER,
  type ReportBlocked,
  type ReportColumnTime,
  type ReportDynamics,
  type ReportFlow,
  type ReportPerson,
  type ReportSnapshot,
  type ReportWeekly,
  formatDay,
  tokenColor,
} from './reports';
import type { EspecificacionGrafico, Metrica } from './widgets';

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
  const categoricas = construirCategorias(grafico, fuentes, nombres);
  if (categoricas) return categoricas;
  return construirSerie(grafico, fuentes);
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

function construirSerie(grafico: EspecificacionGrafico, fuentes: FuentesGeneradas): DatosGenerados {
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
