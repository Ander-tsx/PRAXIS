import {
  type Label,
  type Task,
  type UserProfile,
  type Workspace,
  alpha,
  colors,
} from '@praxis/commons';
import type { ReactNode } from 'react';
import { BoardStrip } from './BoardStrip';
import { CreateBoardButton } from './CreateBoardButton';
import { WorkspacePicker } from './WorkspacePicker';

export interface WorkspaceCanvasProps {
  /**
   * El control de «solo mis tareas». Va al lado de «Ampliar» en cada tablero.
   *
   * Slot y no un booleano: lo construye la page, que es quien sabe cuántas hay
   * y a qué URL lleva. Aquí solo se coloca.
   */
  filtroMisTareas?: ReactNode;
  projectId: string;
  /** Solo para navegar; las acciones siguen usando `projectId`. */
  projectSlug: string;
  workspaces: Workspace[];
  /** Espacio abierto, resuelto en la page desde `?ws=`. */
  activeWorkspace: Workspace | null;
  canManage: boolean;
  /** Renombrar espacios y tableros: `canEditBoard`. */
  canEditBoard: boolean;
  /** Eliminar espacios y tableros: `canDeleteBoard`. */
  canDeleteBoard: boolean;
  /** Crear y reordenar columnas: `canCreateColumn`. */
  canCreateColumn: boolean;
  /** Renombrar y recolorear columnas: `canEditColumn`. */
  canEditColumn: boolean;
  /** Eliminar una columna con sus tareas: `canDeleteColumn`. */
  canDeleteColumn: boolean;
  /** Tareas del espacio abierto, agrupadas por tablero. */
  tasksByBoard: Map<string, Task[]>;
  members: UserProfile[];
  labels: Label[];
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  canCreateTask: boolean;
  /**
   * Tarea que hay que abrir nada más entrar, si llega en la URL.
   *
   * Viene de un aviso del panel: aterrizar en el tablero correcto y tener que
   * buscar la tarjeta a ojo deja el trabajo a medias.
   */
  openTaskId?: string | null;
  /** Arrastrar una tarjeta a otra columna: `canMoveTask`. */
  canMoveTask: boolean;
  /** Comentar en una tarea: `canComment`, no `canEditTask`. */
  canComment: boolean;
  /** Gestionar las etiquetas del proyecto desde el diálogo de tarea: `canManageLabels`. */
  canManageLabels: boolean;
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
  filtroMisTareas,
  projectSlug,
  workspaces,
  activeWorkspace,
  canManage,
  canEditBoard,
  canDeleteBoard,
  canCreateColumn,
  canEditColumn,
  canDeleteColumn,
  tasksByBoard,
  members,
  labels,
  usersById,
  currentUserId,
  canCreateTask,
  canMoveTask,
  openTaskId,
  canComment,
  canManageLabels,
  canEditTask,
  canDeleteTask,
}: WorkspaceCanvasProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <WorkspacePicker
          projectId={projectId}
          projectSlug={projectSlug}
          workspaces={workspaces}
          activeId={activeWorkspace?.id ?? ''}
          canManage={canManage}
          canEditBoard={canEditBoard}
          canDeleteBoard={canDeleteBoard}
        />

        {/* Solo queda «Nuevo tablero». Renombrar y eliminar el espacio se
            fueron **dentro del selector**, a la fila del espacio al que
            afectan: eran dos botones fijos para acciones que se usan una vez
            cada muchas semanas, y «Eliminar espacio» además actuaba sobre «el
            activo», que había que deducir mirando a otra parte. */}
        {activeWorkspace && canManage && (
          <CreateBoardButton workspaceId={activeWorkspace.id} projectId={projectId} />
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
              filtroMisTareas={filtroMisTareas}
              projectId={projectId}
              canEditBoard={canEditBoard}
              canDeleteBoard={canDeleteBoard}
              canCreateColumn={canCreateColumn}
              canEditColumn={canEditColumn}
              canDeleteColumn={canDeleteColumn}
              tasks={tasksByBoard.get(board.id) ?? []}
              members={members}
              labels={labels}
              usersById={usersById}
              currentUserId={currentUserId}
              canCreateTask={canCreateTask}
              canMoveTask={canMoveTask}
              openTaskId={openTaskId}
              canComment={canComment}
              canManageLabels={canManageLabels}
              canEditTask={canEditTask}
              canDeleteTask={canDeleteTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}
