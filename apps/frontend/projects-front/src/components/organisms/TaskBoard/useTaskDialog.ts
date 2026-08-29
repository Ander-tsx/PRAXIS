'use client';

import type { Task } from '@praxis/commons';
import { useCallback, useEffect, useState } from 'react';

/**
 * El ciclo de abrir/cerrar el panel de una tarea, extraído para que las vistas
 * de **Tabla** y **Calendario** lo compartan sin copiar la lógica que
 * `BoardColumns` afinó a mano:
 *
 * - abre por id (también el `openTaskId` que llega en la URL, en cuanto la tarea
 *   aparece en `tasks`);
 * - mientras el panel está abierto, la tarea que pinta se mantiene fresca
 *   —alguien la edita en otra pestaña, o el propio panel la guarda—;
 * - `renderedTask` sobrevive al cierre para dejar terminar la animación de
 *   salida, y también se refresca con el panel cerrado para que los
 *   `defaultValue` del formulario no queden congelados en datos viejos.
 */
export function useTaskDialog(tasks: Task[], openTaskId?: string | null) {
  const [openTask, setOpenTask] = useState<Task | null>(
    () => tasks.find((t) => t.id === openTaskId) ?? null,
  );
  const [renderedTask, setRenderedTask] = useState<Task | null>(openTask);

  const open = useCallback(
    (id: string) => {
      setOpenTask(tasks.find((t) => t.id === id) ?? null);
    },
    [tasks],
  );
  const close = useCallback(() => setOpenTask(null), []);

  useEffect(() => {
    if (openTask) setRenderedTask(openTask);
  }, [openTask]);

  useEffect(() => {
    if (!openTask) return;
    const fresh = tasks.find((t) => t.id === openTask.id);
    if (fresh && fresh !== openTask) setOpenTask(fresh);
    if (!fresh) setOpenTask(null);
  }, [tasks, openTask]);

  useEffect(() => {
    if (openTask || !renderedTask) return;
    const fresh = tasks.find((t) => t.id === renderedTask.id);
    if (fresh && fresh !== renderedTask) setRenderedTask(fresh);
  }, [tasks, openTask, renderedTask]);

  return { openTask, renderedTask, open, close, isOpen: !!openTask };
}
