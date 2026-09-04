'use client';

import { leaveProjectAction } from '@/app/projects/[id]/actions';
import { MEMBER_INITIAL_STATE } from '@/lib/projects/action-state';
import { Button, Dialog, useAccion } from '@praxis/commons';
import { useState } from 'react';

export interface LeaveProjectButtonProps {
  projectId: string;
  projectName: string;
}

/**
 * Salir del proyecto.
 *
 * Solo aparece para quien es miembro y no es el dueño: el dueño perdería su
 * propio proyecto sin forma de recuperarlo, y el backend lo rechaza igualmente.
 *
 * Tras salir, la acción redirige a la lista: esta página deja de ser accesible.
 */
export function LeaveProjectButton({ projectId, projectName }: LeaveProjectButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useAccion(leaveProjectAction, MEMBER_INITIAL_STATE);

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Salir del proyecto
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Salir del proyecto"
        description={`Dejarás de ver «${projectName}» y de tener acceso a su contenido.`}
      >
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="projectId" value={projectId} />

          <p className="font-sans text-sm text-white/60">
            Quien administre el proyecto tendrá que volver a invitarte si quieres regresar.
          </p>

          {state.error && (
            <p
              role="alert"
              className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 font-sans text-sm text-error"
            >
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" isLoading={pending}>
              Salir
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
