'use client';

import { Button, Input, alpha, colors } from '@praxis/commons';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { createProjectAction } from '@/app/actions';
import { CREATE_PROJECT_INITIAL_STATE } from '@/lib/action-state';
import { PROJECT_DESCRIPTION_MAX, PROJECT_NAME_MAX, validateProject } from '@/lib/validation';

export interface CreateProjectDialogProps {
  /** Texto del disparador. El estado vacío quiere uno más explícito. */
  triggerLabel?: string;
  triggerVariant?: 'primary' | 'secondary';
  /** `md` cabe en la cabecera; `lg` es para el estado vacío, donde es el foco. */
  triggerSize?: 'md' | 'lg';
}

/**
 * Crear proyecto: disparador + diálogo.
 *
 * La escritura la hace `createProjectAction` (Server Action), que es quien
 * habla con el gateway. Aquí solo vive el estado de la interfaz y la
 * validación previa — que hacemos **siempre**, porque el gateway no valida
 * este endpoint (PENDIENTES-BACKEND.md §2).
 */
export function CreateProjectDialog({
  triggerLabel = 'Nuevo proyecto',
  triggerVariant = 'primary',
  triggerSize = 'md',
}: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createProjectAction,
    CREATE_PROJECT_INITIAL_STATE,
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  /** Solo enseñamos el error de validación cuando ya intentó enviar. */
  const [touched, setTouched] = useState(false);

  const nameId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const clientError = validateProject({ name, description });

  // Cerramos solo cuando la acción confirma que el proyecto existe de verdad.
  useEffect(() => {
    if (state.createdName) {
      setOpen(false);
      setName('');
      setDescription('');
      setTouched(false);
    }
  }, [state.createdName]);

  /**
   * `<dialog>` nativo abierto con `showModal()`: el navegador nos da atrapado
   * de foco, cierre con Escape y fondo inerte. Escribirlo a mano con un `div`
   * significaba reimplementar las tres cosas — y el foco se nos escapaba del
   * diálogo con el tabulador.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: el equivalente de teclado es Escape, que el <dialog> nativo gestiona y nos llega por onClose */}
      <dialog
        ref={dialogRef}
        aria-labelledby={`${nameId}-title`}
        /** Escape y el cierre nativo también tienen que actualizar el estado. */
        onClose={() => setOpen(false)}
        /**
         * Con `showModal()` el fondo es el `::backdrop` del propio dialog, así
         * que un clic fuera de la tarjeta llega aquí con `target === dialog`.
         */
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        className="m-auto w-full max-w-lg rounded-2xl border border-border bg-surface p-6 text-left text-text-primary backdrop:bg-overlay/75 backdrop:backdrop-blur-sm"
        style={{ boxShadow: `0 24px 64px ${alpha(colors.overlay, 70)}` }}
      >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h3 id={`${nameId}-title`} className="font-display text-2xl text-text-primary">
                  Nuevo proyecto
                </h3>
                <p className="font-sans text-sm text-text-secondary">
                  Después podrás crear roles, invitar a tu equipo y abrir espacios de trabajo.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="shrink-0 rounded-md p-1 text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form
              action={formAction}
              /**
               * `noValidate` a propósito: la validación nativa del navegador
               * corta el submit **antes** de que se ejecute este `onSubmit`, así
               * que el formulario se quedaba mudo — sin `setTouched`, sin
               * mensaje. La validación es nuestra y el mensaje también.
               */
              noValidate
              onSubmit={(event) => {
                setTouched(true);
                if (clientError) event.preventDefault();
              }}
              className="flex flex-col gap-4"
            >
              <Input
                id={nameId}
                name="name"
                label="Nombre"
                placeholder="Rediseño del portal"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={PROJECT_NAME_MAX}
                variant={touched && clientError ? 'error' : 'default'}
                message={touched && clientError ? clientError : undefined}
                autoComplete="off"
                fullWidth
              />

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={descriptionId}
                  className="font-sans text-sm font-medium text-text-primary"
                >
                  Descripción <span className="text-text-disabled">(opcional)</span>
                </label>
                <textarea
                  id={descriptionId}
                  name="description"
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={PROJECT_DESCRIPTION_MAX}
                  placeholder="En qué consiste y qué se espera conseguir."
                  className="w-full resize-none rounded-lg border border-border bg-surface-elevated px-3 py-2 font-sans text-sm text-text-primary outline-none transition-all duration-150 placeholder:text-text-disabled hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <span className="self-end font-sans text-xs text-text-disabled">
                  {description.length}/{PROJECT_DESCRIPTION_MAX}
                </span>
              </div>

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

              <div className="mt-1 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" isLoading={pending} disabled={touched && Boolean(clientError)}>
                  Crear proyecto
                </Button>
              </div>
            </form>
      </dialog>
    </>
  );
}
