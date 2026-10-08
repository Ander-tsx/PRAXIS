'use client';

import {
  addCommentAction,
  deleteCommentAction,
  editCommentAction,
} from '@/app/(privado)/projects/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  type TaskComment,
  type UserProfile,
  alpha,
  colors,
  personLabel,
  useAccion,
} from '@praxis/commons';
import { useEffect, useRef, useState } from 'react';
import {
  SECTION_BODY_CLASS,
  SECTION_CLASS,
  SECTION_COUNT_CLASS,
  SECTION_PANEL,
  SECTION_TITLE_CLASS,
} from './section-panel';
import { NotesGlyph } from './task-marks';

/**
 * «Editar» y «Eliminar» de una nota: mismo tamaño y mismo relleno.
 *
 * Compartir la clase es la mitad del arreglo de la alineación; la otra es que el
 * formulario de «Eliminar» no ocupe caja (ver `contents` más abajo).
 */
const ACTION_BUTTON =
  'cursor-pointer rounded px-1 py-0.5 font-sans text-[11px] leading-none text-white transition-colors hover:text-white';

export interface TaskNotesProps {
  projectId: string;
  taskId: string;
  comments: TaskComment[];
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  /** `canComment`, que desde `d0c67f2` es un permiso propio y no `canEditTask`. */
  canComment: boolean;
  /** Quien puede eliminar tareas puede retirar notas ajenas. */
  canModerate: boolean;
}

/**
 * Las **notas** de una tarea.
 *
 * ## Por qué se llaman notas y no comentarios
 *
 * Es el mismo hilo y el mismo endpoint —`/tasks/:id/comments`—, con otra
 * orientación: en Scrum lo que se escribe aquí es **por qué esta tarea sigue
 * viva**. Se arrastró de un sprint al otro, se pospuso, quedó bloqueada
 * esperando a alguien. Un «comentario» invita a opinar; una «nota» invita a
 * dejar constancia, que es lo que hace falta al revisar el tablero.
 *
 * ⚠️ **El cambio de nombre es SOLO texto visible.** `TaskComment`,
 * `addCommentAction`, `canComment` y la ruta siguen llamándose comentario,
 * porque así se llaman en el backend y renombrarlos aquí abriría dos
 * vocabularios para la misma cosa. Es exactamente el caso que CLAUDE.md acota
 * al hablar del `sed` global: una palabra del español corriente no se renombra
 * de lado a lado.
 *
 * ## Estuvo escondida, no borrada
 *
 * El componente existía entero y `TaskDialog` recibía `canComment` y lo
 * pasaba... a ninguna parte: la sección se dejó de pintar en algún momento y el
 * resto de la fontanería se quedó puesta. Nada fallaba —un componente que no se
 * monta no da error—, así que volvió con un `<TaskNotes …>` en el diálogo y sin
 * tocar el servidor.
 *
 * Cada nota es su propio formulario, como los ítems del checklist y por el
 * mismo motivo: van fuera del formulario de la tarea y cada uno tiene su propio
 * estado de envío.
 *
 * Se lee de arriba abajo, de la más antigua a la más nueva, con el campo de
 * escritura al final: es donde acaba la vista después de leer el hilo.
 */
export function TaskNotes({
  projectId,
  taskId,
  comments,
  usersById,
  currentUserId,
  canComment,
  canModerate,
}: TaskNotesProps) {
  const [state, formAction, pending] = useAccion(addCommentAction, TASK_INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  /** Se vacía al confirmar, no al enviar: si falla, lo escrito sigue ahí. */
  useEffect(() => {
    if (state.done) formRef.current?.reset();
  }, [state]);

  return (
    <section className={SECTION_CLASS}>
      <h4 className={`${SECTION_TITLE_CLASS} px-1`}>
        <NotesGlyph className="h-3.5 w-3.5" />
        Notas{' '}
        {comments.length > 0 && <span className={SECTION_COUNT_CLASS}>{comments.length}</span>}
      </h4>

      <div className={SECTION_BODY_CLASS}>
        {comments.length === 0 && (
          <p className="font-sans text-xs text-text-secondary">
            {canComment
              ? 'Sin notas todavía. Deja aquí por qué la tarea se movió, se aplazó o está esperando.'
              : 'Esta tarea no tiene notas.'}
          </p>
        )}

        {comments.length > 0 && (
          <ul className="flex flex-col gap-3">
            {comments.map((comment) => (
              <NoteRow
                key={comment.id}
                comment={comment}
                author={usersById.get(comment.authorId)}
                projectId={projectId}
                taskId={taskId}
                canEdit={comment.authorId === currentUserId}
                canDelete={comment.authorId === currentUserId || canModerate}
              />
            ))}
          </ul>
        )}

        {canComment ? (
          <form ref={formRef} action={formAction} className="flex flex-col gap-2" noValidate>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="taskId" value={taskId} />
            <textarea
              name="body"
              rows={2}
              maxLength={4000}
              placeholder="Escribe una nota…"
              aria-label="Nueva nota"
              className="w-full resize-y rounded-xl border border-white/[0.11] bg-white/[0.05] px-3 py-2 font-sans text-sm text-text-primary hover:border-white/[0.2] placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <span className="flex justify-end">
              <button
                type="submit"
                disabled={pending}
                className="cursor-pointer rounded-lg px-3 py-1.5 font-sans text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: alpha(colors.primary, 20) }}
              >
                {pending ? 'Guardando…' : 'Añadir nota'}
              </button>
            </span>
          </form>
        ) : (
          <p className="font-sans text-xs text-text-secondary">
            Puedes leer las notas, pero no tienes permiso para escribir.
          </p>
        )}

        {state.error && (
          <p role="alert" className="font-sans text-xs" style={{ color: colors.error }}>
            {state.error}
          </p>
        )}
      </div>
    </section>
  );
}

function NoteRow({
  comment,
  author,
  projectId,
  taskId,
  canEdit,
  canDelete,
}: {
  comment: TaskComment;
  author: UserProfile | undefined;
  projectId: string;
  taskId: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction, saving] = useAccion(editCommentAction, TASK_INITIAL_STATE);
  const [deleteState, deleteAction, deleting] = useAccion(deleteCommentAction, TASK_INITIAL_STATE);

  /** Sale del modo edición cuando el servidor confirma, no al enviar. */
  useEffect(() => {
    if (editState.done) setEditing(false);
  }, [editState]);

  const name = author ? personLabel(author) : 'Alguien que ya no está en el proyecto';
  const error = editState.error ?? deleteState.error;

  return (
    <li className="flex flex-col gap-1.5 rounded-xl p-3" style={SECTION_PANEL}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-sans text-xs font-semibold text-white">{name}</span>
        <span className="font-sans text-[11px] text-white">
          {formatWhen(comment.createdAt)}
          {comment.editedAt && ' · editado'}
        </span>

        <span className="ml-auto flex items-center gap-1">
          {canEdit && !editing && (
            <button type="button" onClick={() => setEditing(true)} className={ACTION_BUTTON}>
              Editar
            </button>
          )}
          {canDelete && (
            /**
             * `contents`: el formulario desaparece de la maquetación y su botón
             * pasa a ser hijo directo del flex de fuera.
             *
             * «Eliminar» necesita un formulario —tiene su propia acción de
             * servidor— y «Editar» no, así que uno era un bloque y el otro un
             * botón suelto: no compartían línea y «Editar» quedaba más arriba.
             * Con esto los dos son el mismo tipo de hijo y se alinean solos, sin
             * márgenes de compensación que se descuadran al cambiar el texto.
             */
            <form action={deleteAction} className="contents">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="commentId" value={comment.id} />
              <button
                type="submit"
                disabled={deleting}
                className={`${ACTION_BUTTON} hover:text-error disabled:cursor-not-allowed`}
              >
                {deleting ? '…' : 'Eliminar'}
              </button>
            </form>
          )}
        </span>
      </div>

      {editing ? (
        <form action={editAction} className="flex flex-col gap-2" noValidate>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="commentId" value={comment.id} />
          <textarea
            name="body"
            rows={2}
            maxLength={4000}
            defaultValue={comment.body}
            aria-label="Editar nota"
            className="w-full resize-y rounded-xl border border-white/[0.11] bg-white/[0.05] px-3 py-2 font-sans text-sm text-text-primary hover:border-white/[0.2] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <span className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer rounded px-2 py-1 font-sans text-[11px] font-semibold text-white disabled:opacity-50"
              style={{ background: alpha(colors.primary, 20) }}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="cursor-pointer rounded px-2 py-1 font-sans text-[11px] text-white"
            >
              Cancelar
            </button>
          </span>
        </form>
      ) : (
        /* `whitespace-pre-wrap`: los saltos de línea que escribió la persona se
           respetan sin interpretar nada más. Nunca se renderiza como HTML. */
        <p className="whitespace-pre-wrap break-words font-sans text-xs text-white">
          {comment.body}
        </p>
      )}

      {error && (
        <p role="alert" className="font-sans text-[11px]" style={{ color: colors.error }}>
          {error}
        </p>
      )}
    </li>
  );
}

/** «hace un momento» pesa menos que una marca de tiempo completa. */
function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60_000);

  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  if (mins < 1440) return `hace ${Math.round(mins / 60)} h`;
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
