import { colors } from '@praxis/commons';

/**
 * Formas que devuelve `reports-service`.
 *
 * Se declaran aquí y no en `commons` porque de momento solo las usa esta zona;
 * suben el día que otra las necesite, que es la misma regla que para los
 * componentes.
 */

export interface ReportSnapshot {
  total: number;
  completed: number;
  overdue: number;
  unassigned: number;
  checklistItems: number;
  checklistDone: number;
  /** > 0 significa que el historial de este proyecto está **fabricado**. */
  eventosSinteticos: number;
  byPriority: { priority: string; count: number }[];
  /**
   * ⚠️ `board` es lo que hace legible este reparto en un proyecto con varios
   * tableros: sin él, dos columnas llamadas «Por hacer» salen como dos barras
   * idénticas y parece que solo se está viendo una.
   */
  byColumn: {
    columnId: string;
    name: string;
    color: string | null;
    count: number;
    board?: string | null;
    workspace?: string | null;
  }[];
  byLabel: { labelId: string; count: number }[];
  byAssignee: { userId: string; count: number }[];
}

export interface Suficiencia {
  suficiente: boolean;
  tareasCerradas: number;
  faltanTareas: number;
  diasDeHistorial: number;
  faltanDias: number;
}

export interface ReportCycleTime {
  suficiencia: Suficiencia;
  muestras: { taskId: string; completedAt: string; leadHours: number; cycleHours: number | null }[];
  lead: { p50: number | null; p85: number | null };
  cycle: { p50: number | null; p85: number | null; muestrasConMovimiento: number };
}

export interface ReportFlow {
  columnas: { id: string; name: string; color: string | null; board?: string | null }[];
  serie: { day: string; porColumna: Record<string, number> }[];
}

export interface ReportForecast {
  suficiencia: Suficiencia;
  pendientes: number;
  throughputDiario?: { media: number };
  prediccion: { p50: number; p85: number; p95: number } | null;
}

export interface ReportPerson {
  userId: string;
  abiertas: number;
  cerradas: number;
  vencidas: number;
  medianaHoras: number | null;
}

/**
 * Lo que está parado: abiertas que llevan `dias` sin cambiar de columna.
 *
 * ⚠️ `sinHistorial` **no significa antigua**: son las anteriores a la captura de
 * eventos, donde lo que se mide es la edad y no el parón. Cualquier gráfico que
 * las cuente tiene que poder decirlo, o acusa de paradas a tareas que solo son
 * viejas.
 */
export interface ReportBlocked {
  dias: number;
  total: number;
  tareas: {
    taskId: string;
    titulo: string;
    columna: string;
    columnId: string;
    diasParada: number;
    sinHistorial: boolean;
    vencida: boolean;
  }[];
}

/** Cierres y entradas por semana. La última de la serie está a medias. */
export interface ReportWeekly {
  semana: { semana: string; cerradas: number; creadas: number; diasTranscurridos: number };
  anterior: { semana: string; cerradas: number; creadas: number };
  variacion: number | null;
  ritmoDiario: { semana: number; anterior: number };
  serie: { semana: string; cerradas: number; creadas: number }[];
}

/**
 * Del token de color del sistema al color real.
 *
 * Las columnas y las etiquetas guardan un token (`primary`, `success`…), no un
 * hex, y Recharts necesita un color de verdad: sus `fill` y `stroke` van a SVG,
 * donde una clase de Tailwind no sirve de nada.
 */
export function tokenColor(token: string | null | undefined): string {
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

/**
 * Horas → texto legible.
 *
 * Los tiempos vienen en horas porque es la unidad en la que tienen sentido los
 * dos extremos: una tarea de dos horas y otra de tres semanas. Al enseñarlos se
 * cambia de unidad para no leer «412 h».
 */
export function formatDuration(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1).replace('.', ',')} h`;
  return `${(hours / 24).toFixed(1).replace('.', ',')} d`;
}

/** `2026-07-21` → `21 jul`. Las series diarias no necesitan el año. */
export function formatDay(iso: string): string {
  const [, mes, dia] = iso.split('-');
  const meses = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic',
  ];
  return `${Number(dia)} ${meses[Number(mes) - 1]}`;
}

export const PRIORITY_ORDER = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const;

export const PRIORITY_COLOR: Record<string, string> = {
  URGENT: colors.error,
  HIGH: colors.warning,
  MEDIUM: colors.info,
  LOW: colors.textSecondary,
};

/**
 * La etiqueta de una columna, **con su tablero solo cuando hace falta**.
 *
 * En un proyecto de un tablero, poner «Por hacer · Desarrollo» en cada barra es
 * repetir la misma palabra en todas y no distingue nada. En cuanto hay dos, es
 * lo único que las distingue: cada tablero numera sus columnas desde cero y los
 * nombres se repiten casi siempre («Por hacer», «Hecho»).
 *
 * Por eso la regla es el número de tableros presentes y no una preferencia: se
 * añade cuando aporta y se calla cuando no.
 */
export function etiquetaDeColumna(
  columna: { name: string; board?: string | null },
  variosTableros: boolean,
): string {
  return variosTableros && columna.board ? `${columna.name} · ${columna.board}` : columna.name;
}

/** Cuántos tableros distintos aparecen en un reparto por columna. */
export function cuentaTableros(filas: { board?: string | null }[]): number {
  return new Set(filas.map((fila) => fila.board).filter(Boolean)).size;
}

/**
 * ─── Los filtros de Análisis, entre la URL y la API ───────────────────────
 *
 * Viven en la URL —ver `AnalysisFilters`— así que hay que leerlos de
 * `searchParams` y volver a escribirlos en la query del paquete. Las dos
 * conversiones van juntas aquí para que no puedan divergir: si una supiera de un
 * filtro que la otra no, el control lo enseñaría puesto y el gráfico no lo
 * aplicaría, sin ningún error por medio.
 *
 * Los nombres son **los mismos** que los del DTO del backend
 * (`ReportFiltersQueryDto`). Traducirlos aquí solo habría añadido un sitio donde
 * equivocarse.
 */
export const CLAVES_DE_FILTRO = [
  'from',
  'to',
  'boardId',
  'assigneeId',
  'labelId',
  'priority',
] as const;

export type ClaveDeFiltro = (typeof CLAVES_DE_FILTRO)[number];
export type FiltrosDeAnalisis = Partial<Record<ClaveDeFiltro, string>>;

/**
 * Lo que trae la URL, quedándose solo con lo que significa algo.
 *
 * ⚠️ **La prioridad se comprueba contra el conjunto cerrado y las demás no.** No
 * es incoherencia: un valor inventado en `priority` haría que el gateway
 * respondiera 400 al **paquete entero**, y el `.catch` de la página lo degrada a
 * `{}` — o sea, las siete tarjetas diciendo «no disponible» por una letra de más
 * en la barra de direcciones. Eso se lee como «este proyecto no tiene datos». Un
 * UUID o una fecha mal escritos también dan 400, pero ahí no hay conjunto
 * cerrado contra el que comprobar sin duplicar la validación del backend, que es
 * lo que no se hace.
 *
 * Un `to` sin `from` se descarta: el backend lo ignora, y dejarlo aquí haría que
 * el control lo enseñara puesto sin estarlo.
 */
export function filtrosDesdeUrl(
  searchParams: Record<string, string | string[] | undefined>,
): FiltrosDeAnalisis {
  const filtros: FiltrosDeAnalisis = {};

  for (const clave of CLAVES_DE_FILTRO) {
    const valor = searchParams[clave];
    /* Un parámetro repetido (`?priority=HIGH&priority=LOW`) llega como array.
       Se toma el primero en vez de descartarlo: es lo que hace el navegador al
       enviar un formulario dos veces, no un intento de nada raro. */
    const texto = Array.isArray(valor) ? valor[0] : valor;
    if (typeof texto === 'string' && texto.length > 0) filtros[clave] = texto;
  }

  if (filtros.priority && !PRIORITY_ORDER.includes(filtros.priority as never)) {
    filtros.priority = undefined;
  }
  if (!filtros.from) filtros.to = undefined;

  return filtros;
}

/** Los filtros como trozo de query, ya con el `&` delante. Vacío si no hay ninguno. */
export function filtrosAQuery(filtros: FiltrosDeAnalisis): string {
  const params = new URLSearchParams();
  for (const clave of CLAVES_DE_FILTRO) {
    const valor = filtros[clave];
    if (valor) params.set(clave, valor);
  }
  const qs = params.toString();
  return qs ? `&${qs}` : '';
}
