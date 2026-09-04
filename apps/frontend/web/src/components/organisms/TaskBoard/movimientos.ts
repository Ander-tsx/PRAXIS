'use client';

import type { Task } from '@praxis/commons';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * El movimiento que la pantalla ya da por hecho y el servidor todavía no sabe.
 *
 * ## Por qué existe esto
 *
 * Antes, soltar una tarjeta en otra columna hacía esto: mandar la petición,
 * esperar, revalidar la página entera y **entonces** dibujar la tarea en su
 * sitio. Mientras tanto la tarjeta volvía al origen, porque el único sitio donde
 * constaba el movimiento era el servidor. El resultado en la mano es que cada
 * arrastre se deshacía solo durante medio segundo y luego se rehacía a saltos —y
 * si la red iba lenta, varios segundos—.
 *
 * El orden correcto es el contrario: **la pantalla se cree el movimiento
 * inmediatamente** y solo lo deshace si el servidor lo rechaza. El caso normal
 * —que es la inmensa mayoría— sale instantáneo, y el caso raro cuesta una
 * vuelta atrás con su mensaje, que es donde debe estar el coste.
 *
 * ## Cómo se retira un movimiento
 *
 * Aquí está la única sutileza. Un movimiento **no se retira porque el servidor
 * confirme**: se retira cuando llega el primer render con datos nuevos *después*
 * de esa confirmación. Los dos momentos no son el mismo —la acción resuelve, y
 * el árbol revalidado se aplica en otro commit— y retirarlo en el primero deja
 * un fotograma con la tarjeta en su sitio viejo. Un parpadeo de 16 ms se ve, y
 * se ve justo en la operación que veníamos a arreglar.
 *
 * La llegada de datos nuevos se detecta por **identidad del array de tareas**:
 * lo construye la page en el servidor, así que un array distinto es un payload
 * distinto. Un repintado del cliente conserva la misma referencia y no cuenta.
 */
export interface MovimientoOptimista {
  taskId: string;
  /** Columna destino. */
  columnId: string;
  /** Nombre de esa columna: es lo que el backend guarda como `status`. */
  status: string;
  /** Posición dentro de la columna destino, ya sin la tarea. */
  indice: number;
  /** `false` mientras la petición está en vuelo. */
  confirmado: boolean;
}

/**
 * Las tareas de un tablero repartidas por columna, con los movimientos
 * optimistas ya aplicados encima.
 *
 * El orden dentro de una columna sale de `order` y, a igualdad, de `createdAt`:
 * el backend no reindexa al mover, así que dos tareas pueden compartir `order`
 * y sin el desempate su orden relativo bailaría en cada carga.
 */
export function repartirPorColumna(
  tasks: Task[],
  movimientos: MovimientoOptimista[],
): Map<string, Task[]> {
  const movidas = new Map(movimientos.map((m) => [m.taskId, m]));
  const porColumna = new Map<string, Task[]>();

  for (const task of tasks) {
    if (movidas.has(task.id)) continue;
    const lista = porColumna.get(task.columnId);
    if (lista) lista.push(task);
    else porColumna.set(task.columnId, [task]);
  }

  for (const lista of porColumna.values()) {
    lista.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  }

  /* En el orden en que se hicieron: si alguien mueve dos tarjetas seguidas a la
     misma columna, la segunda tiene que ver el hueco que dejó la primera. */
  for (const movimiento of movimientos) {
    const task = tasks.find((candidata) => candidata.id === movimiento.taskId);
    if (!task) continue;

    const destino = porColumna.get(movimiento.columnId) ?? [];
    if (!porColumna.has(movimiento.columnId)) porColumna.set(movimiento.columnId, destino);

    const indice = Math.max(0, Math.min(movimiento.indice, destino.length));
    /* La copia lleva ya la columna nueva: el diálogo de la tarea y el chip de
       «Completada» leen `columnId`, y con el valor viejo dirían otra cosa que lo
       que la tarjeta está enseñando. */
    destino.splice(indice, 0, {
      ...task,
      columnId: movimiento.columnId,
      status: movimiento.status,
    });
  }

  return porColumna;
}

export interface EstadoDeMovimientos {
  movimientos: MovimientoOptimista[];
  /** Apunta el movimiento y devuelve la lista resultante ya aplicada. */
  registrar: (movimiento: Omit<MovimientoOptimista, 'confirmado'>) => void;
  confirmar: (taskId: string) => void;
  /** Lo deshace: la tarjeta vuelve a donde estaba. */
  revertir: (taskId: string) => void;
}

export function useMovimientosOptimistas(tasks: Task[]): EstadoDeMovimientos {
  const [movimientos, setMovimientos] = useState<MovimientoOptimista[]>([]);
  const ultimoPayload = useRef(tasks);

  useEffect(() => {
    if (tasks === ultimoPayload.current) return;
    ultimoPayload.current = tasks;
    // Llegaron datos frescos: lo confirmado ya está dentro y sobra.
    setMovimientos((actual) => actual.filter((m) => !m.confirmado));
  }, [tasks]);

  const registrar = useCallback((movimiento: Omit<MovimientoOptimista, 'confirmado'>) => {
    setMovimientos((actual) => [
      ...actual.filter((m) => m.taskId !== movimiento.taskId),
      { ...movimiento, confirmado: false },
    ]);
  }, []);

  const confirmar = useCallback((taskId: string) => {
    setMovimientos((actual) =>
      actual.map((m) => (m.taskId === taskId ? { ...m, confirmado: true } : m)),
    );
  }, []);

  const revertir = useCallback((taskId: string) => {
    setMovimientos((actual) => actual.filter((m) => m.taskId !== taskId));
  }, []);

  return { movimientos, registrar, confirmar, revertir };
}
