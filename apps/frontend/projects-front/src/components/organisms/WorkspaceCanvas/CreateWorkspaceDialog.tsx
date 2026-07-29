'use client';

import { Button, Dialog, Input, alpha, colors } from '@praxis/commons';
import { useActionState, useEffect, useId, useState } from 'react';
import { createWorkspaceAction } from '@/app/[id]/actions';
import { WORKSPACE_INITIAL_STATE } from '@/lib/action-state';
import { WORKSPACE_NAME_MAX, validateWorkspace } from '@/lib/validation';

export function CreateWorkspaceDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createWorkspaceAction,
    WORKSPACE_INITIAL_STATE,
  );

  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const nameId = useId();

  const clientError = validateWorkspace(name);

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
        Nuevo espacio
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Nuevo espacio de trabajo"
        description="Un contenedor de tableros dentro del proyecto."
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
          <input type="hidden" name="projectId" value={projectId} />

          <Input
            id={nameId}
            name="name"
            label="Nombre"
            placeholder="Desarrollo"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={WORKSPACE_NAME_MAX}
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
              Crear espacio
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
