import {
  type Label,
  type Task,
  type UserProfile,
  type Workspace,
  alpha,
  colors,
} from '@praxis/commons';
import { BoardStrip } from './BoardStrip';
import { CreateBoardButton } from './CreateBoardButton';
import { DeleteWorkspaceButton } from './DeleteWorkspaceButton';
import { WorkspacePicker } from './WorkspacePicker';

export interface WorkspaceCanvasProps {
  projectId: string;
  workspaces: Workspace[];
  /** Espacio abierto, resuelto en la page desde `?ws=`. */
  activeWorkspace: Workspace | null;
  canManage: boolean;
  /** Tareas del espacio abierto, agrupadas por tablero. */
  tasksByBoard: Map<string, Task[]>;
  members: UserProfile[];
  labels: Label[];
  usersById: Map<string, UserProfile>;
  canCreateTask: boolean;
  canEditTask: boolean;
  canDeleteTask: boolean;
}

/**
 * Espacios de trabajo: se elige uno y se trabaja dentro.
 *
 * La primera versión ponía todos los espacios como tarjetas en una fila.
 * Quedaban apretadas, con demasiado borde, y aun así había que entrar en cada
 * una para ver qué contenía. Ahora el selector ocupa una línea y todo el
 * espacio útil es el contenido del espacio abierto: sus tableros con sus
 * columnas.
 *
 * Todo sale de `GET /projects/:id`, que ya trae espacios → tableros → columnas
 * embebidos: ninguna petición extra por cambiar de espacio.
 */
export function WorkspaceCanvas({
  projectId,
  workspaces,
  activeWorkspace,
  canManage,
  tasksByBoard,
  members,
  labels,
  usersById,
  canCreateTask,
  canEditTask,
  canDeleteTask,
}: WorkspaceCanvasProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <WorkspacePicker
          projectId={projectId}
          workspaces={workspaces}
          activeId={activeWorkspace?.id ?? ''}
          canManage={canManage}
        />

        {activeWorkspace && canManage && (
          <div className="flex items-center gap-2">
            <CreateBoardButton workspaceId={activeWorkspace.id} projectId={projectId} />
            <DeleteWorkspaceButton projectId={projectId} workspace={activeWorkspace} />
          </div>
        )}
      </div>

      {!activeWorkspace ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-6 py-16 text-center">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: alpha(colors.accent, 12), color: colors.accent }}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </span>
          <h3 className="font-display text-2xl text-text-primary">Ningún espacio todavía</h3>
          <p className="max-w-md font-sans text-sm text-text-secondary">
            Un espacio agrupa tableros: uno por equipo, por fase o por lo que le convenga a este
            proyecto.{' '}
            {canManage
              ? 'Créalo desde el selector de arriba.'
              : 'Quien administre el proyecto puede crear el primero.'}
          </p>
        </div>
      ) : activeWorkspace.boards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-6 py-16 text-center">
          <h3 className="font-display text-2xl text-text-primary">
            «{activeWorkspace.name}» está vacío
          </h3>
          <p className="max-w-md font-sans text-sm text-text-secondary">
            Un tablero organiza el trabajo en columnas.{' '}
            {canManage ? 'Crea el primero desde el botón de arriba.' : ''}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {activeWorkspace.boards.map((board) => (
            <BoardStrip
              key={board.id}
              board={board}
              projectId={projectId}
              canManage={canManage}
              tasks={tasksByBoard.get(board.id) ?? []}
              members={members}
              labels={labels}
              usersById={usersById}
              canCreateTask={canCreateTask}
              canEditTask={canEditTask}
              canDeleteTask={canDeleteTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}
