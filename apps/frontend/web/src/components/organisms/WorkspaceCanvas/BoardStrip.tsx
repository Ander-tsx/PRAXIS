'use client';

import type { Board, Label, Sprint, Task, UserProfile } from '@praxis/commons';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { BoardCalendar } from './BoardCalendar';
import { BoardColumns, type PlanificacionDelTablero } from './BoardColumns';
import { BoardTable } from './BoardTable';
import { type PanelDelTablero, SprintStrip } from './SprintStrip';
import { TableroExpandible } from './TableroExpandible';
import { TableroMenu } from './TableroMenu';
import type { VistaTablero } from './VistaSelector';
import { calcularVelocidad, unidadDe } from './burndown';
import {
  type ScrumDelTablero,
  nombreDelSiguiente,
  sprintActivo,
  sprintEnTablero,
  sprintsCerrados,
} from './scrum';
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
  /** Solo en un tablero con Scrum: sprints, backlog y filas del burndown. */
  scrum?: ScrumDelTablero;
  /** Sprints cerrados de un tablero que ya no tiene Scrum. */
  historial?: Sprint[];
  /** Empezar, editar y cerrar sprints: `canManageSprint`. */
  canManageSprint: boolean;
  /** Para abrir el backlog desde Calendario o Tabla: vuelve al Kanban. */
  onCambiarVista: (vista: VistaTablero) => void;
}

/**
 * Un tablero con sus columnas.
 *
 * ## Con Scrum encendido (`docs/PLAN-SCRUM-KANBAN.md`)
 *
 * El tablero enseña **el sprint de ahora** (D12 y D19): el que está en curso
 * o, entre dos sprints, el planeado —la planificación del siguiente—. Encima,
 * la franja (`SprintStrip`) con todo lo del sprint; al lado, el backlog en un
 * panel que es parte del mismo arrastre (D17). `tasks` ya llega acotado a ese
 * sprint: la página lo pide por alcance, no entero.
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
  scrum,
  historial,
  canManageSprint,
  onCambiarVista,
}: BoardStripProps) {
  const columnCount = board.columns.length;
  /* Un solo panel lateral a la vez: el del sprint o el del backlog (D21). */
  const [panelPedido, setPanel] = useState<PanelDelTablero>(null);
  /* El backlog vive en el Kanban (se arrastra a sus columnas): en Calendario o
     Tabla no está, y su botón no puede quedarse marcado como abierto. */
  const panel: PanelDelTablero =
    panelPedido === 'backlog' && vista !== 'kanban' ? null : panelPedido;
  const cerrarBacklog = useCallback(() => setPanel(null), []);

  const sprints = scrum?.sprints;
  const enTablero = sprints ? sprintEnTablero(sprints) : null;
  const metricas = scrum?.metricas;
  /* Una sola unidad para todo el tablero —franja, burndown, velocidad—: si
     cada pieza decidía la suya, la franja decía «1/4 hechas» y el progreso
     «3 de 18 puntos» a la vez (auditoría S13). */
  const unidad = useMemo(() => unidadDe(metricas?.tasks ?? []), [metricas]);
  const velocidadMedia = useMemo(() => {
    if (!sprints || !metricas) return null;
    const cerrados = sprintsCerrados(sprints).filter((s) =>
      metricas.velocitySprintIds.includes(s.id),
    );
    return calcularVelocidad(cerrados, metricas.tasks, unidad).media;
  }, [sprints, metricas, unidad]);

  const planificacion: PlanificacionDelTablero | undefined = useMemo(
    () =>
      scrum
        ? {
            backlog: scrum.backlog,
            panelAbierto: panel === 'backlog',
            onCerrarPanel: cerrarBacklog,
            sprintDestino: enTablero ? { id: enTablero.id, name: enTablero.name } : null,
            nombreNuevo: nombreDelSiguiente(scrum.sprints),
            canPlan: canEditTask,
          }
        : undefined,
    [scrum, panel, cerrarBacklog, enTablero, canEditTask],
  );

  /**
   * Qué enseñan Tabla y Calendario en un tablero Scrum (S14). El Kanban es
   * siempre el sprint (D12); estas dos vistas son para mirar más allá: la
   * fecha límite de algo del backlog tiene que poder verse.
   */
  const [alcance, setAlcance] = useState<'sprint' | 'backlog' | 'todo'>('sprint');
  const tareasDeLaVista = useMemo(() => {
    if (!scrum || alcance === 'sprint') return tasks;
    if (alcance === 'backlog') return scrum.backlog;
    return [...tasks, ...scrum.backlog];
  }, [scrum, alcance, tasks]);

  function cambiarPanel(siguiente: PanelDelTablero) {
    /* El backlog se arrastra al Kanban: desde Calendario o Tabla, se vuelve a él. */
    if (siguiente === 'backlog' && vista !== 'kanban') onCambiarVista('kanban');
    setPanel(siguiente);
  }

  return (
    <section
      aria-label={`Tablero ${board.name}`}
      /* `min-h-0 flex-1`: el tablero ocupa lo que quede de pantalla y **no la
         estira**. Es lo que permite que la página no tenga desplazamiento
         propio y que el único scroll vertical sea el de dentro de una columna. */
      className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl p-4"
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
            tareasAbiertas={scrum ? [] : tasks.filter((t) => !t.completedAt).map((t) => t.id)}
            haySprintEnCurso={sprints ? sprintActivo(sprints) !== null : false}
            historial={historial}
          />
        }
        nombre={board.name}
        resumen={`${
          columnCount === 0
            ? 'sin columnas'
            : `${columnCount} ${columnCount === 1 ? 'columna' : 'columnas'}`
        }${tasks.length > 0 ? ` · ${tasks.length} ${tasks.length === 1 ? 'tarea' : 'tareas'}` : ''}${
          enTablero ? ` · ${enTablero.name}` : ''
        }`}
      >
        {/* Kanban es la de siempre —arrastre incluido—; Calendario y Tabla son
            solo lectura de la misma lista y comparten el panel de tarea. */}
        {scrum && metricas && (
          <SprintStrip
            board={board}
            projectId={projectId}
            sprints={scrum.sprints}
            enTablero={enTablero}
            tareas={tasks}
            metricas={metricas}
            unidad={unidad}
            velocidadMedia={velocidadMedia}
            nombreSiguiente={nombreDelSiguiente(scrum.sprints)}
            enBacklog={scrum.backlog.length}
            usersById={usersById}
            panel={panel}
            onPanel={cambiarPanel}
            canManageSprint={canManageSprint}
          />
        )}
        {scrum && vista !== 'kanban' && (
          <div
            role="radiogroup"
            aria-label="Qué tareas enseñar"
            className="flex w-fit shrink-0 items-center gap-0.5 rounded-lg border border-border p-0.5"
          >
            {(
              [
                ['sprint', 'Sprint'],
                ['backlog', 'Backlog'],
                ['todo', 'Todo'],
              ] as const
            ).map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={alcance === valor}
                onClick={() => setAlcance(valor)}
                className={`cursor-pointer rounded-md px-2.5 py-1 font-sans text-xs transition-colors ${
                  alcance === valor
                    ? 'bg-white/[0.08] text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        )}
        {vista === 'calendario' ? (
          <BoardCalendar
            board={board}
            projectId={projectId}
            tasks={tareasDeLaVista}
            members={members}
            labels={labels}
            usersById={usersById}
            currentUserId={currentUserId}
            openTaskId={openTaskId}
            canMoveTask={canMoveTask}
            canCreateTask={canCreateTask}
            canComment={canComment}
            canManageLabels={canManageLabels}
            canEditTask={canEditTask}
            canDeleteTask={canDeleteTask}
          />
        ) : vista === 'tabla' ? (
          <BoardTable
            board={board}
            projectId={projectId}
            tasks={tareasDeLaVista}
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
            planificacion={planificacion}
            canCreateColumn={canCreateColumn}
            canEditColumn={canEditColumn}
            canDeleteColumn={canDeleteColumn}
            tasks={tasks}
            members={members}
            labels={labels}
            usersById={usersById}
            currentUserId={currentUserId}
            canCreateTask={canCreateTask}
            openTaskId={openTaskId}
            canMoveTask={canMoveTask}
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
