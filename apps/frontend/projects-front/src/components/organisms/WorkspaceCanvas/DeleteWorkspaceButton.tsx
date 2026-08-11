'use client';

import { Button, Dialog, Input, type Workspace, alpha, colors } from '@praxis/commons';
import { useActionState, useEffect, useId, useState } from 'react';
import { deleteWorkspaceAction } from '@/app/(private)/[id]/actions';
import { WORKSPACE_INITIAL_STATE } from '@/lib/action-state';

export interface DeleteWorkspaceButtonProps {
  projectId: string;
  workspace: Workspace;
}

/**
 * Elimina un espacio de trabajo.
 *
 * ⚠️ El borrado **cascadea**: `Board` y `BoardColumn` cuelgan del espacio con
 * `onDelete: Cascade`, así que se lleva por delante todos sus tableros y sus
 * columnas sin decir nada. El backend responde 200 tan tranquilo.
 *
 * Por eso, cuando hay tableros dentro se pide **escribir el nombre** para
 * confirmar. Un "¿estás seguro?" se pulsa sin leer; teclear el nombre obliga a
 * mirar qué se está borrando.
 */
export function DeleteWorkspaceButton({ projectId, workspace }: DeleteWorkspaceButtonProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [state, formAction, pending] = useActionState(
    deleteWorkspaceAction,
    WORKSPACE_INITIAL_STATE,
  );

  const confirmId = useId();
  const boardCount = workspace.boards.length;
  const columnCount = workspace.boards.reduce((total, board) => total + board.columns.length, 0);
  const needsTyping = boardCount > 0;
  const canDelete = !needsTyping || confirmation.trim() === workspace.name;

  useEffect(() => {
    if (state.savedName) {
      setOpen(false);
      setConfirmation('');
    }
  }, [state]);

  return (
    <>
      {/* Mismo tamaño que «Nuevo tablero», que va a su lado: con `size="sm"`
          las dos alturas no cuadraban y la fila se veía torcida. */}
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Eliminar espacio
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={`Eliminar «${workspace.name}»`}
        description={
          needsTyping
            ? 'Este espacio no está vacío y el borrado no se puede deshacer.'
            : 'El espacio está vacío. Esta acción no se puede deshacer.'
        }
      >
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="workspaceId" value={workspace.id} />

          {needsTyping && (
            <>
              <p
                className="rounded-lg border px-3 py-2 font-sans text-sm text-warning"
                style={{
                  background: alpha(colors.warning, 10),
                  borderColor: alpha(colors.warning, 30),
                }}
              >
                Se eliminarán también <strong>{boardCount}</strong>{' '}
                {boardCount === 1 ? 'tablero' : 'tableros'}
                {columnCount > 0 && (
                  <>
                    {' '}
                    y sus <strong>{columnCount}</strong>{' '}
                    {columnCount === 1 ? 'columna' : 'columnas'}
                  </>
                )}
                .
              </p>

              <Input
                id={confirmId}
                label={`Escribe «${workspace.name}» para confirmar`}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                fullWidth
              />
            </>
          )}

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
            <Button type="submit" variant="danger" isLoading={pending} disabled={!canDelete}>
              Eliminar espacio
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
