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
import { GestorDeEtiquetas } from './GestorDeEtiquetas';
import { TaskAttachments } from './TaskAttachments';
import { TaskChecklist } from './TaskChecklist';
import { TaskDocuments } from './TaskDocuments';
import { TaskNotes } from './TaskNotes';
import { CustomFieldRows } from './custom-fields/CustomFieldRows';
import { PropertyGroup, PropertyRow } from './custom-fields/PropertyRow';
import {
  CalendarIcon,
  EstimateIcon,
  PeopleIcon,
  PriorityIcon,
  TagIcon,
} from './custom-fields/property-icons';
import { swallowEscape } from './custom-fields/swallow-escape';
import { SECTION_PANEL, SECTION_TITLE_CLASS, TASK_PANEL_TOKENS } from './section-panel';

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
/**
 * Un desplegable sin caja hasta que se le pasa por encima: dentro del bloque de
 * propiedades, una caja por fila volvía a pesar lo mismo que el bloque entero.
 * Con `!` porque el átomo ya trae su borde y su fondo, y entre dos utilidades
 * del mismo tipo decide el orden del CSS, no el de las clases.
 */
const GHOST_FIELD =
  'border-transparent! bg-transparent! shadow-none! hover:bg-white/[0.04]! hover:shadow-none!';

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

          <textarea
            id="task-description"
            name="description"
            aria-label="Descripción"
            placeholder={readOnly ? 'Sin descripción' : 'Añade una descripción…'}
            defaultValue={task.description ?? ''}
            rows={2}
            disabled={readOnly}
            className="-mx-2 min-h-[2.75rem] resize-none rounded-lg bg-transparent px-2 py-1.5 font-sans text-sm leading-relaxed text-text-primary outline-none transition-colors [field-sizing:content] placeholder:text-text-disabled hover:bg-white/[0.03] focus:bg-white/[0.04] focus:ring-1 focus:ring-white/10 disabled:hover:bg-transparent"
          />

          {/**
           * **Propiedades en filas**, con el nombre a la izquierda y el valor a la
           * derecha (kyloo-design §4: filas, no cajas). Antes era una pila de
           * campos grandes con su etiqueta encima, y con encargados y etiquetas
           * desplegados enteros el panel medía tres pantallas en un equipo de
           * quince personas.
           *
           * Los nombres de campo (`priority`, `dueDate`, `estimatePoints`,
           * `assigneeIds`, `labelIds`) **no cambian**: el guardado al cerrar sigue
           * leyendo el mismo `FormData` que antes.
           */}
          <PropertyGroup title="Detalles">
            <PropertyRow label="Prioridad" icon={<PriorityIcon />} htmlFor="task-priority">
              <Select
                id="task-priority"
                className={GHOST_FIELD}
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
                ghost
                defaultValue={toDateInput(task.dueDate)}
                disabled={readOnly}
                /* El panel es estrecho: el calendario desplegable se pega al
                 borde derecho y crece hacia dentro. */
                align="right"
              />
            </PropertyRow>

            {/* Puntos sin escala impuesta (D4 de `docs/PLAN-SCRUM-KANBAN.md`):
              vacío es «sin estimar», que no es lo mismo que 0. */}
            <PropertyRow
              /* «(puntos)» solo para el lector de pantalla: a la vista lo dice el
               propio campo. Por `<label for>` y no `aria-label`: con Scrum hay
               dos paneles montados, y un `aria-label` nombraría a los dos. */
              label={
                <>
                  Estimación<span className="sr-only"> (puntos)</span>
                </>
              }
              icon={<EstimateIcon />}
              htmlFor="task-estimate"
            >
              <div className="flex flex-wrap items-center gap-1">
                <input
                  id="task-estimate"
                  name="estimatePoints"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  step={1}
                  placeholder="—"
                  defaultValue={task.estimatePoints ?? ''}
                  disabled={readOnly}
                  className="h-9 w-[5.5rem] rounded-lg border border-transparent bg-transparent px-2.5 font-sans text-sm tabular-nums text-text-primary outline-none transition-colors placeholder:text-text-disabled hover:border-border focus:border-primary focus:bg-surface disabled:opacity-60"
                />
                {/* Atajos de la escala más usada, sin imponerla (S22): escribir
                  cualquier otro número sigue valiendo. Escriben en el campo no
                  controlado, así que el guardado al cerrar los ve como un
                  cambio más. */}
                {!readOnly && (
                  <span className="flex gap-1" aria-label="Estimaciones rápidas">
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
                        className="h-6 min-w-6 cursor-pointer rounded-md border border-white/10 px-1 font-sans text-[11px] tabular-nums text-text-secondary transition-colors hover:border-primary hover:text-primary"
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
              className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 font-sans text-xs text-red-400"
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
                      className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 font-sans text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
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
 * Encargados: quién la lleva, y la lista de miembros al pulsar.
 *
 * ⚠️ **Las casillas están siempre en el DOM**, también con la lista cerrada
 * (`hidden`, que no es `disabled`): el guardado al cerrar lee el `FormData`
 * entero, y una casilla que no estuviera montada mandaría la lista de
 * encargados vacía —es decir, los borraría—. Es la misma avería de
 * `734855a` por otro camino.
 *
 * El resumen de arriba lleva su propio estado, alimentado por el `onChange`
 * de cada casilla: las casillas siguen sin controlar, como el resto del
 * formulario, y el formulario se remonta por `key` al cambiar de tarea, así que
 * ese estado nace de nuevo con cada una.
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase('es');

  return (
    <PropertyRow label="Encargados" icon={<PeopleIcon />}>
      <PickerShell
        open={open}
        setOpen={setOpen}
        disabled={readOnly}
        toggleLabel="Encargados: cambiar"
        summary={
          chosen.length === 0 ? (
            <span className="text-text-disabled">Sin asignar</span>
          ) : (
            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              {chosen.map((id) => {
                const user = usersById.get(id);
                const label = user ? personLabel(user) : 'Alguien que ya no está';
                return (
                  <span key={id} className="flex min-w-0 max-w-full items-center gap-1.5">
                    <Avatar
                      size="sm"
                      label={label}
                      src={avatarHref(user?.avatarUrl, '/api/gateway')}
                    />
                    <span className="truncate">{label}</span>
                  </span>
                );
              })}
            </span>
          )
        }
      >
        <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-1">
          <legend className="sr-only">Encargados</legend>
          {members.length > 6 && (
            <input
              type="search"
              aria-label="Buscar a quién asignar"
              placeholder="Buscar…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mb-1 h-8 w-full rounded-md border border-border bg-surface px-2 font-sans text-sm text-text-primary outline-none placeholder:text-text-disabled focus:border-primary"
            />
          )}
          {members.length === 0 ? (
            <p className="px-2 py-1 font-sans text-xs text-text-secondary">
              Este proyecto todavía no tiene a nadie a quien asignar.
            </p>
          ) : (
            members.map((member) => (
              <AssigneeToggle
                key={member.id}
                member={member}
                defaultChecked={initial.includes(member.id)}
                /* Filtrar oculta, no desmonta: ver la nota de la función. */
                hidden={q !== '' && !personLabel(member).toLocaleLowerCase('es').includes(q)}
                onChange={(checked) =>
                  setChosen((all) =>
                    checked ? [...all, member.id] : all.filter((id) => id !== member.id),
                  )
                }
              />
            ))
          )}
          <p className="px-2 pt-1 font-sans text-[11px] text-text-secondary">
            Solo se puede asignar a quien esté en el proyecto.
          </p>
        </fieldset>
      </PickerShell>
    </PropertyRow>
  );
}

/**
 * Etiquetas: las puestas, y las del proyecto al pulsar, con su gestor.
 *
 * ⚠️ Mismo cuidado que los encargados: las casillas no se desmontan nunca.
 *
 * ⚠️ **El `fieldset` cubre solo las casillas, no el gestor.** Va con
 * `disabled={readOnly}`, y un `fieldset` deshabilitado apaga todo lo que tenga
 * dentro, botones incluidos: alguien con `canManageLabels` pero sin
 * `canEditTask` se encontraría el gestor apagado sin motivo.
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
  const [open, setOpen] = useState(false);
  const shown = labels.filter((l) => chosen.includes(l.id));

  return (
    <PropertyRow label="Etiquetas" icon={<TagIcon />}>
      <PickerShell
        open={open}
        setOpen={setOpen}
        /* Con el gestor dentro, la lista se abre aunque no se pueda etiquetar. */
        disabled={readOnly && !canManageLabels}
        toggleLabel="Etiquetas: cambiar"
        summary={
          shown.length === 0 ? (
            <span className="text-text-disabled">Sin etiquetas</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {shown.map((label) => (
                <span
                  key={label.id}
                  className="rounded px-1.5 py-0.5 font-sans text-[11px] font-medium"
                  style={{ background: alpha(colors[label.color], 18), color: colors[label.color] }}
                >
                  {label.name}
                </span>
              ))}
            </span>
          )
        }
      >
        <div className="flex flex-col gap-2">
          <fieldset className="flex min-w-0 flex-col gap-2" disabled={readOnly}>
            <legend className="sr-only">Etiquetas</legend>
            {labels.length === 0 ? (
              <p className="px-1 font-sans text-xs text-text-secondary">
                Este proyecto no tiene etiquetas todavía.
                {canManageLabels ? ' Crea la primera aquí abajo.' : ''}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 rounded-xl p-2" style={SECTION_PANEL}>
                {labels.map((label) => (
                  <LabelToggle
                    key={label.id}
                    label={label}
                    defaultChecked={initial.includes(label.id)}
                    onChange={(checked) =>
                      setChosen((all) =>
                        checked ? [...all, label.id] : all.filter((id) => id !== label.id),
                      )
                    }
                  />
                ))}
              </div>
            )}
          </fieldset>
          {canManageLabels && <GestorDeEtiquetas projectId={projectId} labels={labels} />}
        </div>
      </PickerShell>
    </PropertyRow>
  );
}

/**
 * El botón con el resumen y la lista desplegada debajo, **dentro del panel**
 * —no en un portal, que el panel tomaría por un clic fuera y se cerraría—.
 *
 * La lista cerrada se esconde con `hidden` y no se desmonta: lleva casillas del
 * formulario (ver `AssigneesProperty`).
 */
function PickerShell({
  open,
  setOpen,
  disabled,
  toggleLabel,
  summary,
  children,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  disabled: boolean;
  toggleLabel: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const panelId = useId();
  return (
    <div
      className="flex min-w-0 flex-col"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          swallowEscape(event);
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={toggleLabel}
        onClick={() => setOpen(!open)}
        className="flex min-h-9 w-full min-w-0 cursor-pointer items-center rounded-lg px-2.5 py-1.5 text-left font-sans text-sm text-text-primary transition-colors hover:bg-white/5 disabled:cursor-default disabled:hover:bg-transparent"
      >
        {summary}
      </button>
      {/* Entra con `animate-desplegar-menu` al quitarse `hidden`: una animación
          CSS arranca cada vez que el elemento vuelve a pintarse.
          ⚠️ No `animate-desplegar-panel`: ese deja el contenido con
          `overflow: hidden` y recortaría el desplegable de color del gestor de
          etiquetas, que vive aquí dentro. */}
      <div
        id={panelId}
        hidden={!open}
        className="mt-1 origin-top animate-desplegar-menu rounded-lg border border-white/[0.08] bg-surface-elevated p-2 shadow-lg shadow-black/20"
      >
        {children}
      </div>
    </div>
  );
}

function AssigneeToggle({
  member,
  defaultChecked,
  hidden = false,
  onChange,
}: {
  member: UserProfile;
  defaultChecked: boolean;
  hidden?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      hidden={hidden}
      className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5 has-[:disabled]:cursor-not-allowed"
    >
      <input
        type="checkbox"
        name="assigneeIds"
        value={member.id}
        defaultChecked={defaultChecked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />

      {/* La marca se enciende con `[&>svg]`: los variantes `peer-*` solo miran
          hermanos, y el icono es hijo de este span, no hermano del input. */}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-white/20 transition-colors peer-checked:border-primary peer-checked:bg-primary/25 peer-checked:[&>svg]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-disabled:opacity-50">
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

      <span className="min-w-0 flex-1 truncate font-sans text-sm text-white peer-disabled:text-white">
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
  onChange,
}: {
  label: LabelType;
  defaultChecked: boolean;
  onChange: (checked: boolean) => void;
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
        onChange={(event) => onChange(event.target.checked)}
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
