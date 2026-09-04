'use client';

import { createBoardAction } from '@/app/(privado)/projects/[id]/actions';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { BOARD_INITIAL_STATE } from '@/lib/projects/action-state';
import { BOARD_NAME_MAX, validateBoard } from '@/lib/projects/validation';
import { Button, Dialog, Input, alpha, colors, useAccion } from '@praxis/commons';
import { useEffect, useId, useRef, useState } from 'react';

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
              ? 'flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
              : 'flex items-center gap-2 rounded-lg border border-white/10 bg-[#191919] px-4 py-2 font-sans text-sm text-white transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white'
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
            if (clientError || name.trim().length < 2) event.preventDefault();
          }}
          className="flex h-9 items-center gap-1 rounded-xl border border-white/10 bg-[#191919] pl-3 pr-1.5 transition-colors focus-within:border-primary"
        >
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="projectId" value={projectId} />

          <input
            id={nameId}
            name="name"
            placeholder="Nombre del tablero…"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={BOARD_NAME_MAX}
            autoComplete="off"
            autoFocus
            className={`w-40 bg-transparent text-sm font-medium outline-none placeholder:font-normal placeholder:text-white ${
              touched && clientError ? 'text-error' : 'text-white'
            }`}
          />
          <button
            type="submit"
            disabled={pending || name.trim().length < 2 || Boolean(clientError)}
            aria-label="Crear tablero"
            title="Crear"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
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
            aria-label="Cancelar"
            title="Cancelar"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
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
