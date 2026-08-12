'use client';

import { moveTaskAction, reorderColumnsAction } from '@/app/(private)/[id]/actions';
import { COLUMN_INITIAL_STATE, TASK_INITIAL_STATE } from '@/lib/action-state';
import {
  type Board,
  type Column,
  type ColumnColor,
  type Label,
  type Task,
  type UserProfile,
  alpha,
  colors,
} from '@praxis/commons';
import { useActionState, useEffect, useRef, useState } from 'react';
import { ColumnTasks } from '../TaskBoard/ColumnTasks';
import { AddColumnCard } from './AddColumnCard';
import { ColumnMenu } from './ColumnMenu';

export interface BoardColumnsProps {
  board: Board;
  projectId: string;
  /**
   * Crear columnas. Es `canCreateColumn`, no `canCreateBoard` como estaba:
   * gatearlo con el de tableros ocultaba el botón a quien sí podía usarlo.
   */
  canCreateColumn: boolean;
  /** Renombrar y recolorear: `canEditColumn`. */
  canEditColumn: boolean;
  /** Eliminar una columna, y con ella sus tareas: `canDeleteColumn`. */
  canDeleteColumn: boolean;
  /** Tareas del tablero, ya cargadas por la page. */
  tasks: Task[];
  /** Gente del proyecto: a quién se puede asignar. */
  members: UserProfile[];
  /** Etiquetas del proyecto: las que se pueden poner. */
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
  /** Arrastrar una tarjeta a otra columna: `canMoveTask`, no `canEditTask`. */
  canMoveTask: boolean;
  /** Comentar en una tarea: `canComment`, no `canEditTask`. */
  canComment: boolean;
  canEditTask: boolean;
  canDeleteTask: boolean;
}

/**
 * Reparto por posición, solo como red de seguridad.
 *
 * Era la fuente del color hasta que `BoardColumn.color` existió, y tenía el
 * defecto de asignar **por índice**: reordenar una columna le cambiaba el color.
 * Hoy el color viene de la base y viaja con la columna; esto solo cubre el caso
 * de un valor que no reconozcamos, que no debería llegar.
 */
const COLUMN_TINTS = [colors.primary, colors.accent, colors.info, colors.success, colors.warning];

function tintOf(color: ColumnColor, index: number): string {
  return colors[color] ?? COLUMN_TINTS[index % COLUMN_TINTS.length];
}

/**
 * Columnas de un tablero, reordenables arrastrando.
 *
 * **El reordenado es en vivo:** al pasar sobre otra columna, las dos se
 * intercambian en el momento, así que lo que ves mientras arrastras es
 * exactamente cómo va a quedar. Esperar al soltar obligaba a imaginárselo.
 *
 * El intercambio se hace en `dragover` y se autoestabiliza: tras el cambio, el
 * cursor queda sobre la columna arrastrada, así que el siguiente `dragover` ve
 * origen y destino iguales y no hace nada. Sin eso, mantener el puntero quieto
 * sobre un vecino provocaría un parpadeo continuo.
 *
 * Se guarda al soltar, no en cada cruce: un arrastre largo son muchos
 * intercambios y no tiene sentido mandar una petición por cada uno.
 *
 * Usa la API nativa del navegador en vez de una librería: mover elementos en
 * una sola fila es el caso más simple del problema y no justifica la
 * dependencia.
 */
export function BoardColumns({
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
}: BoardColumnsProps) {
  const [columns, setColumns] = useState<Column[]>(() =>
    [...board.columns].sort((a, b) => a.order - b.order),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [, reorderAction] = useActionState(reorderColumnsAction, COLUMN_INITIAL_STATE);

  /**
   * Columna con el menú abierto. Mientras lo esté, esa columna no se arrastra.
   *
   * Dentro de un ancestro `draggable` el navegador no deja seleccionar texto con
   * el ratón: sin esto, el campo de renombrar no se podía ni marcar para
   * corregir una letra.
   */
  const [menuOpenColumnId, setMenuOpenColumnId] = useState<string | null>(null);

  /** Columna abierta a pantalla completa, si hay alguna. */
  const [columnaExpandidaId, setColumnaExpandidaId] = useState<string | null>(null);

  /** Tarea en vuelo. Mientras haya una, el arrastre de columnas se desactiva. */
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  /** Movimiento pendiente de guardar; lo dispara el formulario oculto. */
  const [pendingMove, setPendingMove] = useState<{
    taskId: string;
    columnId: string;
    status: string;
    order: number;
  } | null>(null);
  const [moveState, moveAction] = useActionState(moveTaskAction, TASK_INITIAL_STATE);
  const moveFormRef = useRef<HTMLFormElement>(null);

  const formRef = useRef<HTMLFormElement>(null);
  /** Orden con el que empezó el arrastre: si no cambia, no se guarda nada. */
  const orderAtDragStart = useRef<string>('');

  /**
   * Envía el movimiento cuando el estado ya está pintado.
   *
   * Va por un formulario oculto, como el reordenado de columnas: el gesto
   * termina en el cliente y no hay ningún botón que pulsar.
   */
  useEffect(() => {
    if (!pendingMove) return;
    queueMicrotask(() => moveFormRef.current?.requestSubmit());
  }, [pendingMove]);

  /** Agrupa por columna una sola vez, en vez de filtrar dentro del map. */
  const tasksByColumn = new Map<string, Task[]>();
  for (const task of tasks) {
    const list = tasksByColumn.get(task.columnId);
    if (list) list.push(task);
    else tasksByColumn.set(task.columnId, [task]);
  }
  for (const list of tasksByColumn.values()) {
    list.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Suelta una tarea en una columna.
   *
   * ⚠️ Manda `columnId` **y** `status`, y `status` es el **nombre** de la
   * columna destino, no su id: así lo modela el backend, y mandar el id dejaría
   * la tarea con un estado que no corresponde a ninguna columna.
   *
   * Va al final de la columna destino. Reordenar dentro de una columna sería
   * otro gesto y todavía no lo tenemos.
   */
  function dropTask(columnId: string) {
    const taskId = draggingTaskId;
    setDraggingTaskId(null);
    if (!taskId) return;

    const task = tasks.find((candidate) => candidate.id === taskId);
    const target = columns.find((column) => column.id === columnId);
    if (!task || !target) return;
    if (task.columnId === columnId) return;

    setPendingMove({
      taskId,
      columnId,
      status: target.name,
      order: tasksByColumn.get(columnId)?.length ?? 0,
    });
  }

  /**
   * El servidor manda: cuando la página revalida, el orden que llega sustituye
   * al local. Sin esto, un fallo al guardar dejaría la pantalla mintiendo.
   */
  useEffect(() => {
    setColumns([...board.columns].sort((a, b) => a.order - b.order));
  }, [board.columns]);

  /** Escape sale de la columna a pantalla completa, y el fondo no se desplaza. */
  useEffect(() => {
    if (!columnaExpandidaId) return;

    function alPulsarTecla(event: KeyboardEvent) {
      /**
       * ⚠️ Solo si no hay un diálogo abierto. Con una tarea abierta encima, el
       * `<dialog>` nativo ya cierra con Escape por su cuenta; si además
       * cerráramos aquí, una sola pulsación se llevaría las dos capas y
       * volverías al tablero sin haberlo pedido.
       */
      if (event.key !== 'Escape') return;
      if (document.querySelector('dialog[open]')) return;
      setColumnaExpandidaId(null);
    }

    const desbordeInicial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', alPulsarTecla);

    return () => {
      document.removeEventListener('keydown', alPulsarTecla);
      document.body.style.overflow = desbordeInicial;
    };
  }, [columnaExpandidaId]);

  /** La columna expandida, resuelta contra el orden vivo. */
  const columnaExpandida = columnaExpandidaId
    ? (columns.find((column) => column.id === columnaExpandidaId) ?? null)
    : null;

  function startDrag(id: string) {
    setDraggingId(id);
    orderAtDragStart.current = columns.map((column) => column.id).join(',');
  }

  /** Mueve una columna un puesto a izquierda o derecha y lo guarda. */
  function nudge(columnId: string, direction: -1 | 1) {
    const from = columns.findIndex((column) => column.id === columnId);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= columns.length) return;

    const next = [...columns];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    setColumns(next);
    queueMicrotask(() => formRef.current?.requestSubmit());
  }

  /** Mueve la columna arrastrada a la posición de `targetId`. */
  function moveOver(targetId: string) {
    if (!draggingId || draggingId === targetId) return;

    setColumns((current) => {
      const from = current.findIndex((column) => column.id === draggingId);
      const to = current.findIndex((column) => column.id === targetId);
      if (from === -1 || to === -1 || from === to) return current;

      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function endDrag() {
    setDraggingId(null);

    const finalOrder = columns.map((column) => column.id).join(',');
    if (finalOrder === orderAtDragStart.current) return;

    // Tras el repintado, para que el campo oculto lleve ya el orden final.
    queueMicrotask(() => formRef.current?.requestSubmit());
  }

  return (
    <>
      <form ref={formRef} action={reorderAction} className="hidden">
        <input type="hidden" name="boardId" value={board.id} />
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="columnIds" value={columns.map((c) => c.id).join(',')} />
      </form>

      <form ref={moveFormRef} action={moveAction} className="hidden">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="taskId" value={pendingMove?.taskId ?? ''} />
        <input type="hidden" name="columnId" value={pendingMove?.columnId ?? ''} />
        <input type="hidden" name="status" value={pendingMove?.status ?? ''} />
        <input type="hidden" name="order" value={pendingMove?.order ?? 0} />
      </form>

      {moveState.error && (
        <p role="alert" className="pb-2 font-sans text-xs" style={{ color: colors.error }}>
          {moveState.error}
        </p>
      )}

      <div className="scrollbar-none -mx-1 flex items-start gap-4 overflow-x-auto px-1 pb-2">
        {columns.map((column, index) => {
          const isDragging = column.id === draggingId;

          return (
            <div
              key={column.id}
              /* Mientras viaja una tarea la columna no se arrastra: si no, coger
                 una tarjeta acabaría moviendo la columna entera. Con el menú
                 abierto tampoco: dentro de un ancestro arrastrable no se puede
                 seleccionar texto, y el campo de renombrar está ahí dentro. */
              draggable={canEditColumn && !draggingTaskId && menuOpenColumnId !== column.id}
              onDragStart={(event) => {
                /**
                 * El estado se marca **primero**. `dataTransfer` es opcional
                 * —Firefox exige escribir algo para iniciar el arrastre, y hay
                 * contextos donde es de solo lectura y `setData` lanza—; si
                 * fuera lo primero, esa excepción abortaría el handler y el
                 * arrastre entero no haría nada.
                 */
                startDrag(column.id);
                try {
                  event.dataTransfer.setData('text/plain', column.id);
                  event.dataTransfer.effectAllowed = 'move';
                } catch {
                  // Sin dataTransfer el reordenado en vivo funciona igual.
                }
              }}
              onDragEnd={endDrag}
              onDragOver={(event) => {
                event.preventDefault();
                try {
                  event.dataTransfer.dropEffect = 'move';
                } catch {
                  // Irrelevante para el reordenado; solo cambia el cursor.
                }
                // Si lo que viaja es una tarea, el destino lo decide la zona de
                // tareas: reordenar columnas aquí sería un efecto colateral.
                if (!draggingTaskId) moveOver(column.id);
              }}
              onDrop={(event) => {
                // El orden ya está aplicado; soltar solo cierra el gesto.
                event.preventDefault();
                if (!draggingTaskId) endDrag();
              }}
              className={[
                'flex w-72 shrink-0 flex-col rounded-2xl bg-surface',
                /* La transición va sobre transform y sombra, no sobre layout:
                   animar posiciones aquí pelearía con el reordenado en vivo. */
                /* Sin `transform`: la columna arrastrada **no cambia de
                   tamaño**. Crecer la desalinea de sus vecinas y hace que el
                   hueco donde va a caer parezca de otra medida. La sombra y el
                   borde ya dicen cuál se está moviendo. */
                'transition-[box-shadow,opacity] duration-200 ease-out',
                /* Reordenar es editar la columna, igual que en el endpoint. */
                canEditColumn ? 'cursor-grab active:cursor-grabbing' : '',
                isDragging ? 'opacity-90' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                boxShadow: isDragging
                  ? `0 18px 40px ${alpha(colors.overlay, 55)}, 0 0 0 1px ${alpha(colors.primary, 35)}`
                  : `0 1px 0 ${alpha(colors.border, 45)}`,
                /* Sacar la columna arrastrada del flujo visual del resto. */
                zIndex: isDragging ? 10 : undefined,
              }}
            >
              <header className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full transition-colors"
                    style={{ background: tintOf(column.color, index) }}
                  />
                  <h5 className="truncate font-sans text-sm font-semibold text-text-primary">
                    {column.name}
                  </h5>
                </span>

                <span className="flex shrink-0 items-center gap-1">
                  {/* Reordenar sin arrastrar: el arrastre no llega al teclado ni
                      a un lector de pantalla, así que no puede ser la única
                      forma de mover una columna. */}
                  {canEditColumn && columns.length > 1 && (
                    <>
                      <NudgeButton
                        direction={-1}
                        disabled={index === 0}
                        columnName={column.name}
                        onClick={() => nudge(column.id, -1)}
                      />
                      <NudgeButton
                        direction={1}
                        disabled={index === columns.length - 1}
                        columnName={column.name}
                        onClick={() => nudge(column.id, 1)}
                      />
                    </>
                  )}
                  <span
                    className="rounded-full px-2 py-0.5 font-sans text-[11px] tabular-nums text-text-secondary"
                    style={{ background: alpha(colors.border, 60) }}
                  >
                    {tasksByColumn.get(column.id)?.length ?? 0}
                  </span>
                  <ColumnMenu
                    boardId={board.id}
                    projectId={projectId}
                    columnId={column.id}
                    columnName={column.name}
                    columnColor={column.color}
                    taskCount={tasksByColumn.get(column.id)?.length ?? 0}
                    canEdit={canEditColumn}
                    canDelete={canDeleteColumn}
                    onOpenChange={(isOpen) => setMenuOpenColumnId(isOpen ? column.id : null)}
                    onFullscreen={() => setColumnaExpandidaId(column.id)}
                  />
                </span>
              </header>

              <div className="px-2 pb-3">
                <ColumnTasks
                  projectId={projectId}
                  boardId={board.id}
                  column={column}
                  tasks={tasksByColumn.get(column.id) ?? []}
                  members={members}
                  labels={labels}
                  usersById={usersById}
                  currentUserId={currentUserId}
                  canCreate={canCreateTask}
                  canMove={canMoveTask}
                  openTaskId={openTaskId}
                  canComment={canComment}
                  canEdit={canEditTask}
                  canDelete={canDeleteTask}
                  draggingTaskId={draggingTaskId}
                  onDragTask={setDraggingTaskId}
                  onDropTask={dropTask}
                />
              </div>
            </div>
          );
        })}

        {canCreateColumn && (
          <AddColumnCard boardId={board.id} projectId={projectId} nextOrder={columns.length} />
        )}
      </div>

      {/**
       * Una columna ocupando la pantalla.
       *
       * Es la misma `ColumnTasks` de la tira, solo que en rejilla: así el
       * diálogo de tarea, el arrastre y el formulario de añadir siguen siendo
       * los de siempre, sin una segunda implementación que se desincronice.
       *
       * ⚠️ **`openTaskId` no se pasa aquí.** Esta instancia convive con la de la
       * tira, y las dos abrirían la tarea que llega en la URL: dos `<dialog
       * open>` apilados sobre la misma tarea, y al cerrar uno queda el otro
       * detrás. La de la tira ya se encarga de ese caso.
       */}
      {columnaExpandida && (
        <div className="fixed inset-0 z-40 flex flex-col gap-4 bg-background p-5">
          <header className="flex flex-wrap items-center gap-3">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                background: tintOf(columnaExpandida.color, columns.indexOf(columnaExpandida)),
              }}
              aria-hidden="true"
            />
            <h4 className="font-sans text-lg font-semibold text-text-primary">
              {columnaExpandida.name}
            </h4>
            <span className="font-sans text-xs text-text-secondary">
              {board.name} · {(() => {
                const total = tasksByColumn.get(columnaExpandida.id)?.length ?? 0;
                return `${total} ${total === 1 ? 'tarea' : 'tareas'}`;
              })()}
            </span>

            <button
              type="button"
              onClick={() => setColumnaExpandidaId(null)}
              aria-label={`Salir de pantalla completa de la columna ${columnaExpandida.name}`}
              title="Salir de pantalla completa (Esc)"
              className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-sans text-xs text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 9V4M9 9H4M9 9L4 4m11 5V4m0 5h5m-5 0l5-5M9 15v5m0-5H4m5 0l-5 5m11-5v5m0-5h5m-5 0l5 5"
                />
              </svg>
              Salir
            </button>
          </header>

          <ColumnTasks
            projectId={projectId}
            boardId={board.id}
            column={columnaExpandida}
            tasks={tasksByColumn.get(columnaExpandida.id) ?? []}
            members={members}
            labels={labels}
            usersById={usersById}
            currentUserId={currentUserId}
            canCreate={canCreateTask}
            canMove={canMoveTask}
            canComment={canComment}
            canEdit={canEditTask}
            canDelete={canDeleteTask}
            draggingTaskId={draggingTaskId}
            onDragTask={setDraggingTaskId}
            onDropTask={dropTask}
            layout="rejilla"
          />
        </div>
      )}
    </>
  );
}

function NudgeButton({
  direction,
  disabled,
  columnName,
  onClick,
}: {
  direction: -1 | 1;
  disabled: boolean;
  columnName: string;
  onClick: () => void;
}) {
  const label = direction === -1 ? 'Mover a la izquierda' : 'Mover a la derecha';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label} la columna ${columnName}`}
      title={label}
      className="rounded p-0.5 text-text-disabled transition-colors hover:text-text-primary disabled:opacity-25 disabled:hover:text-text-disabled"
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={direction === -1 ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'}
        />
      </svg>
    </button>
  );
}
