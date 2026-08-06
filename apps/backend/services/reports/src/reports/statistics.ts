/**
 * La matemática de los reportes, sin dependencias de Nest ni de la base.
 *
 * Está en funciones puras a propósito: es la única parte de la sección que se
 * puede razonar y comprobar de un vistazo, y mezclarla con el acceso a datos la
 * volvería imposible de mirar.
 */

/**
 * Percentil por interpolación lineal.
 *
 * ⚠️ **No se usa la media en ningún reporte de tiempos.** La distribución de un
 * tiempo de ciclo tiene cola larga —unas pocas tareas que se eternizan—, y la
 * media se va detrás de esa cola: acaba diciendo un número que no describe ni el
 * caso típico ni el malo. La mediana y el percentil 85 sí.
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;

  const ordenados = [...values].sort((a, b) => a - b);
  if (ordenados.length === 1) return ordenados[0];

  const posicion = (ordenados.length - 1) * p;
  const abajo = Math.floor(posicion);
  const arriba = Math.ceil(posicion);

  if (abajo === arriba) return ordenados[abajo];
  return ordenados[abajo] + (ordenados[arriba] - ordenados[abajo]) * (posicion - abajo);
}

/**
 * Mínimos para que una predicción no sea ruido con aspecto de dato.
 *
 * Son la regla más importante de toda la sección: por debajo de esto **no se
 * dibuja nada**, se dice cuánto falta. Una predicción sacada de cuatro tareas
 * parece igual de seria que una sacada de cuatrocientas, y esa es exactamente la
 * forma en que una herramienta así pierde la confianza de quien la usa.
 */
export const MIN_TAREAS_CERRADAS = 10;
export const MIN_DIAS_HISTORIAL = 14;

export interface Suficiencia {
  suficiente: boolean;
  tareasCerradas: number;
  faltanTareas: number;
  diasDeHistorial: number;
  faltanDias: number;
}

export function evaluarSuficiencia(tareasCerradas: number, diasDeHistorial: number): Suficiencia {
  return {
    suficiente: tareasCerradas >= MIN_TAREAS_CERRADAS && diasDeHistorial >= MIN_DIAS_HISTORIAL,
    tareasCerradas,
    faltanTareas: Math.max(0, MIN_TAREAS_CERRADAS - tareasCerradas),
    diasDeHistorial,
    faltanDias: Math.max(0, MIN_DIAS_HISTORIAL - diasDeHistorial),
  };
}

/**
 * Cuántos días quedan para vaciar lo que está abierto, por simulación.
 *
 * **Monte Carlo sobre el throughput observado**, no sobre estimaciones: se
 * remuestrea con reemplazo cuántas tareas se cerraron cada día del historial y
 * se cuenta cuántos días hacen falta para llegar a `pendientes`. Repetido muchas
 * veces, la distribución de resultados **es** la predicción.
 *
 * Se eligió esto en vez de burndown porque no hay ningún campo de esfuerzo en la
 * tarea, y añadirlo habría significado pedirle a alguien que mantenga un número
 * en cada tarjeta —que es justo lo que se deja de hacer a las dos semanas—. Aquí
 * el dato se recoge solo: es el propio flujo del tablero.
 *
 * Devuelve percentiles en días. `p85` es el que se enseña como compromiso: «con
 * el ritmo de las últimas semanas, 85 de cada 100 veces está listo en N días».
 */
export function simularEntrega(params: {
  throughputDiario: number[];
  pendientes: number;
  iteraciones?: number;
}): { p50: number; p85: number; p95: number } | null {
  const { throughputDiario, pendientes, iteraciones = 5000 } = params;

  if (pendientes <= 0) return null;
  if (throughputDiario.length === 0) return null;
  /* Si nunca se cerró nada, no hay ritmo que proyectar y la simulación no
     terminaría jamás. Es un caso real: un tablero recién empezado. */
  if (throughputDiario.every((n) => n === 0)) return null;

  /* Tope de días por simulación. Sin él, un ritmo casi nulo con muchas tareas
     pendientes daría un bucle larguísimo; con él, el resultado se satura y quien
     lo lea entiende que la respuesta es «así no se acaba». */
  const TOPE_DIAS = 365;

  const resultados: number[] = [];

  for (let i = 0; i < iteraciones; i++) {
    let restantes = pendientes;
    let dias = 0;

    while (restantes > 0 && dias < TOPE_DIAS) {
      const muestra = throughputDiario[Math.floor(Math.random() * throughputDiario.length)];
      restantes -= muestra;
      dias++;
    }

    resultados.push(dias);
  }

  return {
    p50: Math.ceil(percentile(resultados, 0.5)!),
    p85: Math.ceil(percentile(resultados, 0.85)!),
    p95: Math.ceil(percentile(resultados, 0.95)!),
  };
}

/**
 * Convierte entradas y salidas por día en el **acumulado** de cada columna.
 *
 * Es lo que hace legible un diagrama de flujo: cada banda es cuántas tareas hay
 * en esa columna ese día, no cuántas se movieron. El saldo se arrastra día a
 * día, y los días sin movimiento heredan el valor del anterior — si no, el
 * gráfico tendría agujeros donde en realidad no pasó nada.
 */
export function acumularFlujo(
  filas: { day: Date; columnId: string | null; entradas: number; salidas: number }[],
  columnIds: string[],
): { day: string; porColumna: Record<string, number> }[] {
  const porDia = new Map<string, Map<string, number>>();

  for (const fila of filas) {
    if (!fila.columnId) continue;
    const dia = new Date(fila.day).toISOString().slice(0, 10);
    if (!porDia.has(dia)) porDia.set(dia, new Map());
    const saldo = porDia.get(dia)!;
    saldo.set(fila.columnId, (saldo.get(fila.columnId) ?? 0) + fila.entradas - fila.salidas);
  }

  const dias = [...porDia.keys()].sort();
  const acumulado: Record<string, number> = Object.fromEntries(columnIds.map((id) => [id, 0]));

  return dias.map((dia) => {
    for (const [columnId, delta] of porDia.get(dia)!) {
      acumulado[columnId] = (acumulado[columnId] ?? 0) + delta;
    }
    return { day: dia, porColumna: { ...acumulado } };
  });
}
