'use client';

import { Button, Dialog, Input, alpha, colors } from '@praxis/commons';
import { useActionState, useEffect, useId, useState } from 'react';
import { createBoardAction } from '@/app/(private)/[id]/actions';
import { BOARD_INITIAL_STATE } from '@/lib/action-state';
import { BOARD_NAME_MAX, validateBoard } from '@/lib/validation';

export interface CreateBoardButtonProps {
  workspaceId: string;
  /** Hace falta para revalidar el detalle, que es de donde cuelga el lienzo. */
  projectId: string;
}

/** Añade un tablero dentro del espacio abierto. */
export function CreateBoardButton({ workspaceId, projectId }: CreateBoardButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createBoardAction, BOARD_INITIAL_STATE);

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
  }, [state.savedName]);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Nuevo tablero
      </Button>

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
