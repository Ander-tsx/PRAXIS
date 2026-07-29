'use client';

import { alpha, colors } from '@praxis/commons';
import { useActionState, useEffect, useRef, useState } from 'react';
import { createColumnAction } from '@/app/[id]/actions';
import { COLUMN_INITIAL_STATE } from '@/lib/action-state';
import { COLUMN_NAME_MAX } from '@/lib/validation';

export interface AddColumnButtonProps {
  boardId: string;
  projectId: string;
  /** El backend exige `order`; va al final de las que ya hay. */
  nextOrder: number;
}

/**
 * Añade una columna escribiendo el nombre en línea.
 *
 * Sin diálogo modal: es un solo campo y se van a crear varias seguidas, así que
 * abrir y cerrar una ventana por cada una sería más ceremonia que trabajo. Tras
 * guardar, el campo se vacía y mantiene el foco para encadenar la siguiente.
 */
export function AddColumnButton({ boardId, projectId, nextOrder }: AddColumnButtonProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [state, formAction, pending] = useActionState(createColumnAction, COLUMN_INITIAL_STATE);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (state.savedName) {
      setName('');
      inputRef.current?.focus();
    }
  }, [state.savedName]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-lg border border-dashed border-border px-3 py-1.5 font-sans text-xs text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
      >
        + Nueva columna
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="order" value={nextOrder} />

      <div className="flex gap-2">
        <input
          ref={inputRef}
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => !name.trim() && setEditing(false)}
          onKeyDown={(event) => event.key === 'Escape' && setEditing(false)}
          maxLength={COLUMN_NAME_MAX}
          placeholder="Por hacer"
          autoComplete="off"
          aria-label="Nombre de la columna"
          className="h-8 w-40 rounded-lg border border-border bg-surface-elevated px-2.5 font-sans text-xs text-text-primary outline-none placeholder:text-text-disabled focus:border-primary"
        />
        <button
          type="submit"
          disabled={!name.trim() || pending}
          className="rounded-lg px-3 font-sans text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
          style={{ background: colors.primary }}
        >
          {pending ? '…' : 'Añadir'}
        </button>
      </div>

      {state.error && (
        <span role="alert" className="font-sans text-xs text-error">
          {state.error}
        </span>
      )}
    </form>
  );
}
