'use client';

import { removeMemberAction } from '@/app/(private)/[id]/actions';
import { MEMBER_INITIAL_STATE } from '@/lib/action-state';
import { Button, Dialog, alpha, colors, useAccion } from '@praxis/commons';
import { useEffect, useState } from 'react';

export interface RemoveMemberButtonProps {
  projectId: string;
  userId: string;
  /** Nombre o correo, para que la confirmación diga a quién. */
  label: string;
}

export function RemoveMemberButton({ projectId, userId, label }: RemoveMemberButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useAccion(removeMemberAction, MEMBER_INITIAL_STATE);

  useEffect(() => {
    if (state.done) setOpen(false);
  }, [state]);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Quitar
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Quitar del proyecto"
        description={`${label} dejará de tener acceso. Puedes volver a añadirla cuando quieras.`}
      >
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="userId" value={userId} />

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
            <Button type="submit" variant="danger" isLoading={pending}>
              Quitar
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
