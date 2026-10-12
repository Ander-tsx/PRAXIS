'use client';

import { deleteTaskAction, updateTaskAction } from '@/app/(privado)/projects/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  Avatar,
  type Label as LabelType,
  PRIORITIES,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  Select,
  SelectorDeFecha,
  SlideOver,
  type Task,
  type UserProfile,
  alpha,
  avatarHref,
  colors,
  personLabel,
  useAccion,
} from '@praxis/commons';
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { DescripcionMarkdown } from './DescripcionMarkdown';
import { GestorDeEtiquetas } from './GestorDeEtiquetas';
import { TaskAttachments } from './TaskAttachments';
import { TaskChecklist } from './TaskChecklist';
import { TaskDocuments } from './TaskDocuments';
import { TaskNotes } from './TaskNotes';
import { CustomFieldRows } from './custom-fields/CustomFieldRows';
import { PropertyGroup, PropertyRow } from './custom-fields/PropertyRow';
import { type TokenItem, TokenPicker } from './custom-fields/TokenPicker';
import {
  CalendarIcon,
  EstimateIcon,
  PeopleIcon,
  PriorityIcon,
  TagIcon,
} from './custom-fields/property-icons';
import { swallowEscape } from './custom-fields/swallow-escape';
import { FIELD_BOX, FIELD_OVERRIDE, TASK_PANEL_TOKENS } from './section-panel';

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
  /** Para poner cara a los autores de las notas y de los archivos. */
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  /** Marcar pasos del checklist: `canMoveTask`, no `canEditTask`. */
  canToggleChecklist: boolean;
  /** Escribir una nota: `canComment`, no `canEditTask`. Es texto visible lo que
   * cambió de nombre; el permiso sigue llamándose comentar. */
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
  /**
   * Un guardado terminó bien. Es lo que dispara el brillo de la tarjeta en el
   * tablero (ver `TaskCard`), no algo que este panel enseñe.
   *
   * ⚠️ **Manda el id que iba en el formulario que se guardó, no `task.id`.**
   * El guardado se dispara al cerrar o al cambiar de tarea, y para cuando el
   * servidor responde el panel ya puede estar mostrando la tarea siguiente:
   * usar `task.id` en ese momento haría brillar la tarjeta equivocada.
   */
  onSaved?: (taskId: string) => void;
  /**
   * En un tablero con Scrum: si la tarea está en el backlog o en el sprint, y
   * cómo pasarla al otro lado sin arrastrar. Sin esto, recortar alcance a
   * mitad de sprint solo se podía cerrando el sprint (auditoría S5).
   */
  planificacion?: {
    enBacklog: boolean;
    /** Nombre del sprint que enseña el tablero. */
    sprint: string;
    onMover: () => void;
  };
}

/**
 * Firma de todo lo que este formulario manda, para saber si ha cambiado algo.
 *
 * Se ordena porque el orden en que un `FormData` enumera los campos no
 * significa nada —dos casillas marcadas al revés son la misma lista de
 * encargados— y `taskId` viaja dentro, así que dos tareas distintas nunca dan
 * la misma firma aunque tengan los mismos valores.
 */
function formSignature(form: HTMLFormElement): string {
  return Array.from(new FormData(form).entries())
    .map(([name, value]) => `${name}=${String(value)}`)
    .sort()
    .join('\n');
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
 * Se guarda **al cerrar el panel y al cambiar de tarea**, no en cada tecla:
 * guardar por pulsación sería una petición por letra, y con varias en vuelo la
 * última en salir no es la última en llegar.
 *
 * Se envía el formulario entero cada vez, no el campo suelto: `updateTaskAction`
 * ya manda la tarea completa —los encargados y las etiquetas *tienen* que ir
 * enteros o se borrarían los que no viajen—, así que reutilizarlo evita
 * inventar un segundo camino de escritura que se desincronizaría con el primero.
 *
 * Y **solo si algo cambió** (`saveIfChanged`): mandar la tarea entera cuando
 * nadie la ha tocado la marca como editada para todo lo que escucha.
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
  onSaved,
  planificacion,
}: TaskDialogProps) {
  /* Sin el tercer elemento (`enMarcha`) a propósito: ver `handleClose`. */
  const [state, formAction] = useAccion(updateTaskAction, TASK_INITIAL_STATE);
  const [deleteState, deleteAction, deleting] = useAccion(deleteTaskAction, TASK_INITIAL_STATE);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const readOnly = !canEdit;

  /**
   * Cierra cuando el borrado termina con éxito.
   * El guardado ya es optimista y no debe cerrar el panel (el usuario puede querer seguir editando).
   */
  useEffect(() => {
    if (deleteState.done) onClose();
  }, [deleteState, onClose]);

  /** Reabrir tras un borrado cancelado no debe recordar la confirmación. */
  useEffect(() => {
    if (!open) setConfirmingDelete(false);
  }, [open]);

  /**
   * Lo último que se sabe guardado, como firma del formulario.
   *
   * Empieza valiendo lo que el servidor acaba de pintar, así que abrir y cerrar
   * sin tocar nada no escribe.
   */
  const savedSignature = useRef<string | null>(null);

  /**
   * Guarda, pero solo si el formulario ya no dice lo mismo que la última vez.
   *
   * El panel se guarda solo —al cerrarse y al cambiar de tarea—, así que sin
   * esta comprobación cada apertura mandaba un `PATCH` completo, con
   * encargados y etiquetas incluidos. Eso no es un envío de más y ya está: el
   * backend lo lee como una edición, avisa a quien entre o salga de la tarea y,
   * desde que el motor de automatización reacciona a hechos, despierta a las
   * reglas de esa tarea.
   */
  /** El id que iba en el último formulario mandado, para el aviso de `onSaved`. */
  const idEnVuelo = useRef<string | null>(null);

  const saveIfChanged = useCallback(
    (form: HTMLFormElement) => {
      if (!canEdit) return;
      const signature = formSignature(form);
      if (signature === savedSignature.current) return;
      savedSignature.current = signature;
      const datos = new FormData(form);
      idEnVuelo.current = String(datos.get('taskId') ?? '') || null;
      /* El `FormData` va suelto y no por `requestSubmit()`: esto también se
         llama desde el desmontaje, y entonces el formulario ya no está en el
         DOM y `requestSubmit()` falla. */
      formAction(datos);
    },
    [canEdit, formAction],
  );

  /** Un guardado que falló no está guardado: se olvida la firma para reintentar. */
  useEffect(() => {
    if (state.error) savedSignature.current = null;
  }, [state.error]);

  /**
   * Terminó bien: el brillo va para la tarjeta que de verdad se guardó.
   *
   * ⚠️ **La dependencia es `state` entero, no `state.done`.** `useAccion`
   * devuelve un objeto nuevo en cada acción que termina, pero su campo
   * `done` es la misma cadena `'updated'` de la vez anterior — y una
   * dependencia por valor primitivo no dispara el efecto si el valor no
   * cambió. Guardar dos tareas seguidas solo hacía brillar la primera: la
   * segunda actualización de `state` no volvía a pasar por aquí porque
   * `state.done` seguía siendo, letra por letra, `'updated'`.
   */
  useEffect(() => {
    if (state.done !== 'updated' || !idEnVuelo.current) return;
    onSaved?.(idEnVuelo.current);
    idEnVuelo.current = null;
  }, [state, onSaved]);

  /**
   * Anota lo que hay al abrir una tarea, y guarda lo que quede pendiente antes
   * de cambiar a otra.
   */
  useEffect(() => {
    const form = formRef.current;
    if (form) savedSignature.current = formSignature(form);
    return () => {
      if (form) saveIfChanged(form);
    };
  }, [task.id, saveIfChanged]);

  /**
   * ⚠️ **`onSubmit` en vez de `action={…}`, y no es una preferencia de estilo.**
   *
   * React 19 **resetea el formulario en cada envío** hecho por `<form action>`:
   * `startHostTransition` llama a `requestFormReset` antes de ejecutar la
   * acción. Con campos no controlados —que es como está montado este panel—
   * eso devuelve cada casilla a su `defaultChecked`, y esos defaults salen de
   * la tarea que el panel tiene cargada, que al cerrarse deja de refrescarse.
   *
   * El resultado era una avería silenciosa y fea: asignabas a alguien, cerrabas
   * —se guardaba bien—, y el formulario se quedaba en pantalla diciendo que la
   * tarea no tenía encargados. Al abrir otra tarea, el guardado del desmontaje
   * mandaba esa lista vacía a la tarea anterior, y a quien acababas de asignar
   * le llegaba un aviso de que lo habías quitado.
   *
   * Enviando el `FormData` a mano no hay reset, y lo que se ve sigue siendo lo
   * que se guardó.
   */
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveIfChanged(event.currentTarget);
  };

  const handleClose = () => {
    /**
     * ⚠️ **Sin la guarda `!pending`, y no es un descuido.**
     *
     * Estaba para no reenviar mientras un guardado anterior seguía en vuelo. El
     * problema es de dónde sale ese `pending`: es el `enMarcha` de `useAccion`,
     * que mide una transición del router de Next —global a toda la app—. Cuando
     * esa transición se queda colgada por una carrera en la cola (un
     * `router.refresh()` de los avisos en vivo, o el `revalidate` de gestionar
     * una etiqueta, justo encima de este `PATCH`), `pending` se queda `true` y
     * **no vuelve a bajar mientras se siga interactuando** —el techo de 25 s se
     * rearma en cada acción nueva—. Con la guarda puesta, a partir de ahí este
     * `requestSubmit()` no se dispara nunca y **deja de guardarse todo**: título,
     * prioridad, etiquetas. Justo el síntoma que se veía al marcar etiquetas.
     *
     * Reenviar de más es inofensivo: `saveIfChanged` compara la firma del
     * formulario y no hace nada si no ha cambiado, y si cambió es que hay algo
     * más nuevo que mandar.
     */
    if (canEdit && formRef.current) {
      formRef.current.requestSubmit();
    }
    // Cierre optimista: la animación arranca ya, sin esperar al servidor.
    onClose();
  };

  return (
    <SlideOver
      open={open}
      onClose={handleClose}
      size="lg"
      tone="dark"
      /* Sin `title`: el título es el campo editable de arriba del cuerpo, y
         repetirlo aquí lo decía dos veces. La cabecera se queda con dónde está
         la tarea y cuándo nació, y con el botón de cerrar. */
      description={
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/[0.08] px-2 py-0.5 font-sans text-[11px] text-white">
            {planificacion?.enBacklog ? 'Backlog' : columnName}
          </span>
          {planificacion && !planificacion.enBacklog && (
            <span className="font-sans text-xs text-text-secondary">{planificacion.sprint}</span>
          )}
          <span className="font-sans text-xs">Creada {formatDate(task.createdAt)}</span>
          {planificacion && (
            <button
              type="button"
              onClick={planificacion.onMover}
              className="cursor-pointer rounded-full border border-white/[0.12] px-2 py-0.5 font-sans text-[11px] text-text-secondary transition-colors hover:border-primary hover:text-primary"
            >
              {planificacion.enBacklog ? `Pasar a ${planificacion.sprint}` : 'Devolver al backlog'}
            </button>
          )}
        </span>
      }
    >
      {/* Los tonos de superficie suben un peldaño dentro del panel: ver
          `TASK_PANEL_TOKENS`. */}
      <div style={TASK_PANEL_TOKENS} className="flex min-w-0 flex-col">
        <form
          key={task.id}
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex flex-col gap-1"
          noValidate
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="boardId" value={boardId} />
          <input type="hidden" name="columnId" value={columnId} />
          {/* `status` debe igualar el nombre de la columna, no su id. */}
          <input type="hidden" name="status" value={columnName} />
          <input type="hidden" name="taskId" value={task.id} />

          {/**
           * **El título es el encabezado del panel**, editable ahí mismo. Antes
           * salía dos veces —en la cabecera y en una caja con su etiqueta
           * flotante— y la caja le quitaba toda la jerarquía: pesaba lo mismo
           * que la descripción.
           *
           * `textarea` y no `input` para que un título largo baje de línea en vez
           * de cortarse; Enter no salta de línea —un título es una línea—, sale
           * del campo.
           */}
          <textarea
            id="task-title"
            name="title"
            aria-label="Título"
            defaultValue={task.title}
            maxLength={255}
            disabled={readOnly}
            required
            rows={1}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            className="-mx-2 resize-none rounded-lg bg-transparent px-2 py-1 font-sans text-xl font-semibold leading-snug text-text-primary outline-none transition-colors [field-sizing:content] placeholder:text-text-disabled hover:bg-white/[0.03] focus:bg-white/[0.04] focus:ring-1 focus:ring-white/10 disabled:hover:bg-transparent"
          />

          {/* La descripción es Markdown simplificado en vivo; viaja al guardado
              como un `input` oculto con el mismo nombre de siempre. */}
          <DescripcionMarkdown initial={task.description ?? ''} readOnly={readOnly} />

          {/**
           * **Propiedades con el nombre encima** y el campo a todo su ancho, en
           * una rejilla de dos columnas (`PropertyGroup`): lo corto de dos en
           * dos, lo largo —encargados, etiquetas, estimación con sus atajos— en
           * fila entera.
           *
           * Los nombres de campo (`priority`, `dueDate`, `estimatePoints`,
           * `assigneeIds`, `labelIds`) **no cambian**: el guardado al cerrar sigue
           * leyendo el mismo `FormData` que antes.
           */}
          <PropertyGroup title="Detalles">
            <PropertyRow label="Prioridad" icon={<PriorityIcon />} htmlFor="task-priority">
              <Select
                id="task-priority"
                className={FIELD_OVERRIDE}
                name="priority"
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
            </PropertyRow>

            {/* Calendario propio en vez de `<input type="date">`: el nativo lo
              dibuja el navegador, sale distinto en cada uno y en tema oscuro
              aparece en claro. Manda el mismo `yyyy-mm-dd` en un campo oculto,
              así que la acción de servidor no se entera del cambio. */}
            <PropertyRow label="Fecha límite" icon={<CalendarIcon />}>
              <SelectorDeFecha
                name="dueDate"
                label="Fecha límite (opcional)"
                hideLabel
                corto
                className={FIELD_OVERRIDE}
                defaultValue={toDateInput(task.dueDate)}
                disabled={readOnly}
                /* En la columna derecha de la rejilla: el calendario se pega
                 al borde derecho y crece hacia dentro. */
                align="right"
              />
            </PropertyRow>

            {/* Puntos sin escala impuesta (D4 de `docs/PLAN-SCRUM-KANBAN.md`):
              vacío es «sin estimar», que no es lo mismo que 0. */}
            <PropertyRow
              /* «(puntos)» solo para el lector de pantalla. Por `<label for>` y no
               `aria-label`: con Scrum hay dos paneles montados, y un
               `aria-label` nombraría a los dos. */
              label={
                <>
                  Estimación<span className="sr-only"> (puntos)</span>
                </>
              }
              icon={<EstimateIcon />}
              htmlFor="task-estimate"
              wide
            >
              {/* Un solo control: el número y sus atajos dentro de la misma
                  caja, no dos cosas sueltas una al lado de la otra. */}
              <div
                className={`flex min-h-10 items-center gap-2 pr-1.5 ${readOnly ? '' : FIELD_BOX}`}
              >
                <input
                  id="task-estimate"
                  name="estimatePoints"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  step={1}
                  placeholder="Sin estimar"
                  defaultValue={task.estimatePoints ?? ''}
                  disabled={readOnly}
                  className="h-10 w-full min-w-0 flex-1 bg-transparent px-3 font-sans text-sm tabular-nums text-text-primary outline-none placeholder:text-text-secondary disabled:px-0"
                />
                {/* Atajos de la escala más usada, sin imponerla (S22): escribir
                  cualquier otro número sigue valiendo. Escriben en el campo no
                  controlado, así que el guardado al cerrar los ve como un
                  cambio más. */}
                {!readOnly && (
                  <span className="flex shrink-0 gap-1" aria-label="Estimaciones rápidas">
                    {[1, 2, 3, 5, 8, 13].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          const campo = formRef.current?.elements.namedItem(
                            'estimatePoints',
                          ) as HTMLInputElement | null;
                          if (!campo) return;
                          campo.value = String(n);
                        }}
                        className="h-7 min-w-7 cursor-pointer rounded-full bg-white/[0.06] px-2 font-sans text-xs tabular-nums text-text-secondary transition-colors hover:bg-primary/20 hover:text-text-primary"
                      >
                        {n}
                      </button>
                    ))}
                  </span>
                )}
              </div>
            </PropertyRow>

            <AssigneesProperty
              members={members}
              usersById={usersById}
              initial={task.assignees.map((a) => a.userId)}
              readOnly={readOnly}
            />

            <LabelsProperty
              projectId={projectId}
              labels={labels}
              initial={task.labels.map((l) => l.labelId)}
              readOnly={readOnly}
              canManageLabels={canManageLabels}
            />
          </PropertyGroup>

          {(state.error || deleteState.error) && (
            <p
              role="alert"
              className="rounded-lg border border-error/20 bg-error/10 p-3 font-sans text-xs text-error"
            >
              {state.error ?? deleteState.error}
            </p>
          )}
        </form>

        {/* Los campos del proyecto, **fuera del formulario** aunque se lean como
          una fila más de las propiedades: cada uno se guarda al cambiarlo, por
          su ruta (D5 de `docs/PLAN-CAMPOS-PERSONALIZADOS.md`). Dentro, sus
          valores entrarían en la firma del formulario y harían que cerrar el
          panel mandara la tarea entera. */}
        <div>
          <CustomFieldRows task={task} readOnly={readOnly} />
        </div>

        {/* Fuera del formulario: cada ítem tiene su propia acción y un <form>
          dentro de otro no es HTML válido. */}
        <TaskChecklist
          projectId={projectId}
          task={task}
          canEdit={canEdit}
          canToggle={canToggleChecklist}
        />
        {/* Los documentos del proyecto son la forma principal de dar contexto a
          una tarea (E9 de `docs/PLAN-DOCUMENTOS.md`). Debajo, los archivos:
          PDF y enlaces (un Google Doc, un PR), con el mismo aviso de para qué
          sirven que Documentos. Sin permiso y sin nada que enseñar, no sale. */}
        <TaskDocuments projectId={projectId} taskId={task.id} canEdit={canEdit} />
        {(canEdit || task.attachments.length > 0 || (task.links?.length ?? 0) > 0) && (
          <TaskAttachments
            projectId={projectId}
            taskId={task.id}
            attachments={task.attachments}
            links={task.links ?? []}
            usersById={usersById}
            currentUserId={currentUserId}
            canUpload={canEdit}
            canModerate={canDelete}
          />
        )}
        {/**
         * Las notas, **al final y fuera del formulario**, por lo mismo que las
         * dos secciones de arriba: cada una tiene su propia acción de servidor y
         * un `<form>` dentro de otro no es HTML válido.
         *
         * ⚠️ **Estaba escrita y no se montaba.** `canComment` llegaba hasta aquí
         * desde la página, atravesando `WorkspaceCanvas`, `BoardColumns` y
         * `ColumnTasks`, y moría en este archivo sin que nadie lo consumiera: el
         * componente existía, la acción existía y el endpoint existía. Un
         * componente que no se monta no da ningún error, así que el hilo entero
         * llevaba escondido lo que duró el pulido.
         */}
        <TaskNotes
          projectId={projectId}
          taskId={task.id}
          comments={task.comments}
          usersById={usersById}
          currentUserId={currentUserId}
          canComment={canComment}
          canModerate={canDelete}
        />

        <div className="mt-8 mb-12 flex w-full shrink-0 items-center justify-between gap-2 border-t border-white/10 pt-4 pb-4">
          <div>
            {canDelete && (
              <form action={deleteAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="taskId" value={task.id} />
                {confirmingDelete ? (
                  <span className="flex items-center gap-2">
                    <span className="font-sans text-xs text-white">¿Seguro?</span>
                    <button
                      type="submit"
                      disabled={deleting}
                      className="rounded-lg border border-error/20 bg-error/10 px-3 py-1.5 font-sans text-xs font-medium text-error transition-colors hover:bg-error/20 disabled:opacity-50"
                    >
                      {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="rounded-lg px-3 py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-white/[0.05] hover:text-white"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="rounded-lg px-3 py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-white/[0.05] hover:text-white"
                  >
                    Eliminar
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </SlideOver>
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
      <span className="font-sans text-xs text-white" aria-live="polite">
        Guardando…
      </span>
    );
  }

  if (failure) {
    return (
      <span className="font-sans text-xs" style={{ color: colors.error }} aria-live="polite">
        Sin guardar
      </span>
    );
  }

  if (!saved) return null;

  return (
    <span className="flex items-center gap-1 font-sans text-xs text-white" aria-live="polite">
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
/**
 * Encargados: quién la lleva y a quién se puede añadir, **en un solo control**
 * (`TokenPicker`).
 *
 * ⚠️ **Lo que viaja en el formulario son `<input type="hidden">`**, uno por
 * persona elegida, con el mismo `name` que tenían las casillas. El guardado al
 * cerrar lee el `FormData` entero, y lo que no esté ahí se da por quitado: es
 * la avería de `734855a` si alguna vez se dejan de pintar.
 *
 * El estado nace de la tarea con cada una: el formulario se remonta por `key`
 * al cambiar de tarea.
 */
function AssigneesProperty({
  members,
  usersById,
  initial,
  readOnly,
}: {
  members: UserProfile[];
  usersById: Map<string, UserProfile>;
  initial: string[];
  readOnly: boolean;
}) {
  const [chosen, setChosen] = useState<string[]>(initial);

  /* Las personas que ya no están en el proyecto siguen saliendo mientras estén
     asignadas: quitarlas es decisión de quien edita, no de la lista. */
  const items: TokenItem[] = [
    ...members,
    ...chosen
      .filter((id) => !members.some((m) => m.id === id))
      .flatMap((id) => {
        const user = usersById.get(id);
        return user ? [user] : [];
      }),
  ].map((user) => ({
    id: user.id,
    label: personLabel(user),
    leading: (
      <Avatar
        size="sm"
        label={personLabel(user)}
        src={avatarHref(user.avatarUrl, '/api/gateway')}
      />
    ),
  }));

  return (
    <PropertyRow label="Encargados" icon={<PeopleIcon />} wide>
      {chosen.map((id) => (
        <input key={id} type="hidden" name="assigneeIds" value={id} />
      ))}
      <TokenPicker
        label="Encargados"
        items={items}
        selected={chosen}
        onChange={setChosen}
        disabled={readOnly}
        placeholder="Añadir persona…"
        emptyText="Sin asignar"
        noItemsText="Este proyecto todavía no tiene a nadie a quien asignar."
        footer={
          <span className="font-sans text-[11px] text-text-secondary">
            Solo se puede asignar a quien esté en el proyecto.
          </span>
        }
      />
    </PropertyRow>
  );
}

/**
 * Etiquetas: las puestas y las del proyecto, en el mismo control que los
 * encargados. Gestionar el vocabulario —crear, renombrar, borrar— va aparte,
 * con «Gestionar» junto al nombre: es otro permiso (`canManageLabels`) y otra
 * tarea que elegir cuáles lleva esta.
 *
 * ⚠️ Mismo cuidado que los encargados: lo que viaja son `hidden`, uno por
 * etiqueta puesta.
 */
function LabelsProperty({
  projectId,
  labels,
  initial,
  readOnly,
  canManageLabels,
}: {
  projectId: string;
  labels: LabelType[];
  initial: string[];
  readOnly: boolean;
  canManageLabels: boolean;
}) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const [gestionando, setGestionando] = useState(false);

  const items: TokenItem[] = labels.map((label) => ({
    id: label.id,
    label: label.name,
    tone: colors[label.color],
    leading: (
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: colors[label.color] }}
      />
    ),
  }));

  return (
    <PropertyRow
      label="Etiquetas"
      icon={<TagIcon />}
      wide
      action={
        canManageLabels && (
          <button
            type="button"
            aria-expanded={gestionando}
            onClick={() => setGestionando((v) => !v)}
            className="cursor-pointer rounded px-1.5 py-0.5 font-sans text-[11px] font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
          >
            {gestionando ? 'Cerrar' : 'Gestionar'}
          </button>
        )
      }
    >
      {chosen.map((id) => (
        <input key={id} type="hidden" name="labelIds" value={id} />
      ))}
      <TokenPicker
        label="Etiquetas"
        items={items}
        selected={chosen}
        onChange={setChosen}
        disabled={readOnly}
        placeholder="Añadir etiqueta…"
        emptyText="Sin etiquetas"
        noItemsText={
          canManageLabels
            ? 'Este proyecto no tiene etiquetas: créalas con «Gestionar».'
            : 'Este proyecto no tiene etiquetas todavía.'
        }
      />
      {canManageLabels && gestionando && (
        <div className="mt-2 origin-top animate-desplegar-menu">
          <GestorDeEtiquetas projectId={projectId} labels={labels} />
        </div>
      )}
    </PropertyRow>
  );
}

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
