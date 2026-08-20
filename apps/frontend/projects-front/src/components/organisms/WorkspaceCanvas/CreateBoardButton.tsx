'use client';

import { createBoardAction } from '@/app/(private)/[id]/actions';
import { BOARD_INITIAL_STATE } from '@/lib/action-state';
import { BOARD_NAME_MAX, validateBoard } from '@/lib/validation';
import { Button, Dialog, Input, alpha, colors, useAccion } from '@praxis/commons';
import { useMediaQuery } from '@/hooks/useMediaQuery';
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
  const isDesktop = useMediaQuery('(min-width: 640px)');
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useAccion(createBoardAction, BOARD_INITIAL_STATE);

  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const nameId = useId();
  const clientError = validateBoard(name);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.savedName) {
      setOpen(false);
      setName('');
      setTouched(false);
    }
  }, [state]);

  useEffect(() => {
    if (!open || !isDesktop) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        setName('');
        setTouched(false);
      }
    }

    function handleClickOutside(event: MouseEvent) {
      if (formRef.current && !formRef.current.contains(event.target as Node)) {
        setOpen(false);
        setName('');
        setTouched(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, isDesktop]);

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
      ) : isDesktop ? (
          <form
            ref={formRef}
            action={formAction}
            noValidate
            onSubmit={(event) => {
              setTouched(true);
              if (clientError) event.preventDefault();
            }}
            className="flex items-center gap-1.5 rounded-full bg-surface pl-3 pr-1 py-1 shadow-sm border border-border transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary"
          >
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="projectId" value={projectId} />

            <input
              id={nameId}
              name="name"
              placeholder="Nuevo tablero..."
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={BOARD_NAME_MAX}
              autoComplete="off"
              autoFocus
              className={`w-36 bg-transparent text-sm font-medium outline-none placeholder:text-text-disabled placeholder:font-normal ${
                touched && clientError ? 'text-error' : 'text-text-primary'
              }`}
            />
            <button
              type="submit"
              disabled={pending || (touched && Boolean(clientError))}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-text-inverse hover:bg-primary-hover disabled:opacity-50 transition-colors"
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
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </form>
        ) : (
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
        )}
    </>
  );
}
