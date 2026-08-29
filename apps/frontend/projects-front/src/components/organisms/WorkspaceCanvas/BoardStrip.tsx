import type { Board, Label, Task, UserProfile } from '@praxis/commons';
import type { ReactNode } from 'react';
import { BoardCalendar } from './BoardCalendar';
import { BoardColumns } from './BoardColumns';
import { BoardTable } from './BoardTable';
import { TableroExpandible } from './TableroExpandible';
import { TableroMenu } from './TableroMenu';
import type { VistaTablero } from './VistaSelector';
import { BOARD_SURFACE } from './superficie-tablero';

export interface BoardStripProps {
  /** El selector de vista + el filtro de «solo mis tareas». */
  filtroMisTareas?: ReactNode;
  /** Qué vista se pinta: Kanban, Calendario o Tabla. */
  vista: VistaTablero;
  /**
   * Lo que va a la izquierda de la cabecera en vez del nombre del tablero: el
   * selector de espacio y las pestañas de tablero. Ver `TableroExpandible`.
   */
  titulo?: ReactNode;
  board: Board;
  projectId: string;
  /** Renombrar el tablero: `canEditBoard`. */
  canEditBoard: boolean;
  /** Eliminar el tablero: `canDeleteBoard`. */
  canDeleteBoard: boolean;
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
  /** Gestionar las etiquetas del proyecto desde el diálogo de tarea: `canManageLabels`. */
  canManageLabels: boolean;
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
  filtroMisTareas,
  vista,
  titulo,
  projectId,
  canEditBoard,
  canDeleteBoard,
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
  canManageLabels,
  canEditTask,
  canDeleteTask,
}: BoardStripProps) {
  const columnCount = board.columns.length;

  return (
    <section
      aria-label={`Tablero ${board.name}`}
      /* `min-h-0 flex-1`: el tablero ocupa lo que quede de pantalla y **no la
         estira**. Es lo que permite que la página no tenga desplazamiento
         propio y que el único scroll vertical sea el de dentro de una columna. */
      className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl border border-white/10 p-4"
      style={BOARD_SURFACE}
    >
      {/* La cabecera se fue a `TableroExpandible` con el botón de ampliar: los
          dos tienen que moverse juntos a la capa de pantalla completa, y desde
          aquí —que es un componente de servidor— no hay estado que compartir. */}
      <TableroExpandible
        titulo={titulo}
        accionesDeVista={filtroMisTareas}
        /* A la derecha de «Ampliar», el último de la fila: es el sitio donde
           se busca lo que no se usa a diario. */
        menu={
          <TableroMenu
            projectId={projectId}
            board={board}
            canEdit={canEditBoard}
            canDelete={canDeleteBoard}
          />
        }
        nombre={board.name}
        resumen={`${
          columnCount === 0
            ? 'sin columnas'
            : `${columnCount} ${columnCount === 1 ? 'columna' : 'columnas'}`
        }${tasks.length > 0 ? ` · ${tasks.length} ${tasks.length === 1 ? 'tarea' : 'tareas'}` : ''}`}
      >
        {/* Kanban es la de siempre —arrastre incluido—; Calendario y Tabla son
            solo lectura de la misma lista y comparten el panel de tarea. */}
        {vista === 'calendario' ? (
          <BoardCalendar
            board={board}
            projectId={projectId}
            tasks={tasks}
            members={members}
            labels={labels}
            usersById={usersById}
            currentUserId={currentUserId}
            openTaskId={openTaskId}
            canMoveTask={canMoveTask}
            canComment={canComment}
            canManageLabels={canManageLabels}
            canEditTask={canEditTask}
            canDeleteTask={canDeleteTask}
          />
        ) : vista === 'tabla' ? (
          <BoardTable
            board={board}
            projectId={projectId}
            tasks={tasks}
            members={members}
            labels={labels}
            usersById={usersById}
            currentUserId={currentUserId}
            openTaskId={openTaskId}
            canMoveTask={canMoveTask}
            canComment={canComment}
            canManageLabels={canManageLabels}
            canEditTask={canEditTask}
            canDeleteTask={canDeleteTask}
          />
        ) : (
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
            canManageLabels={canManageLabels}
            canEditTask={canEditTask}
            canDeleteTask={canDeleteTask}
          />
        )}
      </TableroExpandible>
    </section>
  );
}
