'use client';

import {
  type Board,
  Dialog,
  PRIORITY_LABELS,
  type Paginated,
  type Sprint,
  type Task,
  createApiClient,
} from '@praxis/commons';
import { useEffect, useMemo, useState } from 'react';
import { rangoDeFechas } from './scrum';

const api = createApiClient({ gatewayPath: '/api/gateway' });

/** Un sprint cerrado no pasa de unos cientos de tareas; el tope del gateway es 1000. */
const LIMITE = 1000;

/** «12 oct»: la misma forma abreviada de los selectores de fecha. */
function diaCorto(iso: string): string {
  return new Date(iso)
    .toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
    .replace('.', '');
}

/**
 * Las tareas de un sprint **cerrado**, de solo lectura.
 *
 * Al cerrar, lo terminado se queda en el sprint y desaparece del tablero (D6 de
 * `docs/PLAN-SCRUM-KANBAN.md`), y ni el Kanban, ni la Tabla ni el Calendario cargan
 * sprints cerrados: sin esto solo quedaba el resumen del cierre, sin una sola tarea.
 *
 * Se piden **al abrir**, no con la página: un tablero con meses de historial no debe
 * cargarlas todas en cada visita. `sprintId` es el mismo filtro que usa el Kanban.
 */
export function TareasDeSprint({
  sprint,
  board,
  onCerrar,
}: {
  /** El sprint a mostrar, o `null` con el diálogo cerrado. */
  sprint: Sprint | null;
  board: Board;
  onCerrar: () => void;
}) {
  const [tareas, setTareas] = useState<Task[] | null>(null);
  const [error, setError] = useState(false);
  const id = sprint?.id ?? null;

  useEffect(() => {
    if (!id) return;
    let vigente = true;
    setTareas(null);
    setError(false);
    api
      .get<Paginated<Task>>(`/boards/${board.id}/tasks?sprintId=${id}&limit=${LIMITE}`)
      .then((page) => {
        if (vigente) setTareas(page.items);
      })
      .catch(() => {
        if (vigente) setError(true);
      });
    return () => {
      vigente = false;
    };
  }, [id, board.id]);

  const columnas = useMemo(() => new Map(board.columns.map((c) => [c.id, c.name])), [board]);
  const hechas = tareas?.filter((t) => t.completedAt) ?? [];
  const otras = tareas?.filter((t) => !t.completedAt) ?? [];

  return (
    <Dialog
      tone="dark"
      open={sprint !== null}
      onClose={onCerrar}
      title={sprint ? `Tareas de ${sprint.name}` : 'Tareas del sprint'}
      description={sprint ? rangoDeFechas(sprint) : undefined}
      size="lg"
    >
      {error ? (
        <p role="alert" className="font-sans text-sm text-error">
          No se pudieron cargar las tareas de este sprint.
        </p>
      ) : tareas === null ? (
        <p className="font-sans text-sm text-text-secondary">Cargando…</p>
      ) : tareas.length === 0 ? (
        <p className="font-sans text-sm text-text-secondary">
          Este sprint no conserva tareas: las que no se terminaron pasaron al siguiente o al
          backlog.
        </p>
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto">
          <Grupo titulo="Terminadas" tareas={hechas} columnas={columnas} />
          <Grupo titulo="Sin terminar" tareas={otras} columnas={columnas} />
        </div>
      )}
    </Dialog>
  );
}

function Grupo({
  titulo,
  tareas,
  columnas,
}: {
  titulo: string;
  tareas: Task[];
  columnas: Map<string, string>;
}) {
  if (tareas.length === 0) return null;
  return (
    <section className="flex flex-col">
      <h4 className="font-sans text-xs uppercase tracking-wide text-text-secondary">
        {titulo} <span className="tabular-nums">· {tareas.length}</span>
      </h4>
      <ul className="flex flex-col">
        {tareas.map((t) => (
          <li
            key={t.id}
            className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1 truncate font-sans text-sm text-text-primary">
              {t.title}
            </span>
            <span className="shrink-0 font-sans text-xs tabular-nums text-text-secondary">
              {[
                columnas.get(t.columnId),
                PRIORITY_LABELS[t.priority],
                t.estimatePoints !== null && `${t.estimatePoints} pt`,
                t.completedAt && diaCorto(t.completedAt),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
