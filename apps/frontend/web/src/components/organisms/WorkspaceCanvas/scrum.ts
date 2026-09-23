import type { Sprint, Task } from '@praxis/commons';

/**
 * Lo que las vistas de Scrum comparten, sin estado ni JSX.
 * Ver `docs/PLAN-SCRUM-KANBAN.md`.
 */

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

/** Orden del backlog y de cada sprint: el mismo `order` que la columna (D5). */
export function porOrden(a: Task, b: Task): number {
  return a.order - b.order || a.createdAt.localeCompare(b.createdAt);
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
