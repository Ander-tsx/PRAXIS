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
 * Retícula de puntos del tablero, **difuminada hacia los bordes**.
 *
 * El lienzo no tiene color propio: se ve el fondo de la página y lo único que
 * lo delimita son los puntos —los de cualquier pizarra— y el borde. Por eso la
 * retícula no puede cortarse de golpe contra el borde: se desvanece antes de
 * llegar, y el tablero deja de parecer un recorte rectangular pegado encima.
 *
 * El difuminado es una **máscara**, no una sombra ni un degradado de color:
 * lo que se atenúa son los puntos, y lo que queda debajo sigue siendo el fondo
 * real de la página. Un degradado tendría que conocer ese fondo para imitarlo, y
 * dejaría de encajar en cuanto cambiara.
 *
 * El radio va en porcentaje (`115% 115%`) para que se escale con la caja: un
 * tablero ancho y bajo y otro estrecho y alto se difuminan igual por los cuatro
 * lados. Con un radio en píxeles, el lado largo se comería casi todo el efecto.
 *
 * ⚠️ Va en una **capa aparte** y no en el `<section>`: `mask-image` recorta
 * también a los hijos, así que aplicada al tablero entero desvanecería las
 * columnas y las tarjetas de los extremos.
 */
const BOARD_DOTS = {
  background: `radial-gradient(${alpha(colors.borderStrong, 60)} 1px, transparent 1px)`,
  backgroundSize: '22px 22px',
  /* Medio paso: así ningún punto cae justo en la esquina redondeada. */
  backgroundPosition: '11px 11px',
  maskImage: 'radial-gradient(115% 115% at 50% 50%, #000 45%, transparent 100%)',
  WebkitMaskImage: 'radial-gradient(115% 115% at 50% 50%, #000 45%, transparent 100%)',
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
      /* `relative` para que la capa de puntos se posicione contra el tablero.
         **Sin `overflow-hidden`**: recortaría también el menú de la columna, que
         es una capa flotante y se abre hacia abajo. La retícula se redondea sola
         con el mismo radio. */
      className="relative flex flex-col gap-4 rounded-2xl border border-border p-5"
    >
      {/**
       * La retícula, en su propia capa.
       *
       * Va **antes** que el contenido y sin `z-index`: una capa posicionada se
       * pinta por encima del contenido en flujo, así que el contenido se envuelve
       * en un `relative` propio para quedar por delante. `pointer-events-none`
       * para que no se coma el arrastre de las columnas, que pasa justo encima.
       */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={BOARD_DOTS}
      />

      <header className="relative flex flex-wrap items-baseline gap-3">
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

      <div className="relative">
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
      </div>
    </section>
  );
}
