'use client';

import { Button, Dialog, Input, alpha, colors } from '@praxis/commons';
import { useActionState, useEffect, useId, useState, useTransition } from 'react';
import {
  type ProjectInventory,
  deleteProjectAction,
  projectInventoryAction,
} from '@/app/(private)/[id]/actions';
import { DELETE_PROJECT_INITIAL_STATE } from '@/lib/action-state';

export interface DeleteProjectButtonProps {
  projectId: string;
  projectName: string;
  /** Contadores que el detalle del proyecto ya trae: no cuestan una petición. */
  workspaceCount: number;
  boardCount: number;
  columnCount: number;
  labelCount: number;
  memberCount: number;
  roleCount: number;
}

/** Una línea del inventario. `null` significa «no se pudo contar». */
interface Line {
  count: number | null;
  singular: string;
  plural: string;
}

/**
 * Elimina el proyecto entero.
 *
 * `canDeleteProject` existía y `DELETE /projects/:id` funcionaba, pero **no había
 * forma de borrar un proyecto desde ninguna pantalla**: se podía crear y no
 * deshacer.
 *
 * La confirmación es la parte que importa, y no es un «¿seguro?»:
 *
 * - **Dice cuánto se va, con números reales.** Los contadores del árbol vienen de
 *   la página; las tareas y las invitaciones pendientes se cuentan al abrir el
 *   diálogo, porque contar tareas obliga a una petición por tablero y sería
 *   trabajo tirado en las visitas donde nadie borra nada.
 * - **Hay que escribir el nombre**, como en GitHub y como ya hace
 *   `DeleteWorkspaceButton` cuando el espacio no está vacío. Aquí es **siempre**:
 *   un proyecto nunca está lo bastante vacío como para que preguntar sea
 *   ceremonia.
 * - Y si algo no se pudo contar se dice, en lugar de escribir un cero. En una
 *   confirmación de borrado, decir «0 tareas» cuando son siete es peor que
 *   admitir que no se sabe.
 *
 * La cascada es del backend y no se toca desde aquí: Postgres arrastra espacios →
 * tableros → columnas, y `TaskPurgeService` borra las tareas, que viven en otro
 * microservicio.
 */
export function DeleteProjectButton({
  projectId,
  projectName,
  workspaceCount,
  boardCount,
  columnCount,
  labelCount,
  memberCount,
  roleCount,
}: DeleteProjectButtonProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [inventory, setInventory] = useState<ProjectInventory | null>(null);
  const [counting, startCounting] = useTransition();

  const [state, formAction, pending] = useActionState(
    deleteProjectAction,
    DELETE_PROJECT_INITIAL_STATE,
  );

  const confirmId = useId();
  const canDelete = confirmation.trim() === projectName;

  /**
   * El inventario se pide **al abrir**, no en el render de la página.
   *
   * Se vuelve a pedir en cada apertura a propósito: entre una y otra puede haber
   * pasado cualquier cosa, y un número viejo en esta pantalla es justo el que no
   * se puede permitir.
   */
  useEffect(() => {
    if (!open) return;
    setInventory(null);
    startCounting(async () => {
      setInventory(await projectInventoryAction(projectId));
    });
  }, [open, projectId]);

  const lines: Line[] = [
    { count: workspaceCount, singular: 'espacio', plural: 'espacios' },
    { count: boardCount, singular: 'tablero', plural: 'tableros' },
    { count: columnCount, singular: 'columna', plural: 'columnas' },
    { count: inventory?.tasks ?? null, singular: 'tarea', plural: 'tareas' },
    { count: labelCount, singular: 'etiqueta', plural: 'etiquetas' },
    { count: memberCount, singular: 'persona', plural: 'personas' },
    { count: roleCount, singular: 'rol', plural: 'roles' },
    {
      count: inventory?.pendingInvitations ?? null,
      singular: 'invitación sin responder',
      plural: 'invitaciones sin responder',
    },
  ];

  /* Un cero no aporta nada a la lista: lo que no existe no se puede perder. Lo
     que no se pudo contar (`null`) sí se enseña, con su propia frase. */
  const visible = lines.filter((line) => line.count === null || line.count > 0);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Eliminar proyecto
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Eliminar «${projectName}»`}
        description="Esto no se puede deshacer, y se lleva por delante todo lo que hay dentro."
      >
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="projectId" value={projectId} />

          <div
            className="flex flex-col gap-2 rounded-lg border px-4 py-3"
            style={{
              background: alpha(colors.error, 8),
              borderColor: alpha(colors.error, 30),
            }}
          >
            <p className="font-sans text-sm font-semibold text-text-primary">Se eliminarán:</p>

            {counting && !inventory ? (
              <p className="font-sans text-sm text-text-secondary">Contando lo que hay dentro…</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {visible.map((line) => (
                  <li key={line.plural} className="font-sans text-sm text-text-secondary">
                    {line.count === null ? (
                      <>
                        Sus <strong className="text-text-primary">{line.plural}</strong> — no se
                        pudieron contar
                      </>
                    ) : (
                      <>
                        <strong className="tabular-nums text-text-primary">{line.count}</strong>{' '}
                        {line.count === 1 ? line.singular : line.plural}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Input
            id={confirmId}
            label={`Escribe «${projectName}» para confirmar`}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
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
            <Button type="submit" variant="danger" isLoading={pending} disabled={!canDelete}>
              Eliminar proyecto
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
