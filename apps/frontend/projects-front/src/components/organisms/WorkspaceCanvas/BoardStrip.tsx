import type { Board, Task, UserProfile } from '@praxis/commons';
import { BoardColumns } from './BoardColumns';

export interface BoardStripProps {
  board: Board;
  projectId: string;
  canManage: boolean;
  tasks: Task[];
  members: UserProfile[];
  usersById: Map<string, UserProfile>;
  canCreateTask: boolean;
  canEditTask: boolean;
  canDeleteTask: boolean;
}

/**
 * Un tablero con sus columnas.
 *
 * La tira de columnas vive en `BoardColumns`, que es cliente porque gestiona el
 * arrastre. Aquí solo va la cabecera, que no necesita JavaScript.
 */
export function BoardStrip({
  board,
  projectId,
  canManage,
  tasks,
  members,
  usersById,
  canCreateTask,
  canEditTask,
  canDeleteTask,
}: BoardStripProps) {
  const columnCount = board.columns.length;

  return (
    <section
      aria-label={`Tablero ${board.name}`}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-elevated p-5"
    >
      <header className="flex flex-wrap items-baseline gap-3">
        <h4 className="font-sans text-base font-semibold text-text-primary">{board.name}</h4>
        <span className="font-sans text-xs text-text-disabled">
          {columnCount === 0
            ? 'sin columnas'
            : `${columnCount} ${columnCount === 1 ? 'columna' : 'columnas'}`}
          {tasks.length > 0 &&
            ` · ${tasks.length} ${tasks.length === 1 ? 'tarea' : 'tareas'}`}
        </span>
      </header>

      <BoardColumns
        board={board}
        projectId={projectId}
        canManage={canManage}
        tasks={tasks}
        members={members}
        usersById={usersById}
        canCreateTask={canCreateTask}
        canEditTask={canEditTask}
        canDeleteTask={canDeleteTask}
      />
    </section>
  );
}
