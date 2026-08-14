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
  byColumn: { columnId: string; name: string; color: string | null; count: number }[];
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
  columnas: { id: string; name: string; color: string | null }[];
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
