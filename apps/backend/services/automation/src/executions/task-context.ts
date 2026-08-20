/**
 * El contexto sobre el que se evalúan las condiciones de una regla.
 *
 * ## Uno solo para las dos familias de disparador
 *
 * Un barrido llega a la tarea recorriendo el inventario; un disparador reactivo
 * llega a ella porque un evento trajo su id. **Acaban en el mismo sitio**, y por
 * eso el contexto se construye una vez y con la misma forma: así una condición
 * como «prioridad es Alta» significa exactamente lo mismo en «va a vencer» que
 * en «la han movido», y añadir un disparador no obliga a inventar campos nuevos.
 *
 * Lo específico de cada disparador —los días parados, la columna de origen de un
 * movimiento— se añade encima con {@link conContexto}.
 *
 * ⚠️ **Las fechas salen como `AAAA-MM-DD`, no como instante.** Es lo que escribe
 * quien rellena una condición, y comparar un `2026-08-20` contra un
 * `2026-08-20T14:31:07.221Z` no da igual nunca. La hora no se pierde por
 * descuido: es que en una fecha de vencimiento no significa nada.
 */

/** La tarea tal y como la sirve `tasks-service`, en lo que aquí se usa. */
export interface TaskShape {
  id: string;
  title: string;
  priority?: string | null;
  dueDate?: string | Date | null;
  columnId?: string | null;
  boardId?: string | null;
  completedAt?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  assignees?: Array<{ userId: string }> | null;
  labels?: Array<{ labelId?: string; label?: { id: string } | null }> | null;
}

export type ConditionContext = Record<string, unknown>;

const soloFecha = (valor: string | Date | null | undefined): string | null => {
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString().slice(0, 10);
};

/** Días enteros transcurridos entre una fecha y ahora. Negativo si está en el futuro. */
export function diasDesde(
  valor: string | Date | null | undefined,
  ahora = new Date(),
): number | null {
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  return Math.floor((ahora.getTime() - fecha.getTime()) / 86_400_000);
}

/** Los ids de etiqueta, vengan como vengan de la relación. */
function etiquetas(task: TaskShape): string[] {
  return (task.labels ?? [])
    .map((relacion) => relacion.label?.id ?? relacion.labelId)
    .filter((id): id is string => typeof id === 'string');
}

/** El contexto común a cualquier disparador de tarea. */
export function contextoDeTarea(task: TaskShape): ConditionContext {
  const encargados = (task.assignees ?? []).map((asignado) => asignado.userId);
  return {
    priority: task.priority ?? null,
    dueDate: soloFecha(task.dueDate),
    columnId: task.columnId ?? null,
    boardId: task.boardId ?? null,
    labelIds: etiquetas(task),
    assigneeIds: encargados,
    assigneeCount: encargados.length,
    title: task.title,
    closed: Boolean(task.completedAt),
  };
}

/** El contexto común más lo que aporta un disparador concreto. */
export function conContexto(task: TaskShape, extra: ConditionContext): ConditionContext {
  return { ...contextoDeTarea(task), ...extra };
}
