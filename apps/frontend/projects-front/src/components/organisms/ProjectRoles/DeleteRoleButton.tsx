'use client';

import { deleteRoleAction } from '@/app/(private)/[id]/actions';
import { ROLE_INITIAL_STATE } from '@/lib/action-state';
import { Button, Dialog, type ProjectRole, alpha, colors, useAccion } from '@praxis/commons';
import { useEffect, useState } from 'react';

export interface DeleteRoleButtonProps {
  projectId: string;
  role: ProjectRole;
  /** Cuántas personas lo tienen asignado. */
  membersUsing: number;
}

/**
 * Eliminar un rol, con confirmación.
 *
 * Si hay personas asignadas se avisa **antes** en vez de dejar que el backend
 * falle por la restricción de clave ajena: el mensaje de base de datos no le
 * dice nada a quien está repartiendo permisos.
 */
export function DeleteRoleButton({ projectId, role, membersUsing }: DeleteRoleButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useAccion(deleteRoleAction, ROLE_INITIAL_STATE);

  const blocked = membersUsing > 0;

  useEffect(() => {
    if (state.savedName) setOpen(false);
  }, [state]);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Eliminar
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={`Eliminar «${role.name}»`}
        description={
          blocked
            ? 'Este rol está en uso, así que no se puede eliminar todavía.'
            : 'Esta acción no se puede deshacer.'
        }
      >
        {blocked ? (
          <div className="flex flex-col gap-4">
            <p className="font-sans text-sm text-text-secondary">
              Lo tienen {membersUsing} {membersUsing === 1 ? 'persona' : 'personas'}. Cámbialas de
              rol antes de eliminarlo.
            </p>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Entendido
              </Button>
            </div>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="roleId" value={role.id} />

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
                Eliminar rol
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
