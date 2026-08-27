'use client';

import { deleteRoleAction } from '@/app/(private)/[id]/actions';
import { ROLE_INITIAL_STATE } from '@/lib/action-state';
import { Button, Dialog, type ProjectRole, alpha, colors, useAccion } from '@praxis/commons';
import { useEffect, useState } from 'react';

export interface DeleteRoleFormProps {
  projectId: string;
  role: ProjectRole;
  membersUsing: number;
  onCancel: () => void;
}

export function DeleteRoleForm({ projectId, role, membersUsing, onCancel }: DeleteRoleFormProps) {
  const [state, formAction, pending] = useAccion(deleteRoleAction, ROLE_INITIAL_STATE);

  const blocked = membersUsing > 0;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-error bg-surface-elevated p-6 shadow-md ring-2 ring-error/20">
      <header>
        <h4 className="font-sans text-lg font-semibold text-text-primary">
          Eliminar «{role.name}»
        </h4>
        <p className="font-sans text-xs text-text-secondary mt-1">
          {blocked
            ? 'Este rol está en uso, así que no se puede eliminar todavía.'
            : 'Esta acción no se puede deshacer.'}
        </p>
      </header>

      {blocked ? (
        <div className="flex flex-col gap-4">
          <p className="font-sans text-sm text-text-secondary">
            Lo tienen {membersUsing} {membersUsing === 1 ? 'persona' : 'personas'}. Cámbialas de rol
            antes de eliminarlo.
          </p>
          <div className="flex justify-end gap-3 mt-2">
            <Button variant="secondary" onClick={onCancel}>
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

          <div className="flex justify-end gap-3 mt-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" isLoading={pending}>
              Eliminar rol
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
