'use client';

import { deleteTaskAction, updateTaskAction } from '@/app/(private)/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/action-state';
import {
  Button,
  Dialog,
  Input,
  type Label as LabelType,
  PRIORITIES,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  Select,
  type Task,
  Textarea,
  type UserProfile,
  alpha,
  colors,
  personLabel,
  useAccion,
} from '@praxis/commons';
import { type FocusEvent, useEffect, useRef, useState } from 'react';
import { SelectorDeFecha } from '../../molecules/SelectorDeFecha/SelectorDeFecha';
import { GestorDeEtiquetas } from './GestorDeEtiquetas';
import { TaskAttachments } from './TaskAttachments';
import { TaskChecklist } from './TaskChecklist';
import { TaskComments } from './TaskComments';
import { SECTION_PANEL } from './section-panel';

export interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  boardId: string;
  /** Columna en la que está la tarea. */
  columnId: string;
  /** Nombre de esa columna, para situarla en la cabecera. */
  columnName: string;
  task: Task;
  /** Gente del proyecto, que es a quien se puede asignar. */
  members: UserProfile[];
  /** Etiquetas del proyecto, que son las que se pueden poner. */
  labels: LabelType[];
  /** Para poner cara a los autores de los comentarios. */
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  /** Marcar pasos del checklist: `canMoveTask`, no `canEditTask`. */
  canToggleChecklist: boolean;
  /** Escribir en el hilo: `canComment`, no `canEditTask`. */
  canComment: boolean;
  /**
   * Crear, renombrar y borrar las etiquetas del proyecto: `canManageLabels`.
   *
   * Es independiente de `canEdit`: quien mantiene el vocabulario del proyecto no
   * tiene por qué poder tocar tareas, y al revés.
   */
  canManageLabels: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Detalle de una tarea: todo lo que no cabe en la tarjeta.
 *
 * **Ya no crea tareas.** Lo hacía, y abrir esta ventana entera para escribir un
 * título era justo lo que sobraba: ahora la tarea nace desde la columna con
 * solo el título y aquí se le pone el resto. Mantener el modo de creación
 * después de eso habría sido código muerto pretendiendo estar vivo.
 *
 * Los campos son **no controlados** (`defaultValue`) y el formulario se
 * remonta con `key` al cambiar de tarea. Controlarlos obligaba a sincronizar
 * siete estados con la tarea entrante en un `useEffect`, y la primera versión
 * ya perdía cambios al reabrir.
 *
 * ## Se guarda solo
 *
 * **No hay botón de «Guardar».** Lo había, y convivía con un checklist, unos
 * archivos y unos comentarios que se guardaban al instante: en la misma ventana,
 * marcar un paso quedaba hecho y cambiar la prioridad no, sin nada que
 * distinguiera unos campos de otros. Es el mismo razonamiento que ya seguía el
 * desplegable de rol en el equipo (`MemberRoleSelect`).
 *
 * El reparto no es uniforme, y a propósito:
 *
 * - **Al cambiar** los campos de opciones cerradas —prioridad, fecha, etiquetas,
 *   encargados—. Elegir ya es haber terminado de decidir.
 * - **Al salir del campo** el título y la descripción. Guardar en cada tecla
 *   sería una petición por pulsación, y con varias en vuelo la última en salir
 *   no es la última en llegar.
 *
 * Se envía el formulario entero cada vez, no el campo suelto: `updateTaskAction`
 * ya manda la tarea completa —los encargados y las etiquetas *tienen* que ir
 * enteros o se borrarían los que no viajen—, así que reutilizarlo evita
 * inventar un segundo camino de escritura que se desincronizaría con el primero.
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
  usersById,
  currentUserId,
  canToggleChecklist,
  canComment,
  canManageLabels,
  canEdit,
  canDelete,
}: TaskDialogProps) {
  const [state, formAction, pending] = useAccion(updateTaskAction, TASK_INITIAL_STATE);
  const [deleteState, deleteAction, deleting] = useAccion(deleteTaskAction, TASK_INITIAL_STATE);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const readOnly = !canEdit;

  /**
   * Cierra cuando el borrado o el guardado terminan con éxito.
   */
  useEffect(() => {
    if (state.done || deleteState.done) onClose();
  }, [state.done, deleteState.done, onClose]);

  /** Reabrir tras un borrado cancelado no debe recordar la confirmación. */
  useEffect(() => {
    if (!open) setConfirmingDelete(false);
  }, [open]);

  const handleClose = () => {
    if (canEdit && formRef.current && !pending) {
      formRef.current.requestSubmit();
    } else if (!canEdit && !pending) {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      size="lg"
      title={task.title}
      description={
        <span className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 font-sans text-[11px]"
            style={{ background: alpha(colors.primary, 15), color: colors.primary }}
          >
            {columnName}
          </span>
          <span className="font-sans text-xs">Creada {formatDate(task.createdAt)}</span>
        </span>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {canDelete && (
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

          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" onClick={handleClose} disabled={pending}>
              {pending ? 'Guardando…' : 'Cerrar'}
            </Button>
          </div>
        </div>
      }
    >
      <form ref={formRef} action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="boardId" value={boardId} />
        <input type="hidden" name="columnId" value={columnId} />
        {/* `status` debe igualar el nombre de la columna, no su id. */}
        <input type="hidden" name="status" value={columnName} />
        <input type="hidden" name="taskId" value={task.id} />

        <Input
          name="title"
          label="Título"
          defaultValue={task.title}
          placeholder="Qué hay que hacer"
          maxLength={255}
          disabled={readOnly}
          required
        />

        <Textarea
          name="description"
          label="Descripción"
          defaultValue={task.description ?? ''}
          placeholder="Contexto, criterios de aceptación, enlaces…"
          rows={4}
          disabled={readOnly}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            name="priority"
            label="Prioridad"
            defaultValue={task.priority}
            disabled={readOnly}
            /* Con el color delante, «Urgente» no hay que leerlo: se reconoce
               por el mismo rojo que lleva su chip en la tarjeta. */
            options={PRIORITIES.map((priority) => ({
              value: priority,
              label: PRIORITY_LABELS[priority],
              color: PRIORITY_COLORS[priority],
            }))}
          />

          {/* Calendario propio en vez de `<input type="date">`: el nativo lo
              dibuja el navegador, sale distinto en cada uno y en tema oscuro
              aparece en claro. Manda el mismo `yyyy-mm-dd` en un campo oculto,
              así que la acción de servidor no se entera del cambio. */}
          <SelectorDeFecha
            name="dueDate"
            label="Fecha límite (opcional)"
            defaultValue={toDateInput(task.dueDate)}
            disabled={readOnly}
          />
        </div>

        {/**
         * ⚠️ **El `fieldset` cubre solo los interruptores, no la gestión.**
         *
         * Va con `disabled={readOnly}`, y un `fieldset` deshabilitado apaga
         * **todo** lo que tenga dentro, botones incluidos. Con el gestor
         * dentro, alguien con `canManageLabels` pero sin `canEditTask` —el
         * caso de quien mantiene el vocabulario del proyecto sin tocar
         * tareas— se lo encontraría apagado sin motivo. Los dos permisos son
         * independientes y se respetan por separado.
         */}
        <div className="flex flex-col gap-2">
          <fieldset className="flex flex-col gap-2" disabled={readOnly}>
            <legend className="font-sans text-sm font-medium text-text-primary">Etiquetas</legend>
            {labels.length === 0 ? (
              <p className="font-sans text-xs text-text-secondary">
                Este proyecto no tiene etiquetas todavía.
                {canManageLabels ? ' Crea la primera aquí abajo.' : ''}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 rounded-xl p-3" style={SECTION_PANEL}>
                {labels.map((label) => (
                  <LabelToggle
                    key={label.id}
                    label={label}
                    defaultChecked={task.labels.some((l) => l.labelId === label.id)}
                  />
                ))}
              </div>
            )}
          </fieldset>

          {canManageLabels && <GestorDeEtiquetas projectId={projectId} labels={labels} />}
        </div>

        <fieldset className="flex flex-col gap-2" disabled={readOnly}>
          <legend className="font-sans text-sm font-medium text-text-primary">Encargados</legend>
          {members.length === 0 ? (
            <p className="font-sans text-xs text-text-secondary">
              Este proyecto todavía no tiene a nadie a quien asignar.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5 rounded-xl p-2" style={SECTION_PANEL}>
              {members.map((member) => (
                <AssigneeToggle
                  key={member.id}
                  member={member}
                  defaultChecked={task.assignees.some((a) => a.userId === member.id)}
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
          dentro de otro no es HTML válido. */}
      <TaskChecklist
        projectId={projectId}
        task={task}
        canEdit={canEdit}
        canToggle={canToggleChecklist}
      />
      <TaskAttachments
        projectId={projectId}
        taskId={task.id}
        attachments={task.attachments}
        usersById={usersById}
        currentUserId={currentUserId}
        canUpload={canEdit}
        canModerate={canDelete}
      />
      <TaskComments
        projectId={projectId}
        taskId={task.id}
        comments={task.comments}
        usersById={usersById}
        currentUserId={currentUserId}
        canComment={canComment}
        canModerate={canDelete}
      />
    </Dialog>
  );
}

/**
 * Qué ha pasado con lo último que se tocó.
 *
 * Tres estados y ninguno más: se está guardando, no se pudo, o está guardado.
 * El **detalle** del fallo no vive aquí sino junto al formulario, donde ya se
 * pintaba; repetirlo en el pie diría dos veces lo mismo y con menos sitio.
 *
 * Callado hasta el primer cambio: anunciar «Guardado» nada más abrir una tarea
 * que nadie ha tocado es ruido, y encima resta credibilidad al aviso cuando de
 * verdad significa algo.
 */
function SaveStatus({
  saving,
  failure,
  saved,
}: {
  saving: boolean;
  failure: string | null;
  /** El servidor ha confirmado al menos una vez en esta tarea. */
  saved: boolean;
}) {
  if (saving) {
    return (
      <span className="font-sans text-xs text-text-secondary" aria-live="polite">
        Guardando…
      </span>
    );
  }

  if (failure) {
    return (
      <span className="font-sans text-xs" style={{ color: colors.error }} aria-live="polite">
        Sin save
      </span>
    );
  }

  if (!saved) return null;

  return (
    <span
      className="flex items-center gap-1 font-sans text-xs text-text-secondary"
      aria-live="polite"
    >
      <svg
        className="h-3.5 w-3.5"
        style={{ color: colors.success }}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      Guardado
    </span>
  );
}

/**
 * Una persona a la que asignar la tarea.
 *
 * Usaba el átomo `Checkbox` de commons, que es una caja con borde y `p-3`
 * pensada para el formulario de roles, donde cada permiso necesita sitio para su
 * explicación. Para una lista de nombres pesaba demasiado: cinco miembros eran
 * cinco rectángulos ocupando media ventana.
 *
 * Toma el lenguaje del **checklist**: una fila que se ilumina al pasar por
 * encima y un cuadrito de 16 px que se rellena al marcar. La diferencia es que
 * aquí el estado lo lleva el formulario, no el servidor, así que sí es un
 * `<input type="checkbox">` de verdad —oculto— y el cuadro se pinta con
 * `peer-checked`. Con un botón habría que sincronizar `assigneeIds` a mano.
 *
 * El input va `sr-only` en vez de `hidden`: oculto del todo dejaría de recibir
 * foco y la lista no se podría recorrer con el teclado. De ahí que el anillo de
 * foco lo pinte el cuadro con `peer-focus-visible`.
 */
function AssigneeToggle({
  member,
  defaultChecked,
}: {
  member: UserProfile;
  defaultChecked: boolean;
}) {
  return (
    <label className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-elevated has-[:disabled]:cursor-not-allowed">
      <input
        type="checkbox"
        name="assigneeIds"
        value={member.id}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />

      {/* La marca se enciende con `[&>svg]`: los variantes `peer-*` solo miran
          hermanos, y el icono es hijo de este span, no hermano del input. */}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-border transition-colors peer-checked:border-primary peer-checked:bg-primary/25 peer-checked:[&>svg]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-disabled:opacity-50">
        <svg
          className="h-3.5 w-3.5 text-primary opacity-0 transition-opacity"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>

      <span className="min-w-0 flex-1 truncate font-sans text-sm text-text-primary peer-disabled:text-text-secondary">
        {personLabel(member)}
      </span>
    </label>
  );
}

/**
 * Una etiqueta marcable, con su color.
 *
 * Es un checkbox de verdad —oculto— y no un botón con estado: así el formulario
 * recoge `labelIds` solo, sin JavaScript que sincronice nada, igual que los
 * encargados.
 *
 * ⚠️ **Marcada y sin marcar tienen que distinguirse de lejos**, y no lo hacían.
 * Llevaba el checkbox nativo del navegador a 12 px dentro de una píldora de
 * color, y el único `has-[:checked]` que había subía la opacidad al 100 % sobre
 * una base que ya estaba al 100 %: no cambiaba nada. Con seis etiquetas encima
 * había que acercarse a mirar cuál estaba puesta.
 *
 * Ahora la píldora entera responde —apagada al 55 %, encendida del todo— y
 * lleva el mismo cuadrito dibujado que los encargados, en el color de la
 * etiqueta. Dos señales para el mismo estado, que es lo que hace que se lea sin
 * fijarse.
 */
function LabelToggle({
  label,
  defaultChecked,
}: {
  label: LabelType;
  defaultChecked: boolean;
}) {
  const tone = colors[label.color];

  return (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 font-sans text-sm opacity-55 transition-opacity hover:opacity-80 has-[:checked]:opacity-100 has-[:disabled]:cursor-not-allowed"
      style={{ background: alpha(tone, 15), color: tone }}
    >
      <input
        type="checkbox"
        name="labelIds"
        value={label.id}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />

      {/* `currentColor` en vez del token: hereda el color de la etiqueta que ya
          pinta la píldora, así el cuadro y la marca salen del mismo tono sin
          repetirlo. */}
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 border-current transition-colors peer-checked:[&>svg]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-current peer-disabled:opacity-50">
        <svg
          className="h-3 w-3 opacity-0 transition-opacity"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>

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
