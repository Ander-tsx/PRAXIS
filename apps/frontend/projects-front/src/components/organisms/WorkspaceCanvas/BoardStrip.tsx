import { type Board, alpha, colors } from '@praxis/commons';
import { AddColumnButton } from './AddColumnButton';
import { DeleteColumnButton } from './DeleteColumnButton';

export interface BoardStripProps {
  board: Board;
  projectId: string;
  canManage: boolean;
}

/**
 * Un tablero con sus columnas en una tira horizontal.
 *
 * Las columnas **desplazan en horizontal** dentro del tablero: pueden ser
 * muchas y no deben empujar el ancho de la página ni apilarse en vertical, que
 * es justo lo que un tablero no es.
 *
 * Todavía no hay tareas dentro de cada columna —esa pantalla no existe—, así
 * que la columna enseña su nombre y deja el hueco preparado. Fingir tarjetas
 * de tarea aquí sería prometer algo que no hay.
 */
export function BoardStrip({ board, projectId, canManage }: BoardStripProps) {
  const columns = [...board.columns].sort((a, b) => a.order - b.order);

  return (
    <section
      aria-label={`Tablero ${board.name}`}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h4 className="font-sans text-base font-semibold text-text-primary">{board.name}</h4>
          <span className="font-sans text-xs text-text-disabled">
            {columns.length === 0
              ? 'sin columnas'
              : `${columns.length} ${columns.length === 1 ? 'columna' : 'columnas'}`}
          </span>
        </div>

        {canManage && <AddColumnButton boardId={board.id} projectId={projectId} nextOrder={columns.length} />}
      </header>

      {columns.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center font-sans text-sm text-text-disabled">
          Un tablero se organiza en columnas: «Por hacer», «En curso», «Hecho»…
          {canManage && ' Añade la primera.'}
        </p>
      ) : (
        <div className="scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {columns.map((column) => (
            <div
              key={column.id}
              className="flex w-56 shrink-0 flex-col gap-2 rounded-xl p-3"
              style={{ background: alpha(colors.background, 60) }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-sans text-sm font-medium text-text-primary">
                  {column.name}
                </span>
                {canManage && (
                  <DeleteColumnButton
                    boardId={board.id}
                    columnId={column.id}
                    columnName={column.name}
                    projectId={projectId}
                  />
                )}
              </div>

              {/* Hueco de tareas. Sin tareas todavía, se deja explícito. */}
              <div
                className="flex min-h-24 items-center justify-center rounded-lg border border-dashed"
                style={{ borderColor: alpha(colors.border, 70) }}
              >
                <span className="font-sans text-xs text-text-disabled">Tareas: pronto</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
