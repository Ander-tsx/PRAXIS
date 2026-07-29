'use client';

import { type Board, type Column, alpha, colors } from '@praxis/commons';
import { useActionState, useEffect, useRef, useState } from 'react';
import { deleteColumnAction, reorderColumnsAction } from '@/app/[id]/actions';
import { COLUMN_INITIAL_STATE } from '@/lib/action-state';
import { AddColumnCard } from './AddColumnCard';

export interface BoardColumnsProps {
  board: Board;
  projectId: string;
  canManage: boolean;
}

/**
 * Columnas de un tablero, arrastrables para reordenar.
 *
 * Usa la API nativa de arrastre del navegador en vez de una librería: mover
 * elementos en **una sola fila** es el caso más simple del problema, y meter
 * una dependencia de drag & drop por esto cargaría el bundle de la zona sin
 * necesidad.
 *
 * El nuevo orden se manda a `PATCH /boards/:id/columns/reorder`, que recibe la
 * lista completa de ids ya ordenada. Mientras tanto se reordena en local para
 * que el arrastre se sienta inmediato.
 */
export function BoardColumns({ board, projectId, canManage }: BoardColumnsProps) {
  const sorted = [...board.columns].sort((a, b) => a.order - b.order);

  const [columns, setColumns] = useState<Column[]>(sorted);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [, reorderAction] = useActionState(reorderColumnsAction, COLUMN_INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  /**
   * El servidor manda: cuando la página revalida, el orden que llega sustituye
   * al local. Sin esto, un fallo al guardar dejaría la pantalla mintiendo.
   */
  useEffect(() => {
    setColumns([...board.columns].sort((a, b) => a.order - b.order));
  }, [board.columns]);

  /**
   * El id que se arrastra se lee del `dataTransfer`, no del estado.
   *
   * Es para lo que existe, y además evita depender de que React haya
   * repintado entre `dragstart` y `drop`: el estado solo gobierna el aspecto.
   */
  function handleDrop(targetId: string, sourceId: string) {
    setOverId(null);
    setDraggingId(null);

    if (!sourceId || sourceId === targetId) return;

    const from = columns.findIndex((column) => column.id === sourceId);
    const to = columns.findIndex((column) => column.id === targetId);
    if (from === -1 || to === -1) return;

    const next = [...columns];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    setColumns(next);

    // El envío va tras el repintado para que el formulario lleve el orden nuevo.
    queueMicrotask(() => formRef.current?.requestSubmit());
  }

  return (
    <>
      <form ref={formRef} action={reorderAction} className="hidden">
        <input type="hidden" name="boardId" value={board.id} />
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="columnIds" value={columns.map((c) => c.id).join(',')} />
      </form>

      <div className="scrollbar-none -mx-1 flex items-start gap-4 overflow-x-auto px-1 pb-2">
        {columns.map((column, index) => {
          const isDragging = column.id === draggingId;
          const isOver = column.id === overId && !isDragging;

          return (
            <div
              key={column.id}
              draggable={canManage}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', column.id);
                event.dataTransfer.effectAllowed = 'move';
                setDraggingId(column.id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setOverId(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setOverId(column.id);
              }}
              onDragLeave={() => setOverId((prev) => (prev === column.id ? null : prev))}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(column.id, event.dataTransfer.getData('text/plain'));
              }}
              className={[
                'flex w-72 shrink-0 flex-col rounded-2xl bg-surface transition-all duration-150',
                canManage ? 'cursor-grab active:cursor-grabbing' : '',
                isDragging ? 'opacity-40' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                /* La señal de destino es un borde sólido a la izquierda, no un
                   contorno punteado alrededor. */
                boxShadow: isOver
                  ? `inset 4px 0 0 ${colors.primary}, 0 8px 24px ${alpha(colors.overlay, 40)}`
                  : `0 1px 0 ${alpha(colors.border, 50)}`,
              }}
            >
              <header className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: COLUMN_TINTS[index % COLUMN_TINTS.length] }}
                  />
                  <h5 className="truncate font-sans text-sm font-semibold text-text-primary">
                    {column.name}
                  </h5>
                </span>

                <span className="flex shrink-0 items-center gap-1">
                  <span
                    className="rounded-full px-2 py-0.5 font-sans text-[11px] tabular-nums text-text-secondary"
                    style={{ background: alpha(colors.border, 60) }}
                  >
                    0
                  </span>
                  {canManage && (
                    <DeleteColumn
                      boardId={board.id}
                      columnId={column.id}
                      columnName={column.name}
                      projectId={projectId}
                    />
                  )}
                </span>
              </header>

              {/* Hueco de tarjetas. Sin tareas todavía, se dice en vez de fingirlas. */}
              <div className="flex min-h-40 flex-col justify-center gap-2 px-4 pb-4">
                <div
                  className="flex flex-1 items-center justify-center rounded-xl py-8"
                  style={{ background: alpha(colors.background, 50) }}
                >
                  <span className="font-sans text-xs text-text-disabled">Tareas: pronto</span>
                </div>
              </div>

              {canManage && (
                <footer className="px-4 pb-4">
                  <span className="font-sans text-[11px] text-text-disabled">
                    Arrastra para reordenar
                  </span>
                </footer>
              )}
            </div>
          );
        })}

        {canManage && (
          <AddColumnCard boardId={board.id} projectId={projectId} nextOrder={columns.length} />
        )}
      </div>
    </>
  );
}

/** Un color por posición: ayuda a distinguir columnas de un vistazo. */
const COLUMN_TINTS = [colors.primary, colors.accent, colors.info, colors.success, colors.warning];

function DeleteColumn({
  boardId,
  columnId,
  columnName,
  projectId,
}: {
  boardId: string;
  columnId: string;
  columnName: string;
  projectId: string;
}) {
  const [state, formAction, pending] = useActionState(deleteColumnAction, COLUMN_INITIAL_STATE);

  return (
    <form action={formAction}>
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="columnId" value={columnId} />
      <input type="hidden" name="projectId" value={projectId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Eliminar la columna ${columnName}`}
        title={state.error ?? `Eliminar «${columnName}»`}
        className="rounded p-1 text-text-disabled transition-colors hover:text-error disabled:opacity-40"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </form>
  );
}
