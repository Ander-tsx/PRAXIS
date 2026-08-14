import { MAX_SERIES, serieColors } from '@praxis/commons';
import {
  PRIORITY_COLOR,
  PRIORITY_ORDER,
  type ReportBlocked,
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
  const conColorPropio = new Set<Metrica>(['tareas_por_columna', 'tareas_por_prioridad']);

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

    default:
      return null;
  }

  if (crudas.length === 0) {
    return sinDatos('Todavía no hay nada que contar aquí.');
  }

  /* Las que traen color propio conservan su orden natural —el del tablero, el de
     la prioridad—; las demás se ordenan de mayor a menor, que es lo único que
     ordena una lista de nombres. */
  const ordenadas = conColorPropio.has(metrica)
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
