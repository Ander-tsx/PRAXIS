import type { Board, Label, Task, UserProfile } from '@praxis/commons';
import { alpha, colors } from '@praxis/commons';
import { BoardColumns } from './BoardColumns';
import { TableroExpandible } from './TableroExpandible';

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
 * Superficie del tablero: retícula de puntos y sombra hacia dentro.
 *
 * El lienzo no tiene color propio —se ve el fondo de la página—, así que lo que
 * lo delimita son los puntos, el borde y esta sombra. La sombra **va hacia
 * adentro** (`inset`): hunde los bordes, apaga los puntos que llegan hasta ellos
 * y hace que el tablero se lea como una superficie rebajada en la página en vez
 * de como un rectángulo dibujado encima.
 *
 * Antes esto era una máscara que desvanecía los puntos, y apenas se notaba: los
 * puntos ya son tenues de por sí, así que atenuar algo tenue no se ve. Oscurecer
 * el borde sí, porque cambia el fondo y no solo el patrón.
 *
 * Son **dos sombras**, una corta y densa y otra larga y suave: con una sola, o
 * el borde queda con una línea dura o el degradado se pierde antes de llegar al
 * centro.
 *
 * ⚠️ Las dos cosas caben en el `<section>` y no hacen falta capas: una sombra
 * `inset` se pinta **encima del fondo y debajo del contenido**, así que oscurece
 * los puntos sin tocar las columnas ni las tarjetas. Es justo lo que una máscara
 * no podía hacer, porque `mask-image` sí recorta a los hijos.
 *
 * ⚠️ El color de la sombra sale de `colors.canvasShadow`, no de `colors.overlay`:
 * `overlay` se queda oscuro en los dos temas a propósito (es el scrim de
 * modales y drawers), pero un hundido **oscuro** sobre un lienzo que en tema
 * claro ya es blanco se lee como suciedad, no como profundidad.
 * `canvasShadow` sí invierte — oscuro en oscuro, blanco en claro — para que el
 * lienzo siga leyéndose como una superficie rebajada en los dos temas.
 */
const BOARD_SURFACE = {
  background: `radial-gradient(${alpha(colors.borderStrong, 60)} 1px, transparent 1px)`,
  backgroundSize: '22px 22px',
  /* Medio paso: así ningún punto cae justo en la esquina redondeada. */
  backgroundPosition: '11px 11px',
  boxShadow: [
    `inset 0 0 24px 2px ${alpha(colors.canvasShadow, 85)}`,
    `inset 0 0 72px 24px ${alpha(colors.canvasShadow, 55)}`,
  ].join(', '),
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
      {/* La cabecera se fue a `TableroExpandible` con el botón de ampliar: los
          dos tienen que moverse juntos a la capa de pantalla completa, y desde
          aquí —que es un componente de servidor— no hay estado que compartir. */}
      <TableroExpandible
        nombre={board.name}
        resumen={`${
          columnCount === 0
            ? 'sin columnas'
            : `${columnCount} ${columnCount === 1 ? 'columna' : 'columnas'}`
        }${tasks.length > 0 ? ` · ${tasks.length} ${tasks.length === 1 ? 'tarea' : 'tareas'}` : ''}`}
      >
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
      </TableroExpandible>
    </section>
  );
}
