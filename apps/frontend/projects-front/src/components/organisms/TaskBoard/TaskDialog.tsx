'use client';

import {
  Button,
  Checkbox,
  Dialog,
  Input,
  type Label as LabelType,
  PRIORITIES,
  PRIORITY_LABELS,
  Select,
  type Task,
  Textarea,
  type UserProfile,
  alpha,
  colors,
  personLabel,
} from '@praxis/commons';
import { useActionState, useEffect, useId, useState } from 'react';
import { createTaskAction, deleteTaskAction, updateTaskAction } from '@/app/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/action-state';
import { TaskChecklist } from './TaskChecklist';

export interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  boardId: string;
  /** Columna destino al crear, o la actual al editar. */
  columnId: string;
  /** Nombre de esa columna: `status` tiene que igualarlo. */
  columnName: string;
  /** `null` para crear. */
  task: Task | null;
  /** Gente del proyecto, que es a quien se puede asignar. */
  members: UserProfile[];
  /** Etiquetas del proyecto, que son las que se pueden poner. */
  labels: LabelType[];
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Detalle de una tarea, y también el formulario de creación.
 *
 * Es el mismo diálogo para las dos cosas porque los campos son los mismos y
 * mantener dos formularios en paralelo acaba con uno de los dos desactualizado.
 * Lo que cambia es la acción, el título y que al crear todavía no hay checklist
 * a la que colgar ítems: sin `taskId` no hay ruta donde ponerlos.
 *
 * Los campos son **no controlados** (`defaultValue`) y el formulario se
 * remonta con `key` al cambiar de tarea. Controlarlos obligaba a sincronizar
 * siete estados con la tarea entrante en un `useEffect`, y la primera versión
 * ya perdía cambios al reabrir.
 */
export function TaskDialog({
  open,
  onClose,
  projectId,
  boardId,
  columnId,
  columnName,
  task,
  members,
  labels,
  canEdit,
  canDelete,
}: TaskDialogProps) {
  const isNew = task === null;
  const [state, formAction, pending] = useActionState(
    isNew ? createTaskAction : updateTaskAction,
    TASK_INITIAL_STATE,
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteTaskAction,
    TASK_INITIAL_STATE,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const formId = useId();

  /** Cuando el servidor confirma, se cierra. No antes: si falla, sigue abierto. */
  useEffect(() => {
    if (state.done || deleteState.done) onClose();
  }, [state.done, deleteState.done, onClose]);

  /** Reabrir tras un borrado cancelado no debe recordar la confirmación. */
  useEffect(() => {
    if (!open) setConfirmingDelete(false);
  }, [open]);

  const readOnly = !canEdit;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={isNew ? 'Nueva tarea' : task.title}
      description={
        <span className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 font-sans text-[11px]"
            style={{ background: alpha(colors.primary, 15), color: colors.primary }}
          >
            {columnName}
          </span>
          {!isNew && <span className="font-sans text-xs">Creada {formatDate(task.createdAt)}</span>}
        </span>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {!isNew && canDelete && (
              <form action={deleteAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="taskId" value={task.id} />
                {confirmingDelete ? (
                  <span className="flex items-center gap-2">
                    <span className="font-sans text-xs text-text-secondary">¿Seguro?</span>
                    <Button type="submit" variant="danger" size="sm" disabled={deleting}>
                      {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      No
                    </Button>
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Eliminar
                  </Button>
                )}
              </form>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {readOnly ? 'Cerrar' : 'Cancelar'}
            </Button>
            {canEdit && (
              <Button type="submit" form={formId} disabled={pending}>
                {pending ? 'Guardando…' : isNew ? 'Crear tarea' : 'Guardar'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <form id={formId} action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="boardId" value={boardId} />
        <input type="hidden" name="columnId" value={columnId} />
        {/* `status` debe igualar el nombre de la columna, no su id. */}
        <input type="hidden" name="status" value={columnName} />
        {!isNew && <input type="hidden" name="taskId" value={task.id} />}

        <Input
          name="title"
          label="Título"
          defaultValue={task?.title ?? ''}
          placeholder="Qué hay que hacer"
          maxLength={255}
          disabled={readOnly}
          required
          autoFocus={isNew}
        />

        <Textarea
          name="description"
          label="Descripción"
          defaultValue={task?.description ?? ''}
          placeholder="Contexto, criterios de aceptación, enlaces…"
          rows={4}
          disabled={readOnly}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            name="priority"
            label="Prioridad"
            defaultValue={task?.priority ?? 'MEDIUM'}
            disabled={readOnly}
            options={PRIORITIES.map((priority) => ({
              value: priority,
              label: PRIORITY_LABELS[priority],
            }))}
          />

          <Input
            name="dueDate"
            type="date"
            label="Fecha límite"
            defaultValue={toDateInput(task?.dueDate ?? null)}
            disabled={readOnly}
          />
        </div>

        <fieldset className="flex flex-col gap-2" disabled={readOnly}>
          <legend className="font-sans text-sm font-medium text-text-primary">Etiquetas</legend>
          {labels.length === 0 ? (
            <p className="font-sans text-xs text-text-secondary">
              Este proyecto no tiene etiquetas todavía. Se crean en la pestaña «Etiquetas».
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 rounded-xl bg-background p-3">
              {labels.map((label) => (
                <LabelToggle
                  key={label.id}
                  label={label}
                  defaultChecked={task?.labels.some((l) => l.labelId === label.id) ?? false}
                />
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2" disabled={readOnly}>
          <legend className="font-sans text-sm font-medium text-text-primary">Encargados</legend>
          {members.length === 0 ? (
            <p className="font-sans text-xs text-text-secondary">
              Este proyecto todavía no tiene a nadie a quien asignar.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-xl bg-background p-3">
              {members.map((member) => (
                <Checkbox
                  key={member.id}
                  name="assigneeIds"
                  value={member.id}
                  label={personLabel(member)}
                  defaultChecked={task?.assignees.some((a) => a.userId === member.id) ?? false}
                />
              ))}
            </div>
          )}
          <p className="font-sans text-xs text-text-disabled">
            Solo se puede asignar a quien esté en el proyecto.
          </p>
        </fieldset>

        {(state.error || deleteState.error) && (
          <p role="alert" className="font-sans text-sm" style={{ color: colors.error }}>
            {state.error ?? deleteState.error}
          </p>
        )}
      </form>

      {/* Fuera del formulario: cada ítem tiene su propia acción y un <form>
          dentro de otro no es HTML válido. Al crear no hay `taskId` todavía,
          así que la sección aparece en cuanto la tarea existe. */}
      {!isNew && <TaskChecklist projectId={projectId} task={task} canEdit={canEdit} />}
    </Dialog>
  );
}

/**
 * Una etiqueta marcable, con su color.
 *
 * Es un checkbox de verdad —oculto— y no un botón con estado: así el formulario
 * recoge `labelIds` solo, sin JavaScript que sincronice nada, igual que los
 * encargados.
 */
function LabelToggle({ label, defaultChecked }: { label: LabelType; defaultChecked: boolean }) {
  const tone = colors[label.color];

  return (
    <label
      className="flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs transition-opacity has-[:checked]:opacity-100 has-[:disabled]:cursor-not-allowed"
      style={{ background: alpha(tone, 15), color: tone }}
    >
      <input
        type="checkbox"
        name="labelIds"
        value={label.id}
        defaultChecked={defaultChecked}
        className="h-3 w-3 accent-current"
      />
      {label.name}
    </label>
  );
}

/** `2026-08-01T23:59:59.000Z` → `2026-08-01`, que es lo que quiere el input. */
function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
