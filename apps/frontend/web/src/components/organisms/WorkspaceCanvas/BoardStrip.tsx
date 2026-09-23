'use client';

import { pullToSprintAction } from '@/app/(privado)/projects/[id]/sprint-actions';
import { SPRINT_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  type Board,
  type Column,
  type Label,
  type Sprint,
  type Task,
  type UserProfile,
  useAccion,
} from '@praxis/commons';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { BacklogDrawer } from './BacklogDrawer';
import { BoardCalendar } from './BoardCalendar';
import { BoardColumns } from './BoardColumns';
import { BoardTable } from './BoardTable';
import { SinSprintActivo } from './SinSprintActivo';
import { SprintBanner } from './SprintBanner';
import { SprintPanel } from './SprintPanel';
import { TableroExpandible } from './TableroExpandible';
import { TableroMenu } from './TableroMenu';
import { type VistaTablero, esVistaScrum } from './VistaSelector';
import { sprintActivo, sprintsPlaneados } from './scrum';
import { BOARD_SURFACE } from './superficie-tablero';

/** Ver `SIN_TAREAS` en `WorkspaceCanvas`: la identidad del array importa. */
const NINGUNA: Task[] = [];

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
  /** Sprints del tablero. Vacío si no tiene Scrum encendido. */
  sprints: Sprint[];
  /** Planear, iniciar y cerrar sprints. */
  canManageSprint: boolean;
  /** Para que el estado vacío del Kanban sin sprint pueda llevar a Backlog o Sprint. */
  onCambiarVista: (vista: VistaTablero) => void;
}

/**
 * Un tablero con sus columnas.
 *
 * ## Con Scrum encendido (`docs/PLAN-SCRUM-KANBAN.md`)
 *
 * Kanban, Calendario y Tabla enseñan **solo el sprint en curso** (D12): son las
 * vistas de trabajar, y lo que se trabaja es lo comprometido. Sin sprint en
 * curso no hay nada que enseñar, y se dice. Backlog y Sprint reciben todas las
 * tareas del tablero: son las vistas de planear.
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
  sprints,
  canManageSprint,
  onCambiarVista,
}: BoardStripProps) {
  const columnCount = board.columns.length;
  const scrum = board.scrumEnabled;
  const activo = scrum ? sprintActivo(sprints) : null;
  const activoId = activo?.id ?? null;
  /* Si la URL pide Backlog o Sprint en un tablero sin Scrum, se cae a Kanban. */
  const vistaReal: VistaTablero = !scrum && esVistaScrum(vista) ? 'kanban' : vista;

  /* Memorizado, no filtrado en cada render: `BoardColumns` detecta datos nuevos
     por la identidad del array (ver `SIN_TAREAS` en `WorkspaceCanvas`). */
  const tareasDelSprint = useMemo(
    () => (!scrum ? tasks : activoId ? tasks.filter((t) => t.sprintId === activoId) : NINGUNA),
    [scrum, tasks, activoId],
  );
  const sinSprint = scrum && !activo && !esVistaScrum(vistaReal);

  /* El panel del backlog y el paso de una tarea al sprint en curso (D14). */
  const [backlogAbierto, setBacklogAbierto] = useState(false);
  const cerrarBacklog = useCallback(() => setBacklogAbierto(false), []);
  const [estadoTraer, traer, trayendo] = useAccion(pullToSprintAction, SPRINT_INITIAL_STATE);
  const traerAlSprint = useCallback(
    (taskId: string, column: Column) => {
      if (!activoId) return;
      const datos = new FormData();
      datos.set('projectId', projectId);
      datos.set('taskId', taskId);
      datos.set('sprintId', activoId);
      datos.set('columnId', column.id);
      datos.set('status', column.name);
      traer(datos);
    },
    [activoId, projectId, traer],
  );
  const enBacklog = scrum ? tasks.filter((t) => t.sprintId === null).length : 0;
  const hechas = tareasDelSprint.filter((t) => t.completedAt).length;

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
          />
        }
        nombre={board.name}
        resumen={`${
          columnCount === 0
            ? 'sin columnas'
            : `${columnCount} ${columnCount === 1 ? 'columna' : 'columnas'}`
        }${tareasDelSprint.length > 0 ? ` · ${tareasDelSprint.length} ${tareasDelSprint.length === 1 ? 'tarea' : 'tareas'}` : ''}${
          activo ? ` · ${activo.name}` : ''
        }`}
      >
        {/* Kanban es la de siempre —arrastre incluido—; Calendario y Tabla son
            solo lectura de la misma lista y comparten el panel de tarea. */}
        {scrum && activo && !esVistaScrum(vistaReal) && (
          <SprintBanner
            activo={activo}
            hechas={hechas}
            total={tareasDelSprint.length}
            enBacklog={enBacklog}
            backlogAbierto={backlogAbierto}
            onBacklog={() => setBacklogAbierto((a) => !a)}
            onVerSprint={() => onCambiarVista('sprint')}
          />
        )}
        {vistaReal === 'sprint' ? (
          <SprintPanel
            board={board}
            projectId={projectId}
            tasks={tasks}
            sprints={sprints}
            canManageSprint={canManageSprint}
          />
        ) : sinSprint ? (
          <SinSprintActivo
            planeados={sprintsPlaneados(sprints).length}
            enBacklog={enBacklog}
            onIr={onCambiarVista}
            onBacklog={() => setBacklogAbierto(true)}
          />
        ) : vistaReal === 'calendario' ? (
          <BoardCalendar
            board={board}
            projectId={projectId}
            tasks={tareasDelSprint}
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
        ) : vistaReal === 'tabla' ? (
          <BoardTable
            board={board}
            projectId={projectId}
            tasks={tareasDelSprint}
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
            onSoltarDesdeBacklog={activo && canEditTask ? traerAlSprint : undefined}
            canCreateColumn={canCreateColumn}
            canEditColumn={canEditColumn}
            canDeleteColumn={canDeleteColumn}
            tasks={tareasDelSprint}
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

      {scrum && (
        <BacklogDrawer
          abierto={backlogAbierto}
          onCerrar={cerrarBacklog}
          board={board}
          projectId={projectId}
          tasks={tasks}
          activo={activo}
          members={members}
          usersById={usersById}
          canCreateTask={canCreateTask}
          canEditTask={canEditTask}
          onTraer={traerAlSprint}
          trayendo={trayendo}
          error={estadoTraer.error}
        />
      )}
    </section>
  );
}
