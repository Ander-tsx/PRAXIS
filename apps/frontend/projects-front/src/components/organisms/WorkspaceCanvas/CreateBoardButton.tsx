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
      {compacto ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Nuevo tablero"
          title="Nuevo tablero"
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Nuevo tablero
        </Button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Nuevo tablero"
        description="Dentro irán las columnas y las tareas."
      >
        <form
          action={formAction}
          noValidate
          onSubmit={(event) => {
            setTouched(true);
            if (clientError) event.preventDefault();
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="projectId" value={projectId} />

          <Input
            id={nameId}
            name="name"
            label="Nombre"
            placeholder="Sprint 1"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={BOARD_NAME_MAX}
            variant={touched && clientError ? 'error' : 'default'}
            message={touched && clientError ? clientError : undefined}
            autoComplete="off"
            fullWidth
          />

          {state.error && (
            <p
              role="alert"
              className="rounded-lg border px-3 py-2 font-sans text-sm text-error"
              style={{
                background: alpha(colors.error, 10),
                borderColor: alpha(colors.error, 30),
              }}
            >
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={pending} disabled={touched && Boolean(clientError)}>
              Crear tablero
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
