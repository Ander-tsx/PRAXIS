'use client';

import { createColumnAction } from '@/app/(private)/[id]/actions';
import { COLUMN_INITIAL_STATE } from '@/lib/action-state';
import { COLUMN_NAME_MAX } from '@/lib/validation';
import { alpha, colors, useAccion } from '@praxis/commons';
import { useEffect, useRef, useState } from 'react';

export interface AddColumnCardProps {
  boardId: string;
  projectId: string;
  /** El backend exige `order`; la nueva va al final. */
  nextOrder: number;
}

/**
 * Última tarjeta de la tira: añade una columna.
 *
 * Se escribe en línea, sin diálogo: es un solo campo y se crean varias
 * seguidas, así que abrir y cerrar una ventana por cada una sería más ceremonia
 * que trabajo. Tras guardar, el campo se vacía y mantiene el foco.
 *
 * Tiene el mismo ancho que una columna para que la tira no se descuadre.
 */
export function AddColumnCard({ boardId, projectId, nextOrder }: AddColumnCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [state, formAction, pending] = useAccion(createColumnAction, COLUMN_INITIAL_STATE);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (state.savedName) {
      setName('');
      inputRef.current?.focus();
    }
  }, [state]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex w-72 shrink-0 items-center gap-2 rounded-2xl px-4 py-4 text-left font-sans text-sm text-text-secondary transition-all duration-200 ease-out hover:bg-surface hover:text-text-primary"
        style={{ background: alpha(colors.surface, 55) }}
      >
        <span
          className="flex h-6 w-6 items-center justify-center rounded-lg font-sans text-base leading-none"
          style={{ background: alpha(colors.primary, 15), color: colors.primary }}
          aria-hidden="true"
        >
          +
        </span>
        Nueva columna
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex w-72 shrink-0 flex-col gap-2 rounded-2xl bg-surface p-4"
    >
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="order" value={nextOrder} />

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
        className="h-9 rounded-lg border border-border bg-surface-elevated px-3 font-sans text-sm text-text-primary outline-none placeholder:text-text-disabled focus:border-primary"
      />

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!name.trim() || pending}
          className="rounded-lg px-3 py-1.5 font-sans text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
          style={{ background: colors.primary }}
        >
          {pending ? 'Añadiendo…' : 'Añadir'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="font-sans text-xs text-text-secondary transition-colors hover:text-text-primary"
        >
          Cancelar
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
