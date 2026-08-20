'use client';

import {
  addChecklistItemAction,
  deleteChecklistItemAction,
  toggleChecklistItemAction,
} from '@/app/(private)/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/action-state';
import {
  Input,
  ProgressBar,
  type Task,
  alpha,
  checklistProgress,
  colors,
  useAccion,
} from '@praxis/commons';
import { useEffect, useRef } from 'react';

export interface TaskChecklistProps {
  projectId: string;
  task: Task;
  /** Añadir y borrar pasos: `canEditTask`. Es definir la tarea. */
  canEdit: boolean;
  /**
   * Marcar y desmarcar: `canMoveTask`. Es ejecutarla.
   *
   * Quien puede arrastrar la tarjeta a «Hecho» tiene que poder ir marcando los
   * pasos por el camino; con `canEditTask` para todo, esa persona se quedaba con
   * un checklist de solo lectura sobre su propia tarea.
   */
  canToggle: boolean;
}

/**
 * Checklist de una tarea.
 *
 * Va **fuera** del formulario de la tarea, no dentro: cada ítem tiene su propia
 * acción de servidor y un `<form>` anidado en otro no es HTML válido —el
 * navegador se come el interior y los botones acaban enviando el formulario de
 * fuera, guardando la tarea cuando solo querías marcar un ítem.
 *
 * Cada ítem es su propio formulario por el mismo motivo, y porque así el
 * `pending` de cada uno es suyo: con una sola acción compartida, marcar un ítem
 * dejaba en estado de espera a toda la lista.
 */
export function TaskChecklist({ projectId, task, canEdit, canToggle }: TaskChecklistProps) {
  const { done, total } = checklistProgress(task);
  const [addState, addAction, adding] = useAccion(addChecklistItemAction, TASK_INITIAL_STATE);
  const addFormRef = useRef<HTMLFormElement>(null);

  /**
   * Vacía el campo cuando el servidor confirma, no al enviar.
   *
   * Al revés se perdería lo escrito si la petición falla, que es justo cuando
   * más molesta volver a teclearlo.
   */
  useEffect(() => {
    if (addState.done) addFormRef.current?.reset();
  }, [addState]);

  return (
    <section className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
      <header className="flex items-center justify-between gap-3">
        <h4 className="font-sans text-sm font-medium text-text-primary">
          Checklist{' '}
          {total > 0 && (
            <span className="font-normal tabular-nums text-text-secondary">
              {done}/{total}
            </span>
          )}
        </h4>
        {total > 0 && (
          <span className="w-32">
            <ProgressBar
              value={`${Math.round((done / total) * 100)}%`}
              percentage={(done / total) * 100}
              color={done === total ? colors.success : colors.primary}
              height={4}
            />
          </span>
        )}
      </header>

      {total === 0 && (
        <p className="font-sans text-xs text-text-secondary">
          {canEdit
            ? 'Divide la tarea en pasos concretos para ver el avance de un vistazo.'
            : 'Esta tarea no tiene checklist.'}
        </p>
      )}

      {task.checklists.length > 0 && (
        <ul className="flex flex-col gap-1">
          {task.checklists.map((item) => (
            <ChecklistRow
              key={item.id}
              projectId={projectId}
              taskId={task.id}
              itemId={item.id}
              text={item.text}
              completed={item.completed}
              canEdit={canEdit}
              canToggle={canToggle}
            />
          ))}
        </ul>
      )}

      {canEdit && (
        <form ref={addFormRef} action={addAction} className="relative mt-2" noValidate>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="order" value={total} />
          
          <input
            name="text"
            placeholder="Añadir un paso…"
            maxLength={500}
            aria-label="Nuevo ítem del checklist"
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 pr-12 font-sans text-sm text-text-primary outline-none transition-colors placeholder:text-text-disabled focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={adding}
            className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
               <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </form>
      )}

      {addState.error && (
        <p role="alert" className="font-sans text-xs" style={{ color: colors.error }}>
          {addState.error}
        </p>
      )}
    </section>
  );
}

function ChecklistRow({
  projectId,
  taskId,
  itemId,
  text,
  completed,
  canEdit,
  canToggle,
}: {
  projectId: string;
  taskId: string;
  itemId: string;
  text: string;
  completed: boolean;
  canEdit: boolean;
  canToggle: boolean;
}) {
  const [toggleState, toggleAction, toggling] = useAccion(
    toggleChecklistItemAction,
    TASK_INITIAL_STATE,
  );
  const [deleteState, deleteAction, deleting] = useAccion(
    deleteChecklistItemAction,
    TASK_INITIAL_STATE,
  );
  const error = toggleState.error ?? deleteState.error;

  return (
    <li className="group flex items-center gap-2 rounded-lg px-1 py-0.5 transition-colors hover:bg-surface-elevated">
      <form action={toggleAction} className="flex min-w-0 flex-1 items-center gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="itemId" value={itemId} />
        {/**
         * Un botón, no un `<input type="checkbox">`: el estado lo decide el
         * servidor (la ruta es un toggle sin cuerpo) y un checkbox controlado
         * parpadearía entre lo que marcas y lo que vuelve.
         */}
        <button
          type="submit"
          disabled={!canToggle || toggling}
          aria-pressed={completed}
          aria-label={completed ? `Desmarcar «${text}»` : `Marcar «${text}»`}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed"
          style={{
            borderColor: completed ? colors.success : colors.border,
            background: completed ? alpha(colors.success, 25) : 'transparent',
            cursor: canToggle && !toggling ? 'pointer' : undefined,
          }}
        >
          {completed && (
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.success}
              strokeWidth={3}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <span
          className={[
            'min-w-0 flex-1 truncate font-sans text-xs',
            completed ? 'text-text-disabled line-through' : 'text-text-primary',
          ].join(' ')}
          title={text}
        >
          {text}
        </span>
      </form>

      {canEdit && (
        <form action={deleteAction} className="shrink-0">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="itemId" value={itemId} />
          <button
            type="submit"
            disabled={deleting}
            aria-label={`Eliminar «${text}»`}
            title="Eliminar"
            /* Aparece al pasar por encima, pero con foco también: si no, con
               teclado sería invisible e inalcanzable. */
            className="cursor-pointer rounded p-1 text-text-disabled opacity-0 transition-opacity hover:text-error focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </form>
      )}

      {error && (
        <span role="alert" className="font-sans text-[11px]" style={{ color: colors.error }}>
          {error}
        </span>
      )}
    </li>
  );
}
