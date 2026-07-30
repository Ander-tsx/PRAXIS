'use client';

import type { Column, Label, Task, UserProfile } from '@praxis/commons';
import { DONE_COLUMN_COLOR, alpha, colors } from '@praxis/commons';
import { useActionState, useEffect, useRef, useState } from 'react';
import { createTaskAction } from '@/app/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/action-state';
import { TaskCard } from './TaskCard';
import { TaskDialog } from './TaskDialog';

export interface ColumnTasksProps {
  projectId: string;
  boardId: string;
  column: Column;
  tasks: Task[];
  members: UserProfile[];
  labels: Label[];
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  canCreate: boolean;
  /** Arrastrar la tarjeta a otra columna: `canMoveTask`. */
  canMove: boolean;
  /** Tarea a abrir al entrar, si está en esta columna. Llega de la URL. */
  openTaskId?: string | null;
  canEdit: boolean;
  canDelete: boolean;
  /** Tarea que se está arrastrando, compartida por todas las columnas. */
  draggingTaskId: string | null;
  onDragTask: (taskId: string | null) => void;
  /** La suelta la gestiona el tablero, que conoce todas las columnas. */
  onDropTask: (columnId: string) => void;
}

/**
 * Las tareas de una columna, más el botón de añadir.
 *
 * Es la zona de suelta del arrastre entre columnas: el `onDrop` está aquí y no
 * en cada tarjeta, para que se pueda soltar en el hueco vacío de una columna
 * sin tareas, que es justo el caso más común al empezar.
 */
export function ColumnTasks({
  projectId,
  boardId,
  column,
  tasks,
  members,
  labels,
  usersById,
  currentUserId,
  canCreate,
  canMove,
  openTaskId,
  canEdit,
  canDelete,
  draggingTaskId,
  onDragTask,
  onDropTask,
}: ColumnTasksProps) {
  /**
   * Si la URL pide una tarea y está en esta columna, se abre ya en el primer
   * render: hacerlo en un `useEffect` mostraría el tablero y el diálogo saltando
   * encima un instante después.
   */
  const [openTask, setOpenTask] = useState<Task | null>(
    () => tasks.find((task) => task.id === openTaskId) ?? null,
  );
  const [isOver, setIsOver] = useState(false);

  /** Columna de cierre: lo que hay dentro está entregado. Ver `DONE_COLUMN_COLOR`. */
  const isDoneColumn = column.color === DONE_COLUMN_COLOR;

  /**
   * El diálogo abierto se reengancha a la tarea recién revalidada.
   *
   * Sin esto, tras guardar un cambio el diálogo seguiría enseñando el objeto
   * viejo: la página revalida y llegan tareas nuevas, pero `openTask` guarda la
   * instancia con la que se abrió.
   */
  useEffect(() => {
    if (!openTask) return;
    const fresh = tasks.find((task) => task.id === openTask.id);
    if (fresh && fresh !== openTask) setOpenTask(fresh);
    if (!fresh) setOpenTask(null);
  }, [tasks, openTask]);

  return (
    <>
      <div
        onDragOver={(event) => {
          // Solo si lo que viaja es una tarea: si es una columna, este handler
          // no debe interferir con su reordenado.
          if (!draggingTaskId) return;
          event.preventDefault();
          event.stopPropagation();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(event) => {
          if (!draggingTaskId) return;
          event.preventDefault();
          event.stopPropagation();
          setIsOver(false);
          onDropTask(column.id);
        }}
        className="flex flex-col gap-2 rounded-xl px-2 pb-2 transition-colors"
        style={{
          background: isOver ? alpha(colors.primary, 10) : 'transparent',
          outline: isOver ? `1px dashed ${alpha(colors.primary, 45)}` : 'none',
        }}
      >
        {tasks.length === 0 ? (
          <div
            className="flex min-h-24 items-center justify-center rounded-lg"
            style={{ background: alpha(colors.background, 50) }}
          >
            <span className="font-sans text-xs text-text-disabled">
              {isOver ? 'Suelta aquí' : 'Sin tareas'}
            </span>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              usersById={usersById}
              onOpen={() => setOpenTask(task)}
              canEdit={canEdit}
              isDone={isDoneColumn}
              draggable={canMove}
              isDragging={draggingTaskId === task.id}
              onDragStart={() => onDragTask(task.id)}
              onDragEnd={() => onDragTask(null)}
            />
          ))
        )}

        {canCreate && (
          <NewTaskInline
            projectId={projectId}
            boardId={boardId}
            columnId={column.id}
            columnName={column.name}
          />
        )}
      </div>

      {openTask && (
        <TaskDialog
          /* Remonta el formulario al cambiar de tarea: los campos son no
             controlados y sin esto conservarían los valores de la anterior. */
          key={openTask.id}
          open
          onClose={() => setOpenTask(null)}
          projectId={projectId}
          boardId={boardId}
          columnId={openTask.columnId}
          columnName={column.name}
          task={openTask}
          members={members}
          labels={labels}
          usersById={usersById}
          currentUserId={currentUserId}
          /* Marcar pasos va con mover: las dos son ejecutar la tarea. */
          canToggleChecklist={canMove}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}
    </>
  );
}

/**
 * Crear una tarea desde la propia columna: solo el título.
 *
 * Antes «Añadir tarea» abría el diálogo completo, con descripción, prioridad,
 * fecha, etiquetas y encargados. Para anotar tres cosas seguidas eso es una
 * ventana modal por tarea, y las tareas se apuntan en ráfaga: primero se
 * vuelcan, luego se detallan. El resto se rellena abriendo la tarjeta.
 *
 * Nace con prioridad **media**, que ya es el valor por defecto del backend, así
 * que `priority` no se manda: mandarlo obligaría a mantener aquí un valor que ya
 * está definido en el DTO, y los dos se desincronizarían.
 *
 * Igual que en `AddColumnCard`: el campo se vacía y **mantiene el foco** cuando
 * el servidor confirma, para escribir la siguiente sin tocar el ratón. Vaciarlo
 * al enviar perdería lo escrito si la petición falla.
 */
function NewTaskInline({
  projectId,
  boardId,
  columnId,
  columnName,
}: {
  projectId: string;
  boardId: string;
  columnId: string;
  /** `status` tiene que igualar el nombre de la columna, no su id. */
  columnName: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [state, formAction, pending] = useActionState(createTaskAction, TASK_INITIAL_STATE);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (state.done) {
      setTitle('');
      inputRef.current?.focus();
    }
  }, [state.done]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 font-sans text-xs text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Añadir tarea
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-xl bg-background p-2"
      style={{ boxShadow: `0 1px 0 ${alpha(colors.border, 40)}` }}
      noValidate
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="columnId" value={columnId} />
      <input type="hidden" name="status" value={columnName} />

      <input
        ref={inputRef}
        name="title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        /* Sin nada escrito, salir del campo cierra: dejar un formulario abierto
           y vacío en la columna solo estorba. */
        onBlur={() => !title.trim() && setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            return;
          }
          /**
           * Enter envía, explícitamente.
           *
           * Un `<input>` en un formulario con botón de envío ya lo hace solo
           * («implicit submission»), pero aquí es la tecla que sostiene todo el
           * gesto —escribir varias tareas seguidas sin tocar el ratón—, así que
           * no se deja a un comportamiento implícito. `preventDefault` evita que
           * en un navegador normal se envíe dos veces.
           */
          if (event.key === 'Enter' && title.trim() && !pending) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        maxLength={255}
        placeholder="Qué hay que hacer"
        autoComplete="off"
        aria-label={`Título de la tarea nueva en ${columnName}`}
        className="h-9 rounded-lg border border-border bg-surface px-2.5 font-sans text-xs text-text-primary outline-none placeholder:text-text-disabled focus:border-primary"
      />

      <div className="flex items-center gap-1.5">
        <button
          type="submit"
          disabled={!title.trim() || pending}
          className="cursor-pointer rounded-lg px-2.5 py-1.5 font-sans text-xs font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: colors.primary }}
        >
          {pending ? 'Creando…' : 'Crear'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer rounded-lg px-2 py-1.5 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary"
        >
          Cancelar
        </button>
        <span className="ml-auto pr-1 font-sans text-[10px] text-text-disabled">
          Prioridad media
        </span>
      </div>

      {state.error && (
        <p role="alert" className="font-sans text-[11px]" style={{ color: colors.error }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
