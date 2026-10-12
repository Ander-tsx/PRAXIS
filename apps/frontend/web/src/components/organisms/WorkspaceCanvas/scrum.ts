import type { Sprint, SprintMetrics, Task } from '@praxis/commons';

/**
 * Lo que las vistas de Scrum comparten, sin estado ni JSX.
 * Ver `docs/PLAN-SCRUM-KANBAN.md`.
 */

/**
 * Lo que la página carga de un tablero con Scrum, además de las tareas del
 * sprint que enseña: sus sprints, su backlog y las filas del burndown.
 */
export interface ScrumDelTablero {
  sprints: Sprint[];
  backlog: Task[];
  metricas: SprintMetrics;
  /**
   * Lo terminado en sprints ya cerrados, lo último primero: la columna «Closed». Es una página
   * (`LOTE_DE_CERRADAS`), con el `total` para saber si hay más.
   */
  cerradas: { items: Task[]; total: number };
}

/** Cuántas tareas de la columna «Closed» se piden de una vez. */
export const LOTE_DE_CERRADAS = 50;

/** Cómo se llama la columna final de solo lectura si nadie la ha renombrado. */
export const NOMBRE_COLUMNA_CERRADA = 'Closed';

/**
 * Id de la «columna» del backlog dentro del motor de arrastre del tablero. El
 * panel se registra con él como una columna más: así arrastrar del backlog a
 * una columna, de una columna al backlog o reordenar el backlog son el mismo
 * gesto, con el mismo fantasma y el mismo hueco (D17).
 */
export const BACKLOG = '__backlog__';

/**
 * El sprint que enseña el tablero: el que está en curso o, sin él, el
 * planeado. Entre dos sprints el tablero es la planificación del siguiente.
 */
export function sprintEnTablero(sprints: readonly Sprint[]): Sprint | null {
  return sprintActivo(sprints) ?? sprintsPlaneados(sprints)[0] ?? null;
}

/** Nombre por defecto del siguiente: «Sprint N», contando todos los que hubo. */
export function nombreDelSiguiente(sprints: readonly Sprint[]): string {
  return `Sprint ${sprints.length + 1}`;
}

/** Como mucho hay uno por tablero (D3). */
export function sprintActivo(sprints: readonly Sprint[]): Sprint | null {
  return sprints.find((s) => s.status === 'ACTIVE') ?? null;
}

/** Los planeados, del más viejo al más nuevo: el primero es el siguiente natural. */
export function sprintsPlaneados(sprints: readonly Sprint[]): Sprint[] {
  return sprints
    .filter((s) => s.status === 'PLANNED')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function sprintsCerrados(sprints: readonly Sprint[]): Sprint[] {
  return sprints
    .filter((s) => s.status === 'CLOSED')
    .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
}

/** `YYYY-MM-DD` en hora local, para un `<input type="date">`. */
export function claveDiaLocal(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Duración por defecto de un sprint: dos semanas, de hoy al día 14 incluido
 * (P3.2). Es solo el valor de partida del formulario — cada equipo lo cambia.
 */
export const DIAS_POR_DEFECTO = 14;

export function fechasPorDefecto(hoy = new Date()): { inicio: string; fin: string } {
  const fin = new Date(hoy);
  fin.setDate(fin.getDate() + DIAS_POR_DEFECTO - 1);
  return { inicio: claveDiaLocal(hoy), fin: claveDiaLocal(fin) };
}

const fechaCorta = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

export function rangoDeFechas(sprint: Sprint): string | null {
  if (!sprint.startDate || !sprint.endDate) return null;
  return `${fechaCorta.format(new Date(sprint.startDate))} – ${fechaCorta.format(new Date(sprint.endDate))}`;
}

/**
 * Días que le quedan a un sprint activo, contando hoy. Negativo si ya pasó la
 * fecha de fin: el sprint **no se cierra solo** —cerrar siempre pregunta (D6)—,
 * así que puede seguir activo pasada la fecha, y eso hay que decirlo.
 */
export function diasRestantes(sprint: Sprint, ahora = new Date()): number | null {
  if (!sprint.endDate) return null;
  const fin = new Date(sprint.endDate);
  const unDia = 86_400_000;
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  const ultimo = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate()).getTime();
  return Math.round((ultimo - hoy) / unDia) + 1;
}

export function textoDiasRestantes(dias: number | null): string {
  if (dias === null) return '';
  if (dias > 1) return `quedan ${dias} días`;
  if (dias === 1) return 'último día';
  if (dias === 0) return 'terminó ayer';
  return `terminó hace ${-dias + 1} días`;
}

/** Fecha de un sprint como `YYYY-MM-DD` local, para rellenar un `<input type="date">`. */
export function diaDe(iso: string | null): string | null {
  return iso ? claveDiaLocal(new Date(iso)) : null;
}
