'use client';

import {
  createBacklogTaskAction,
  moveToSprintAction,
  reorderBacklogAction,
} from '@/app/(privado)/projects/[id]/sprint-actions';
import { SPRINT_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  type Board,
  type Label,
  PRIORITY_LABELS,
  type Sprint,
  type Task,
  type UserProfile,
  useAccion,
} from '@praxis/commons';
import { useMemo } from 'react';
import { TaskDialog } from '../TaskBoard/TaskDialog';
import { useTaskDialog } from '../TaskBoard/useTaskDialog';
import { porOrden, sprintActivo, sprintsPlaneados } from './scrum';

export interface BacklogViewProps {
  board: Board;
  projectId: string;
  /** Todas las tareas del tablero; aquí se reparten entre backlog y sprints planeados. */
  tasks: Task[];
  sprints: Sprint[];
  members: UserProfile[];
  labels: Label[];
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  openTaskId?: string | null;
  canCreateTask: boolean;
  /** Reordenar usa la ruta de mover: `canMoveTask`. */
  canMoveTask: boolean;
  /** Cambiar el sprint de una tarea es un `PATCH`: `canEditTask`. */
  canEditTask: boolean;
  canComment: boolean;
  canManageLabels: boolean;
  canDeleteTask: boolean;
}

/**
 * El backlog de un tablero Scrum: lo que no está en ningún sprint (D2 de
 * `docs/PLAN-SCRUM-KANBAN.md`), y encima, lo que ya se planeó para los sprints
 * que todavía no arrancan.
 *
 * El sprint activo **no** sale aquí: ese es el Kanban. Esta pantalla es la de
 * decidir qué viene después, no la de trabajarlo.
 *
 * ## Por qué subir/bajar y no arrastrar
 *
 * El orden del backlog es prioridad, y se toca de uno en uno. Dos flechas
 * funcionan igual con el dedo que con el ratón y con el teclado; arrastrar en
 * una lista larga dentro de un móvil es pelearse con el desplazamiento.
 */
export function BacklogView({
  board,
  projectId,
  tasks,
  sprints,
  members,
  labels,
  usersById,
  currentUserId,
  openTaskId,
  canCreateTask,
  canMoveTask,
  canEditTask,
  canComment,
  canManageLabels,
  canDeleteTask,
}: BacklogViewProps) {
  const [estadoAlta, crear, creando] = useAccion(createBacklogTaskAction, SPRINT_INITIAL_STATE);
  const [estadoMover, mover, moviendo] = useAccion(moveToSprintAction, SPRINT_INITIAL_STATE);
  const [estadoOrden, reordenar, reordenando] = useAccion(
    reorderBacklogAction,
    SPRINT_INITIAL_STATE,
  );

  const activo = sprintActivo(sprints);
  const planeados = useMemo(() => sprintsPlaneados(sprints), [sprints]);

  const backlog = useMemo(() => tasks.filter((t) => t.sprintId === null).sort(porOrden), [tasks]);
  const porSprint = useMemo(
    () =>
      new Map(
        planeados.map((s) => [s.id, tasks.filter((t) => t.sprintId === s.id).sort(porOrden)]),
      ),
    [tasks, planeados],
  );

  /* Solo lo que se ve aquí se abre desde aquí. */
  const visibles = useMemo(
    () => [...backlog, ...[...porSprint.values()].flat()],
    [backlog, porSprint],
  );
  const dialog = useTaskDialog(visibles, openTaskId);

  const columnas = useMemo(() => [...board.columns].sort((a, b) => a.order - b.order), [board]);
  const primeraColumna = columnas[0];
  const nombreDeColumna = useMemo(
    () => new Map(board.columns.map((c) => [c.id, c.name])),
    [board.columns],
  );

  /* Destinos de «mover a…»: el activo, los planeados y el backlog. Los cerrados
     no: son de solo lectura. */
  const destinos = [
    ...(activo ? [{ id: activo.id, etiqueta: `${activo.name} (en curso)` }] : []),
    ...planeados.map((s) => ({ id: s.id, etiqueta: s.name })),
  ];

  function moverA(task: Task, sprintId: string) {
    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('taskId', task.id);
    datos.set('sprintId', sprintId);
    mover(datos);
  }

  /**
   * Intercambia una tarea con su vecina y manda **solo** los `order` que
   * cambian. La lista se renumera 0..n a la vez: los `order` heredados del
   * Kanban pueden estar repetidos o con huecos, y sin renumerar el intercambio
   * no siempre movería nada.
   */
  function desplazar(lista: Task[], indice: number, paso: -1 | 1) {
    const destino = indice + paso;
    if (destino < 0 || destino >= lista.length) return;
    const nueva = [...lista];
    [nueva[indice], nueva[destino]] = [nueva[destino], nueva[indice]];
    const cambios = nueva
      .map((t, i) => ({ t, i }))
      .filter(({ t, i }) => t.order !== i)
      .map(({ t, i }) => `${t.id}:${t.columnId}:${i}`)
      .join(',');
    if (!cambios) return;
    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('cambios', cambios);
    reordenar(datos);
  }

  const ocupado = moviendo || reordenando;
  const aviso = estadoMover.error ?? estadoOrden.error;

  function filas(lista: Task[]) {
    return (
      <ul className="flex flex-col">
        {lista.map((task, indice) => (
          <li
            key={task.id}
            className="flex items-center gap-2 border-b border-border py-2 last:border-b-0"
          >
            {canMoveTask && (
              <span className="flex shrink-0 flex-col">
                <BotonFlecha
                  etiqueta={`Subir «${task.title}»`}
                  deshabilitado={ocupado || indice === 0}
                  onClick={() => desplazar(lista, indice, -1)}
                  d="M6 15l6-6 6 6"
                />
                <BotonFlecha
                  etiqueta={`Bajar «${task.title}»`}
                  deshabilitado={ocupado || indice === lista.length - 1}
                  onClick={() => desplazar(lista, indice, 1)}
                  d="M6 9l6 6 6-6"
                />
              </span>
            )}

            <button
              type="button"
              onClick={() => dialog.open(task.id)}
              className="flex min-w-0 flex-1 cursor-pointer flex-col text-left"
            >
              <span className="truncate font-sans text-sm text-text-primary">{task.title}</span>
              <span className="font-sans text-[11px] text-text-secondary">
                {PRIORITY_LABELS[task.priority]} · {nombreDeColumna.get(task.columnId) ?? '—'}
                {task.estimatePoints !== null && ` · ${task.estimatePoints} pt`}
              </span>
            </button>

            {canEditTask && (
              <select
                aria-label={`Mover «${task.title}» a`}
                value={task.sprintId ?? ''}
                disabled={ocupado}
                onChange={(e) => moverA(task, e.target.value)}
                className="max-w-[9.5rem] shrink-0 cursor-pointer truncate rounded-lg border border-border bg-transparent px-2 py-1 font-sans text-xs text-text-secondary focus:border-primary focus:outline-none"
              >
                <option value="">Backlog</option>
                {destinos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.etiqueta}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-8">
        {aviso && (
          <p role="alert" className="font-sans text-xs text-error">
            {aviso}
          </p>
        )}

        {planeados.map((sprint) => {
          const lista = porSprint.get(sprint.id) ?? [];
          return (
            <section key={sprint.id} aria-label={`Sprint ${sprint.name}`}>
              <header className="flex items-baseline gap-2 border-b border-border pb-2">
                <h3 className="font-sans text-sm font-semibold text-text-primary">{sprint.name}</h3>
                <span className="font-sans text-xs text-text-secondary">
                  planeado · {lista.length} {lista.length === 1 ? 'tarea' : 'tareas'}
                  {sumaDePuntos(lista) !== null && ` · ${sumaDePuntos(lista)} pt`}
                </span>
              </header>
              {sprint.goal && (
                <p className="pt-2 font-sans text-xs italic text-text-secondary">{sprint.goal}</p>
              )}
              {lista.length > 0 ? (
                filas(lista)
              ) : (
                <p className="py-3 font-sans text-xs text-text-secondary">
                  Todavía vacío. Pásale tareas desde el backlog de abajo.
                </p>
              )}
            </section>
          );
        })}

        <section aria-label="Backlog">
          <header className="flex items-baseline gap-2 border-b border-border pb-2">
            <h3 className="font-sans text-sm font-semibold text-text-primary">Backlog</h3>
            <span className="font-sans text-xs text-text-secondary">
              {backlog.length} {backlog.length === 1 ? 'tarea' : 'tareas'} sin sprint · arriba, lo
              siguiente
            </span>
          </header>

          {canCreateTask && primeraColumna && (
            <form action={crear} className="flex items-center gap-2 border-b border-border py-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="boardId" value={board.id} />
              <input type="hidden" name="columnId" value={primeraColumna.id} />
              <input type="hidden" name="status" value={primeraColumna.name} />
              <input type="hidden" name="order" value={backlog.length} />
              <input
                name="title"
                required
                maxLength={255}
                placeholder="Añadir al backlog…"
                aria-label="Título de la tarea nueva"
                className="min-w-0 flex-1 bg-transparent py-1 font-sans text-sm text-text-primary outline-none placeholder:text-text-secondary"
              />
              <button
                type="submit"
                disabled={creando}
                className="shrink-0 cursor-pointer rounded-lg px-2.5 py-1 font-sans text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:cursor-wait disabled:opacity-60"
              >
                {creando ? 'Añadiendo…' : 'Añadir'}
              </button>
            </form>
          )}
          {estadoAlta.error && (
            <p role="alert" className="py-1 font-sans text-xs text-error">
              {estadoAlta.error}
            </p>
          )}

          {backlog.length > 0 ? (
            filas(backlog)
          ) : (
            <p className="py-3 font-sans text-xs text-text-secondary">
              Nada pendiente fuera de un sprint.
            </p>
          )}
        </section>
      </div>

      {dialog.renderedTask && (
        <TaskDialog
          open={dialog.isOpen}
          onClose={dialog.close}
          projectId={projectId}
          boardId={board.id}
          task={dialog.renderedTask}
          columnId={dialog.renderedTask.columnId}
          columnName={nombreDeColumna.get(dialog.renderedTask.columnId) ?? ''}
          members={members}
          labels={labels}
          usersById={usersById}
          currentUserId={currentUserId}
          canToggleChecklist={canMoveTask}
          canComment={canComment}
          canManageLabels={canManageLabels}
          canEdit={canEditTask}
          canDelete={canDeleteTask}
        />
      )}
    </div>
  );
}

function BotonFlecha({
  etiqueta,
  deshabilitado,
  onClick,
  d,
}: {
  etiqueta: string;
  deshabilitado: boolean;
  onClick: () => void;
  d: string;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      disabled={deshabilitado}
      onClick={onClick}
      className="flex h-5 w-6 cursor-pointer items-center justify-center rounded text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent"
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
    </button>
  );
}

/** Suma de puntos de una lista, o `null` si ninguna está estimada. */
function sumaDePuntos(lista: Task[]): number | null {
  const estimadas = lista.filter((t) => t.estimatePoints !== null);
  if (estimadas.length === 0) return null;
  return estimadas.reduce((suma, t) => suma + (t.estimatePoints ?? 0), 0);
}
