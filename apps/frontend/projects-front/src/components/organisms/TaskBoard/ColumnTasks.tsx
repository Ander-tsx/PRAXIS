'use client';

import type { Column, Task, UserProfile } from '@praxis/commons';
import { alpha, colors } from '@praxis/commons';
import { useEffect, useState } from 'react';
import { TaskCard } from './TaskCard';
import { TaskDialog } from './TaskDialog';

export interface ColumnTasksProps {
  projectId: string;
  boardId: string;
  column: Column;
  tasks: Task[];
  members: UserProfile[];
  usersById: Map<string, UserProfile>;
  canCreate: boolean;
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
  usersById,
  canCreate,
  canEdit,
  canDelete,
  draggingTaskId,
  onDragTask,
  onDropTask,
}: ColumnTasksProps) {
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [isOver, setIsOver] = useState(false);

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
              draggable={canEdit}
              isDragging={draggingTaskId === task.id}
              onDragStart={() => onDragTask(task.id)}
              onDragEnd={() => onDragTask(null)}
            />
          ))
        )}

        {canCreate && (
          <button
            type="button"
            onClick={() => setCreating(true)}
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
        )}
      </div>

      {creating && (
        <TaskDialog
          open
          onClose={() => setCreating(false)}
          projectId={projectId}
          boardId={boardId}
          columnId={column.id}
          columnName={column.name}
          task={null}
          members={members}
          canEdit={canCreate}
          canDelete={false}
        />
      )}

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
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}
    </>
  );
}
