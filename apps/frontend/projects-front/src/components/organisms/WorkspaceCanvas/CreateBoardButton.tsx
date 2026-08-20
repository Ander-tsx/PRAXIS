'use client';

import { createBoardAction } from '@/app/(private)/[id]/actions';
import { BOARD_INITIAL_STATE } from '@/lib/action-state';
import { BOARD_NAME_MAX, validateBoard } from '@/lib/validation';
import { Button, Dialog, Input, alpha, colors, useAccion } from '@praxis/commons';
import { useEffect, useId, useState } from 'react';

export interface CreateBoardButtonProps {
  workspaceId: string;
  /** Hace falta para revalidar el detalle, que es de donde cuelga el lienzo. */
  projectId: string;
  /**
   * Un «+» al final de las pestañas de tablero, en vez de un botón con texto.
   *
   * Se usa dentro de la barra del tablero, donde el botón entero robaba ancho a
   * los nombres de los tableros —que es lo que de verdad hay que leer ahí— para
   * una acción que se usa una vez cada muchas semanas. El texto no se pierde: va
   * en el `title` y en el `aria-label`.
   */
  compacto?: boolean;
}

/** Añade un tablero dentro del espacio abierto. */
export function CreateBoardButton({
  workspaceId,
  projectId,
  compacto = false,
}: CreateBoardButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useAccion(createBoardAction, BOARD_INITIAL_STATE);

  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const nameId = useId();

  const clientError = validateBoard(name);

  useEffect(() => {
    if (state.savedName) {
      setOpen(false);
      setName('');
      setTouched(false);
    }
  }, [state]);

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Nuevo tablero"
          title="Nuevo tablero"
          className={
            compacto
              ? 'flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
              : 'flex items-center gap-2 rounded-lg bg-surface px-4 py-2 font-sans text-sm text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary'
          }
        >
          <svg
            className={compacto ? 'h-4 w-4' : 'h-4 w-4 shrink-0'}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {!compacto && 'Nuevo tablero'}
        </button>
      ) : (
        <form
          action={formAction}
          noValidate
          onSubmit={(event) => {
            setTouched(true);
            if (clientError) event.preventDefault();
          }}
          className="flex items-center gap-2 rounded-lg bg-surface-elevated px-2 py-1 shadow-sm ring-1 ring-border"
        >
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="projectId" value={projectId} />

          <input
            id={nameId}
            name="name"
            placeholder="Nombre del tablero..."
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={BOARD_NAME_MAX}
            autoComplete="off"
            autoFocus
            className={`w-32 bg-transparent text-sm outline-none placeholder:text-text-disabled ${
              touched && clientError ? 'text-error' : 'text-text-primary'
            }`}
          />
          <button
            type="submit"
            disabled={pending || (touched && Boolean(clientError))}
            className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setName('');
              setTouched(false);
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-surface hover:text-text-primary"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </form>
      )}
    </>
  );
}
