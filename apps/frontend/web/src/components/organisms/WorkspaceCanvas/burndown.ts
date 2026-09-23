import type { Sprint, Task } from '@praxis/commons';

/**
 * Burndown y velocidad, calculados en vivo sobre las tareas que ya están en
 * pantalla (D9 de `docs/PLAN-SCRUM-KANBAN.md`).
 *
 * ## Puntos, o tareas si nadie estimó
 *
 * Si alguna tarea del sprint tiene `estimatePoints`, la unidad son los puntos
 * (y lo no estimado cuenta 0). Si ninguna tiene, la unidad son las tareas: un
 * burndown en puntos de un sprint sin estimar sería una línea plana en cero.
 *
 * ## El alcance se lee de `sprintAssignedAt`
 *
 * Lo que entró **después** de arrancar el sprint es scope creep. El total de
 * cada día cuenta lo que ya estaba asignado a esa hora, así que la línea sube
 * el día que entra trabajo nuevo — sin foto congelada del alcance.
 *
 * ⚠️ Una tarea que salió del sprint a mitad de camino ya no tiene su
 * `sprintId`, así que desaparece del gráfico entero, también de los días en
 * los que sí estuvo. Es el precio de calcular en vivo, y está escrito en D9.
 */

export type Unidad = 'puntos' | 'tareas';

export interface DiaDeBurndown {
  /** Medianoche local del día. */
  dia: Date;
  /** Lo comprometido a final de ese día. */
  alcance: number;
  /** Lo que quedaba por terminar a final de ese día. */
  restante: number;
  /** La línea recta de «ir a ritmo» desde el alcance original hasta 0. */
  ideal: number;
  /** `false` en los días que todavía no han llegado: no se pintan. */
  transcurrido: boolean;
}

export interface Burndown {
  unidad: Unidad;
  dias: DiaDeBurndown[];
  alcanceOriginal: number;
  /** Lo que entró después de arrancar. */
  anadido: number;
  hecho: number;
}

const UN_DIA = 86_400_000;

function medianoche(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

export function unidadDe(tareas: readonly Task[]): Unidad {
  return tareas.some((t) => t.estimatePoints !== null && t.estimatePoints !== undefined)
    ? 'puntos'
    : 'tareas';
}

function valor(tarea: Task, unidad: Unidad): number {
  return unidad === 'puntos' ? (tarea.estimatePoints ?? 0) : 1;
}

export function calcularBurndown(
  sprint: Sprint,
  todas: readonly Task[],
  ahora = new Date(),
): Burndown | null {
  if (!sprint.startDate || !sprint.endDate) return null;

  const tareas = todas.filter((t) => t.sprintId === sprint.id);
  const unidad = unidadDe(tareas);
  const inicio = new Date(sprint.startDate);
  const primerDia = medianoche(inicio);
  const ultimoDia = medianoche(new Date(sprint.endDate));
  const totalDias = Math.max(
    1,
    Math.round((ultimoDia.getTime() - primerDia.getTime()) / UN_DIA) + 1,
  );

  /* Sin `sprintAssignedAt` (no debería pasar, pero es un campo anulable) se
     trata como si hubiera estado desde el principio. */
  const entro = (t: Task) => (t.sprintAssignedAt ? new Date(t.sprintAssignedAt) : inicio);

  const alcanceOriginal = tareas
    .filter((t) => entro(t) <= inicio)
    .reduce((suma, t) => suma + valor(t, unidad), 0);
  const anadido = tareas
    .filter((t) => entro(t) > inicio)
    .reduce((suma, t) => suma + valor(t, unidad), 0);
  const hecho = tareas.filter((t) => t.completedAt).reduce((suma, t) => suma + valor(t, unidad), 0);

  const hoy = medianoche(ahora).getTime();
  const dias: DiaDeBurndown[] = [];
  for (let i = 0; i < totalDias; i++) {
    const dia = new Date(primerDia.getFullYear(), primerDia.getMonth(), primerDia.getDate() + i);
    const finDelDia = dia.getTime() + UN_DIA - 1;
    let alcance = 0;
    let terminado = 0;
    for (const t of tareas) {
      if (entro(t).getTime() > finDelDia) continue;
      const v = valor(t, unidad);
      alcance += v;
      if (t.completedAt && new Date(t.completedAt).getTime() <= finDelDia) terminado += v;
    }
    dias.push({
      dia,
      alcance,
      restante: alcance - terminado,
      ideal: totalDias === 1 ? 0 : alcanceOriginal * (1 - i / (totalDias - 1)),
      transcurrido: dia.getTime() <= hoy,
    });
  }

  return { unidad, dias, alcanceOriginal, anadido, hecho };
}

export interface Velocidad {
  unidad: Unidad;
  sprints: { sprint: Sprint; hecho: number }[];
  media: number | null;
}

/**
 * Lo terminado en los últimos sprints cerrados.
 *
 * Tras el cierre, lo pendiente ya salió del sprint (D6), así que lo que queda
 * con su `sprintId` es exactamente lo que se terminó en él.
 */
export function calcularVelocidad(
  cerrados: readonly Sprint[],
  todas: readonly Task[],
  cuantos = 5,
): Velocidad {
  const recientes = cerrados.slice(0, cuantos);
  const ids = new Set(recientes.map((s) => s.id));
  const unidad = unidadDe(todas.filter((t) => t.sprintId && ids.has(t.sprintId)));
  const sprints = recientes.map((sprint) => ({
    sprint,
    hecho: todas
      .filter((t) => t.sprintId === sprint.id && t.completedAt)
      .reduce((suma, t) => suma + valor(t, unidad), 0),
  }));
  const media =
    sprints.length === 0 ? null : sprints.reduce((s, x) => s + x.hecho, 0) / sprints.length;
  return { unidad, sprints, media };
}

export function conUnidad(n: number, unidad: Unidad): string {
  const redondo = Number.isInteger(n) ? n : Math.round(n * 10) / 10;
  if (unidad === 'puntos') return `${redondo} ${redondo === 1 ? 'punto' : 'puntos'}`;
  return `${redondo} ${redondo === 1 ? 'tarea' : 'tareas'}`;
}
