'use client';

import {
  addChecklistItemAction,
  deleteChecklistItemAction,
  toggleChecklistItemAction,
  updateChecklistItemAction,
} from '@/app/(privado)/projects/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  type AgentKind,
  AuthorFaces,
  Input,
  ProgressBar,
  type Task,
  type UserProfile,
  alpha,
  avatarHref,
  checklistProgress,
  colors,
  personLabel,
  useAccion,
  useEsMovil,
} from '@praxis/commons';
import { Pencil, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  SECTION_BODY_CLASS,
  SECTION_CLASS,
  SECTION_COUNT_CLASS,
  SECTION_TITLE_CLASS,
} from './section-panel';

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
  /** Para poner cara a quien marcó cada paso. */
  usersById: Map<string, UserProfile>;
  currentUserId: string;
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
export function TaskChecklist({
  projectId,
  task,
  canEdit,
  canToggle,
  usersById,
  currentUserId,
}: TaskChecklistProps) {
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
    <section className={SECTION_CLASS}>
      <header className="flex min-h-6 items-center justify-between gap-3 px-1">
        <h4 className={SECTION_TITLE_CLASS}>
          Checklist
          {total > 0 && (
            <span className={SECTION_COUNT_CLASS}>
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

      <div className={SECTION_BODY_CLASS}>
        {total === 0 && (
          <p className="font-sans text-xs text-text-secondary">
            {canEdit
              ? 'Divide la tarea en pasos concretos para ver el avance de un vistazo.'
              : 'Esta tarea no tiene checklist.'}
          </p>
        )}

        {task.checklists.length > 0 && (
          <ul className="flex flex-col gap-0.5">
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
                completedBy={
                  item.completed && item.completedById
                    ? {
                        user: usersById.get(item.completedById),
                        mine: item.completedById === currentUserId,
                        via: item.completedVia ?? null,
                      }
                    : null
                }
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
              className="w-full rounded-xl border border-white/[0.11] bg-white/[0.05] px-3 py-2 pr-11 font-sans text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary hover:border-white/[0.2] focus:border-primary/70 focus:bg-white/[0.07]"
            />
            <button
              type="submit"
              disabled={adding}
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-primary text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
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
      </div>
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
  completedBy,
}: {
  projectId: string;
  taskId: string;
  itemId: string;
  text: string;
  completed: boolean;
  canEdit: boolean;
  canToggle: boolean;
  /** Quién lo marcó; `null` si no se sabe (sin marcar, o marcado antes del registro). */
  completedBy: { user: UserProfile | undefined; mine: boolean; via: AgentKind | null } | null;
}) {
  const [toggleState, toggleAction, toggling] = useAccion(
    toggleChecklistItemAction,
    TASK_INITIAL_STATE,
  );
  const [deleteState, deleteAction, deleting] = useAccion(
    deleteChecklistItemAction,
    TASK_INITIAL_STATE,
  );
  const [updateState, updateAction, updating] = useAccion(
    updateChecklistItemAction,
    TASK_INITIAL_STATE,
  );
  const esMovil = useEsMovil();
  const formularioDeMarcar = useRef<HTMLFormElement>(null);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(text);
  const error = toggleState.error ?? deleteState.error ?? updateState.error;

  /**
   * ¿El texto ocupa más de una línea? Decide dónde van las caras de quien lo marcó.
   *
   * Con una línea no hay hueco bajo los iconos de editar y eliminar, y ponerlas debajo
   * estiraría la fila; se quedan a la izquierda de los iconos, en su misma línea. Con
   * varias, el hueco existe y ahí caben, bajo los iconos y sin tocar el alto de la fila.
   * Se mide y no se adivina por la longitud: el ancho del panel y el tamaño de letra
   * cambian cuántos caracteres caben.
   */
  const textoRef = useRef<HTMLSpanElement>(null);
  const [variasLineas, setVariasLineas] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: hay que volver a medir al cambiar el texto o salir de la edición
  useLayoutEffect(() => {
    const el = textoRef.current;
    if (!el) return;
    const medir = () => {
      const estilo = getComputedStyle(el);
      const linea = Number.parseFloat(estilo.lineHeight) || 18;
      const relleno =
        Number.parseFloat(estilo.paddingTop) + Number.parseFloat(estilo.paddingBottom);
      setVariasLineas((el.getBoundingClientRect().height - relleno) / linea > 1.5);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [text, editando]);

  const caras = completedBy && (
    <AuthorFaces
      size="xs"
      label={completedBy.user ? personLabel(completedBy.user) : 'Alguien del equipo'}
      src={avatarHref(completedBy.user?.avatarUrl, '/api/gateway')}
      mine={completedBy.mine}
      via={completedBy.via}
      verb="Marcado por"
    />
  );

  /* Al desmontarse el campo el navegador puede disparar un `blur` tardío con el cierre de antes:
     sin esto, Enter guardaba dos veces y Escape —que cancela— acababa guardando. */
  const edicionCerrada = useRef(true);

  function empezarAEditar() {
    setBorrador(text);
    edicionCerrada.current = false;
    setEditando(true);
  }

  /**
   * Guarda y sale de la edición. Sin cambios, o vacío, solo sale: un paso vacío no existe (para
   * quitarlo está la cruz), y mandar el mismo texto sería una petición para nada.
   *
   * ⚠️ Con `onSubmit` + `FormData` a mano y no `<form action>`: React 19 resetea los formularios
   * de acción al terminar y el campo volvería al texto de antes de editar (ver CLAUDE.md).
   */
  function guardar() {
    if (edicionCerrada.current) return;
    edicionCerrada.current = true;
    const nuevo = borrador.trim();
    setEditando(false);
    if (!nuevo || nuevo === text) return;
    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('taskId', taskId);
    datos.set('itemId', itemId);
    datos.set('text', nuevo);
    updateAction(datos);
  }

  return (
    <li className="group flex items-start gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-white/5">
      <form
        ref={formularioDeMarcar}
        action={toggleAction}
        className="flex min-w-0 flex-1 items-start gap-2.5"
      >
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
          className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed"
          style={{
            borderColor: completed ? colors.success : 'var(--color-border-strong)',
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

        {/* El texto entero, partido en las líneas que haga falta: un paso puede ser una
            frase de varias líneas y cortarlo con «…» lo hacía ilegible (el `title` no
            existe en táctil). Lo hecho se apaga, además de tacharse. */}
        {editando ? (
          <textarea
            // biome-ignore lint/a11y/noAutofocus: se entra a editar a propósito, y el foco es lo esperado
            autoFocus
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onFocus={(e) => e.currentTarget.setSelectionRange(borrador.length, borrador.length)}
            onBlur={guardar}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                guardar();
              }
              if (e.key === 'Escape') {
                /* Solo cancela la edición: sin esto, Escape cerraría el panel de la tarea. */
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                edicionCerrada.current = true;
                setBorrador(text);
                setEditando(false);
              }
            }}
            maxLength={500}
            rows={Math.min(6, Math.max(1, Math.ceil(borrador.length / 48)))}
            aria-label="Editar paso"
            className="min-w-0 flex-1 resize-none rounded-md border border-white/[0.2] bg-white/[0.06] px-2 py-1 font-sans text-[13px] leading-snug text-white outline-none focus:border-primary/70"
          />
        ) : (
          // biome-ignore lint/a11y/useKeyWithClickEvents: ampliar la zona de toque en móvil; con teclado se marca con el botón de al lado, que ya es accesible
          <span
            ref={textoRef}
            onDoubleClick={canEdit ? empezarAEditar : undefined}
            /* En móvil el paso entero es la zona de toque —no solo el cuadradito de 18 px—, con
               el alto de un dedo. En escritorio el texto no marca: el doble clic lo edita. */
            onClick={
              esMovil && canToggle && !toggling
                ? () => formularioDeMarcar.current?.requestSubmit()
                : undefined
            }
            className={[
              'min-w-0 flex-1 whitespace-pre-wrap break-words font-sans text-[13px] leading-snug',
              esMovil && canToggle ? 'min-h-8 cursor-pointer py-1.5' : '',
              completed ? 'text-text-secondary line-through' : 'text-white',
            ].join(' ')}
          >
            {text}
          </span>
        )}
      </form>

      {/* A la derecha, en una columna: los iconos arriba y, si el texto es de varias líneas,
          las caras de quien lo marcó debajo, en el hueco que dejan. */}
      {/* ⚠️ Ancho **fijo**: si las caras cambiaran el ancho del bloque según vayan al lado o
          debajo, el texto tendría más o menos sitio, cambiaría de una a dos líneas, y eso
          volvería a moverlas: un bucle que no termina. Reservar el ancho de los dos casos
          lo corta de raíz. */}
      <div
        className="flex shrink-0 flex-col items-end gap-1"
        style={{
          minWidth:
            (canEdit ? 52 : 0) +
            (completedBy ? (completedBy.via ? 36 : 20) + (canEdit ? 4 : 0) : 0),
        }}
      >
        <div className="flex items-center gap-0.5">
          {canEdit && !editando && (
            <button
              type="button"
              onClick={empezarAEditar}
              disabled={updating}
              aria-label={`Editar «${text}»`}
              title="Editar"
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-white opacity-0 transition-opacity hover:bg-white/10 hover:text-primary focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed [@media(hover:none)]:opacity-60"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

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
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-white opacity-0 transition-opacity hover:bg-white/10 hover:text-error focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed [@media(hover:none)]:opacity-60"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </form>
          )}
          {!variasLineas && caras && <span className="ml-1">{caras}</span>}
        </div>
        {variasLineas && caras && <span>{caras}</span>}
      </div>

      {error && (
        <span role="alert" className="font-sans text-[11px]" style={{ color: colors.error }}>
          {error}
        </span>
      )}
    </li>
  );
}
