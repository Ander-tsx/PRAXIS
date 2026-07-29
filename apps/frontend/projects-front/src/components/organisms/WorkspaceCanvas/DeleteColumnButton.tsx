'use client';

import { useActionState } from 'react';
import { deleteColumnAction } from '@/app/[id]/actions';
import { COLUMN_INITIAL_STATE } from '@/lib/action-state';

export interface DeleteColumnButtonProps {
  boardId: string;
  columnId: string;
  columnName: string;
  projectId: string;
}

/**
 * Elimina una columna.
 *
 * Sin confirmación a propósito: una columna vacía es barata de rehacer y pedir
 * confirmación en cada una haría insufrible montar un tablero. El día que las
 * columnas contengan tareas habrá que avisar de lo que se lleva por delante.
 */
export function DeleteColumnButton({
  boardId,
  columnId,
  columnName,
  projectId,
}: DeleteColumnButtonProps) {
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
        className="shrink-0 rounded p-1 text-text-disabled transition-colors hover:text-error disabled:opacity-40"
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
