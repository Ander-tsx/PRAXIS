import type { Board, Label, Task, UserProfile } from '@praxis/commons';
import { alpha, colors } from '@praxis/commons';
import { BoardColumns } from './BoardColumns';

export interface BoardStripProps {
  board: Board;
  projectId: string;
  /** Crear y reordenar columnas: `canCreateColumn`. */
  canCreateColumn: boolean;
  /** Renombrar y recolorear columnas: `canEditColumn`. */
  canEditColumn: boolean;
  /** Eliminar una columna con sus tareas: `canDeleteColumn`. */
  canDeleteColumn: boolean;
  tasks: Task[];
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
  canEditTask: boolean;
  canDeleteTask: boolean;
}

/**
 * Un tablero con sus columnas.
 *
 * La tira de columnas vive en `BoardColumns`, que es cliente porque gestiona el
 * arrastre. Aquí solo va la cabecera, que no necesita JavaScript.
 */
/**
 * Superficie del tablero: `surface-elevated` con una retícula de puntos encima.
 *
 * La retícula es la de cualquier pizarra y hace el trabajo sola: dice que ahí
 * dentro las cosas se mueven, sin necesidad de bajar el tono del lienzo. Se
 * probó con el color del selector de espacio y el tablero perdía presencia
 * frente al resto de la pantalla.
 *
 * Van los dos fondos en una sola propiedad porque el orden importa: la retícula
 * primero y el color detrás, o el color taparía los puntos.
 */
const BOARD_SURFACE = {
  background: `radial-gradient(${alpha(colors.borderStrong, 60)} 1px, transparent 1px), ${colors.surfaceElevated}`,
  backgroundSize: '22px 22px',
  /* Medio paso: así ningún punto cae justo en la esquina redondeada. */
  backgroundPosition: '11px 11px',
} as const;

export function BoardStrip({
  board,
  projectId,
  canCreateColumn,
  canEditColumn,
  canDeleteColumn,
  tasks,
  members,
  labels,
  usersById,
  currentUserId,
  canCreateTask,
  canMoveTask,
  openTaskId,
  canComment,
  canEditTask,
  canDeleteTask,
}: BoardStripProps) {
  const columnCount = board.columns.length;

  return (
    <section
      aria-label={`Tablero ${board.name}`}
      className="flex flex-col gap-4 rounded-2xl border border-border p-5"
      style={BOARD_SURFACE}
    >
      <header className="flex flex-wrap items-baseline gap-3">
        <h4 className="font-sans text-base font-semibold text-text-primary">{board.name}</h4>
        {/* Más contraste que antes: sobre el fondo del lienzo, `text-disabled`
            se leía como un borrón. */}
        <span className="font-sans text-xs text-text-secondary">
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
        canCreateColumn={canCreateColumn}
        canEditColumn={canEditColumn}
        canDeleteColumn={canDeleteColumn}
        tasks={tasks}
        members={members}
        labels={labels}
        usersById={usersById}
        currentUserId={currentUserId}
        canCreateTask={canCreateTask}
        canMoveTask={canMoveTask}
        openTaskId={openTaskId}
        canComment={canComment}
        canEditTask={canEditTask}
        canDeleteTask={canDeleteTask}
      />
    </section>
  );
}
