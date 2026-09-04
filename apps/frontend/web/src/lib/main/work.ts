import { type Task, dueState } from '@praxis/commons';

/**
 * Cómo está repartido tu trabajo abierto.
 *
 * ## Por qué es un reparto y no un total
 *
 * «Tienes 23 tareas» no dice nada que sirva para decidir qué hacer ahora. Las
 * mismas 23 repartidas en «4 vencidas · 6 esta semana · 9 más adelante · 4 sin
 * fecha» son cuatro decisiones distintas, y la primera es urgente aunque el
 * total sea idéntico.
 *
 * ⚠️ **`vencidas` y `pronto` no se suman nunca en una cifra única** (§20.4). Una
 * ya es un problema y la otra es una advertencia; juntarlas obliga a abrir para
 * saber cuál de las dos te ha tocado. Esta función las devuelve separadas y
 * quien pinta las mantiene separadas.
 */
export interface WorkSplit {
  vencidas: Task[];
  pronto: Task[];
  masAdelante: Task[];
  sinFecha: Task[];
  /** Cuántas hay en total entre las cuatro. */
  total: number;
}

/**
 * Reparte las tareas abiertas por su fecha.
 *
 * Usa `dueState`, que es **la misma regla que aplica la tarjeta del tablero**,
 * así que el panel y el tablero no pueden contradecirse sobre si algo está
 * vencido.
 */
export function splitWork(tasks: Task[]): WorkSplit {
  const split: WorkSplit = {
    vencidas: [],
    pronto: [],
    masAdelante: [],
    sinFecha: [],
    total: tasks.length,
  };

  for (const task of tasks) {
    switch (dueState(task.dueDate)) {
      case 'overdue':
        split.vencidas.push(task);
        break;
      case 'soon':
        split.pronto.push(task);
        break;
      case 'later':
        split.masAdelante.push(task);
        break;
      default:
        split.sinFecha.push(task);
    }
  }

  return split;
}

/**
 * Cuántas tareas se piden para el panel.
 *
 * ⚠️ **Y por qué el número importa más de lo que parece.** `findMyTasks` ordena
 * por `dueDate ASC`, y en Postgres los nulos de un `ASC` van **al final**. O sea
 * que las primeras que llegan son las que vencen antes —justo las que el panel
 * necesita— y lo que se queda fuera del tope es la cola de las lejanas y las que
 * no tienen fecha. Un recorte por ahí no esconde ninguna urgencia.
 *
 * Es también el motivo de que baste **una** petición donde antes hacían falta
 * dos: la que había pedía `dueBefore=<hoy+7d>` para sacar los dos avisos, y
 * quitando el filtro sale eso mismo —el orden ya lo pone delante— más el reparto
 * completo. Ver `splitWork`.
 */
export const MAX_TAREAS_DEL_PANEL = 100;

/**
 * ⚠️ **El `total` de `GET /me/tasks` no sirve cuando se pide `excludeDone`.**
 *
 * El gateway aplica ese filtro **después** de consultar —tiene que hacerlo, las
 * columnas viven en otro microservicio— y entonces reescribe `total` con lo que
 * le queda: `total = remaining.length`. Como el `take` del `limit` se aplicó
 * antes, ese número no es «cuántas tienes abiertas» sino «cuántas abiertas había
 * entre las primeras `limit`».
 *
 * Consecuencia práctica: con el tope lleno no se puede saber cuántas hay de
 * verdad, así que se dice `100+` en vez de inventar una cifra exacta. Un panel
 * que redondea a la baja sin avisar es un panel en el que no se puede confiar
 * para lo demás.
 *
 * Apuntado en PENDIENTES-BACKEND: lo que haría falta es que el filtro de cierre
 * viva en la consulta, no después de ella.
 */
export function etiquetaDeTotal(recibidas: number): string {
  return recibidas >= MAX_TAREAS_DEL_PANEL ? `${MAX_TAREAS_DEL_PANEL}+` : String(recibidas);
}
