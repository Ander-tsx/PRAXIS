'use client';

import { Button, Dialog, Input, Textarea, alpha, colors } from '@praxis/commons';
import { useActionState, useEffect, useId, useState } from 'react';
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
 * Crear proyecto: disparador + formulario dentro del `Dialog` de commons.
 *
 * La escritura la hace `createProjectAction` (Server Action). Aquí solo vive el
 * estado de la interfaz y la validación previa — que seguimos haciendo aunque
 * el gateway ya valide: el mensaje llega antes y sin ida y vuelta.
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

  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo proyecto"
        description="Nace contigo dentro y con un rol de administrador listo para repartir."
      >
        <form
          action={formAction}
          /**
           * `noValidate` a propósito: la validación nativa del navegador corta
           * el submit **antes** de este `onSubmit`, y el formulario se quedaba
           * mudo — sin marcar el campo y sin mensaje.
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

          <Textarea
            id={descriptionId}
            name="description"
            label="Descripción"
            optional
            placeholder="En qué consiste y qué se espera conseguir."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={PROJECT_DESCRIPTION_MAX}
            showCount
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

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={pending} disabled={touched && Boolean(clientError)}>
              Crear proyecto
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
