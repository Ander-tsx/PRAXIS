'use client';

import {
  type Label,
  type Task,
  type UserProfile,
  type Workspace,
  alpha,
  colors,
  projectPath,
} from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BoardStrip } from './BoardStrip';
import { BoardTabs } from './BoardTabs';
import { CreateBoardButton } from './CreateBoardButton';
import { VistaSelector, type VistaTablero, esVista } from './VistaSelector';
import { WorkspacePicker } from './WorkspacePicker';

/**
 * El vacío compartido de un tablero sin tareas.
 *
 * ⚠️ **No se puede escribir `?? []` en el JSX**, y el motivo no se ve: el
 * reparto optimista de `BoardColumns` detecta que han llegado datos nuevos del
 * servidor comparando la **identidad** del array de tareas. Un literal nuevo en
 * cada render dice «datos nuevos» sesenta veces por segundo, y con eso el
 * movimiento que la pantalla ya daba por hecho se retira antes de que el
 * servidor lo haya confirmado — justo el parpadeo que veníamos a quitar.
 */
const SIN_TAREAS: Task[] = [];

export interface WorkspaceCanvasProps {
  /**
   * ¿Está puesto el filtro de «solo mis tareas»? Sale de `?mias=1`.
   *
   * ⚠️ **El control lo dibuja este componente, no la page**, y es un cambio
   * respecto a como estaba. Antes llegaba como slot ya montado —un `<Link>` con
   * su `href` calculado en el servidor—, y eso dejó de funcionar en cuanto el
   * tablero abierto pasó a ser estado de cliente: aquel `href` no podía llevar
   * el tablero, así que pulsar el filtro te devolvía al primer tablero del
   * espacio. Los recuentos siguen llegando de la page, que es quien tiene las
   * tareas sin filtrar.
   */
  soloMias: boolean;
  /** Cuántas del espacio son tuyas, y cuántas hay en total. Para el rótulo. */
  misTareasDelEspacio: number;
  totalDelEspacio: number;
  projectId: string;
  /** Solo para navegar; las acciones siguen usando `projectId`. */
  projectSlug: string;
  workspaces: Workspace[];
  /** Espacio abierto, resuelto en la page desde `?ws=`. */
  activeWorkspace: Workspace | null;
  /**
   * Tablero con el que arrancar, si la URL lo pide (`?board=`, `?task=`).
   *
   * A partir de ahí manda el estado local: cambiar de tablero no navega.
   */
  boardIdInicial?: string | null;
  /** La vista de arranque (`?vista=`): `kanban` (por defecto), `calendario` o `tabla`. */
  vistaInicial?: string;
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
 * Espacios de trabajo: se elige uno, se elige un tablero, y ese tablero es la
 * pantalla.
 *
 * ## Qué cambió, y por qué
 *
 * Aquí se apilaban **todos** los tableros del espacio, uno debajo de otro, cada
 * uno con su lienzo y su tira de columnas. Eso producía el defecto que más se
 * notaba al usar la pantalla: **tres desplazamientos anidados compitiendo por la
 * rueda del ratón** —la página, la tira de columnas de cada tablero y la lista
 * de tareas de cada columna—, así que el mismo gesto hacía una cosa u otra según
 * dónde estuviera el cursor.
 *
 * Ahora hay **uno** de cada: la tira de columnas se desplaza en horizontal, la
 * lista de una columna en vertical, y la página no se desplaza en absoluto. El
 * tablero ocupa lo que queda de ventana y ya está.
 *
 * ## El cambio de tablero no pasa por el servidor
 *
 * La page pide en paralelo las tareas de **todos** los tableros del espacio
 * abierto, así que cambiar de tablero es elegir cuál de esas listas se pinta.
 * Navegar para eso sería una vuelta al servidor —con su revalidación del árbol
 * entero del proyecto— para enseñar algo que ya está en memoria.
 *
 * ⚠️ Por eso `?board=` es solo el **valor de partida**. Sigue haciendo falta:
 * es lo que hace que el enlace de un aviso aterrice en el tablero de la tarea y
 * no en el primero del espacio.
 */
export function WorkspaceCanvas({
  projectId,
  soloMias,
  misTareasDelEspacio,
  totalDelEspacio,
  projectSlug,
  workspaces,
  activeWorkspace,
  boardIdInicial,
  vistaInicial,
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
  const router = useRouter();
  const boards = activeWorkspace?.boards ?? [];

  const [boardActivoId, setBoardActivoId] = useState<string | null>(
    () => boardIdInicial ?? boards[0]?.id ?? null,
  );

  /**
   * Si el tablero elegido deja de existir —se borró, o se cambió de espacio—,
   * se cae al primero. Sin esto la pantalla se queda en blanco enseñando un
   * tablero que ya no está, que es peor que enseñar otro.
   */
  useEffect(() => {
    if (boards.length === 0) {
      if (boardActivoId !== null) setBoardActivoId(null);
      return;
    }
    if (!boards.some((board) => board.id === boardActivoId)) {
      setBoardActivoId(boardIdInicial ?? boards[0].id);
    }
  }, [boards, boardActivoId, boardIdInicial]);

  const boardActivo = boards.find((board) => board.id === boardActivoId) ?? boards[0] ?? null;

  /**
   * La vista del tablero —Kanban, Calendario o Tabla—. Como `?mias=1` y la
   * pestaña, el estado de partida llega de la URL (`?vista=`), pero a partir de
   * ahí lo lleva `useState` y se refleja en la barra de direcciones **sin
   * navegar**: cambiar de vista no debe revalidar el árbol del proyecto.
   */
  const [vista, setVista] = useState<VistaTablero>(() =>
    esVista(vistaInicial) ? vistaInicial : 'kanban',
  );
  function cambiarVista(v: VistaTablero) {
    setVista(v);
    const url = new URL(window.location.href);
    if (v === 'kanban') url.searchParams.delete('vista');
    else url.searchParams.set('vista', v);
    window.history.replaceState(null, '', url);
  }

  /**
   * La barra de direcciones sigue al tablero abierto, **sin navegar**.
   *
   * `replaceState` y no `router.replace`: lo segundo pediría la página al
   * servidor —con la revalidación del árbol entero del proyecto detrás— para
   * enseñar algo que ya está pintado. Esto solo arregla lo que se copia y lo que
   * se recarga, que es para lo que sirve tener el tablero en la URL.
   */
  useEffect(() => {
    if (!boardActivo) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('board') === boardActivo.id) return;
    url.searchParams.set('board', boardActivo.id);
    window.history.replaceState(null, '', url);
  }, [boardActivo]);

  const tareasPorTablero = new Map(
    boards.map((board) => [board.id, tasksByBoard.get(board.id)?.length ?? 0]),
  );

  /* El selector de espacio y las pestañas de tablero comparten la barra del
     tablero. Antes eran dos filas encima del lienzo: una para el espacio y otra
     para el nombre del tablero, diciendo por separado lo que aquí se lee de un
     tirón —«Diseño / Sprint 4»—. */
  const barraDelTablero = (
    <div className="flex min-w-0 flex-1 items-center gap-1 ">
      <WorkspacePicker
        compacto
        projectId={projectId}
        projectSlug={projectSlug}
        workspaces={workspaces}
        activeId={activeWorkspace?.id ?? ''}
        canManage={canManage}
        canEditBoard={canEditBoard}
        canDeleteBoard={canDeleteBoard}
      />

      <span aria-hidden="true" className="shrink-0 font-sans text-sm text-white">
        /
      </span>

      {boardActivo && (
        <BoardTabs
          boards={boards}
          activeId={boardActivo.id}
          onCambiar={setBoardActivoId}
          tareasPorTablero={tareasPorTablero}
        />
      )}

      {activeWorkspace && canManage && (
        <CreateBoardButton compacto workspaceId={activeWorkspace.id} projectId={projectId} />
      )}
    </div>
  );

  /**
   * «Solo mías», junto a «Ampliar».
   *
   * Los dos son controles de **vista del tablero** —qué se ve y de qué tamaño—
   * así que van juntos y con el mismo tratamiento; suelto encima del lienzo, el
   * filtro parecía una acción del proyecto entero.
   *
   * El estado vive en la URL (`?mias=1`), no en un `useState`: recargar lo
   * mantiene, el botón atrás lo deshace y un enlace compartido lleva a la misma
   * vista. Misma regla que la pestaña activa. Y lleva el tablero abierto en el
   * destino, para no perderlo al filtrar.
   */
  const filtroMisTareas = (
    <button
      type="button"
      onClick={() =>
        router.replace(
          projectPath(
            { slug: projectSlug },
            {
              tab: 'espacios',
              ws: activeWorkspace?.id,
              board: boardActivo?.id,
              ...(soloMias ? {} : { mias: '1' }),
            },
          ),
          { scroll: false },
        )
      }
      aria-pressed={soloMias}
      title={
        soloMias
          ? `Ver todas las tareas (${totalDelEspacio})`
          : `Ver solo las mías (${misTareasDelEspacio} de ${totalDelEspacio})`
      }
      className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-sans text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        soloMias
          ? 'bg-primary text-primary-foreground'
          : 'text-white hover:bg-[#191919] hover:text-white'
      }`}
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
      {soloMias ? `Solo mías · ${misTareasDelEspacio}` : 'Solo mías'}
    </button>
  );

  /* El selector de vista va pegado al filtro: los dos deciden **qué** se ve del
     tablero, y comparten sitio encima del lienzo. */
  const controlesDeVista = (
    <>
      <VistaSelector value={vista} onChange={cambiarVista} />
      {filtroMisTareas}
    </>
  );

  if (!activeWorkspace) {
    return (
      <div className="flex flex-col h-full bg-[#191919]">
        <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-lg bg-[#191919] px-4 py-2">
          {barraDelTablero}
        </div>

        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6 py-16 text-center">
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
          <h3 className="font-sans text-2xl font-semibold text-white">Ningún espacio todavía</h3>
          <p className="max-w-md font-sans text-sm text-white">
            Un espacio agrupa tableros: uno por equipo, por fase o por lo que le convenga a este
            proyecto.{' '}
            {canManage
              ? 'Créalo desde el selector de arriba.'
              : 'Quien administre el proyecto puede crear el primero.'}
          </p>
        </div>
      </div>
    );
  }

  if (!boardActivo) {
    return (
      <div className="flex flex-col h-full bg-[#191919]">
        <div className="flex shrink-0 flex-wrap items-center gap-1 bg-[#191919] px-4 py-2">
          {barraDelTablero}
        </div>

        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6 py-16 text-center">
          <h3 className="font-sans text-2xl font-semibold text-white">
            «{activeWorkspace.name}» está vacío
          </h3>
          <p className="max-w-md font-sans text-sm text-white">
            Un tablero organiza el trabajo en columnas.{' '}
            {canManage ? 'Crea el primero desde el botón de arriba.' : ''}
          </p>
        </div>
      </div>
    );
  }

  return (
    <BoardStrip
      /* Remonta al cambiar de tablero: `BoardColumns` guarda el orden de las
         columnas en estado local, y sin esto el tablero nuevo aparecería con el
         orden del anterior hasta el primer efecto. */
      key={boardActivo.id}
      board={boardActivo}
      vista={vista}
      titulo={barraDelTablero}
      filtroMisTareas={controlesDeVista}
      projectId={projectId}
      canEditBoard={canEditBoard}
      canDeleteBoard={canDeleteBoard}
      canCreateColumn={canCreateColumn}
      canEditColumn={canEditColumn}
      canDeleteColumn={canDeleteColumn}
      tasks={tasksByBoard.get(boardActivo.id) ?? SIN_TAREAS}
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
  );
}
