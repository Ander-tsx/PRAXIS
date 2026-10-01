'use client';

import {
  Avatar,
  type Board,
  type Column,
  type ColumnColor,
  DONE_COLUMN_COLOR,
  type Label as LabelType,
  PRIORITY_LABELS,
  type Priority,
  type Task,
  type UserProfile,
  alpha,
  avatarHref,
  colors,
  dueState,
  personLabel,
} from '@praxis/commons';
import { useMemo, useState } from 'react';
import { TaskDialog } from '../TaskBoard/TaskDialog';
import { useTaskDialog } from '../TaskBoard/useTaskDialog';

export interface BoardTableProps {
  board: Board;
  projectId: string;
  tasks: Task[];
  members: UserProfile[];
  labels: LabelType[];
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  openTaskId?: string | null;
  canMoveTask: boolean;
  canComment: boolean;
  canManageLabels: boolean;
  canEditTask: boolean;
  canDeleteTask: boolean;
}

type Col = 'titulo' | 'columna' | 'vencimiento' | 'prioridad';
const PRIORIDAD_ORDEN: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const fechaCorta = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

/** Mismo reparto de respaldo que `BoardColumns`: solo entra en juego si `color` no se reconoce. */
const COLUMN_TINTS = [colors.primary, colors.accent, colors.info, colors.success, colors.warning];

function tintOf(color: ColumnColor, index: number): string {
  return colors[color] ?? COLUMN_TINTS[index % COLUMN_TINTS.length];
}

/**
 * La vista de **tabla** del tablero: una fila por tarea, con sus columnas
 * relevantes. Ordena por cualquier cabecera; pulsar una fila abre el mismo panel
 * que en Kanban.
 *
 * Es solo lectura de la misma lista de tareas — no arrastra, no mueve. Para eso
 * está Kanban; aquí lo que se busca es ver todo de un vistazo y ordenar.
 */
export function BoardTable({
  board,
  projectId,
  tasks,
  members,
  labels,
  usersById,
  currentUserId,
  openTaskId,
  canMoveTask,
  canComment,
  canManageLabels,
  canEditTask,
  canDeleteTask,
}: BoardTableProps) {
  const nombreDeColumna = useMemo(
    () => new Map(board.columns.map((c) => [c.id, c.name])),
    [board.columns],
  );
  const columnasById = useMemo(() => new Map(board.columns.map((c) => [c.id, c])), [board.columns]);
  const ordenDeColumna = useMemo(
    () => new Map([...board.columns].sort((a, b) => a.order - b.order).map((c, i) => [c.id, i])),
    [board.columns],
  );
  /** Columnas de cierre: lo que hay dentro está entregado. Ver `DONE_COLUMN_COLOR`. */
  const columnasDeCierre = useMemo(
    () => new Set(board.columns.filter((c) => c.color === DONE_COLUMN_COLOR).map((c) => c.id)),
    [board.columns],
  );

  const [orden, setOrden] = useState<{ col: Col; asc: boolean }>({ col: 'columna', asc: true });
  const dialog = useTaskDialog(tasks, openTaskId);

  const filas = useMemo(() => {
    const arr = [...tasks];
    const dir = orden.asc ? 1 : -1;
    arr.sort((a, b) => {
      switch (orden.col) {
        case 'titulo':
          return dir * a.title.localeCompare(b.title, 'es');
        case 'columna': {
          const d = (ordenDeColumna.get(a.columnId) ?? 99) - (ordenDeColumna.get(b.columnId) ?? 99);
          return dir * (d !== 0 ? d : a.order - b.order);
        }
        case 'vencimiento': {
          const av = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
          const bv = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
          return dir * (av - bv);
        }
        case 'prioridad':
          return dir * (PRIORIDAD_ORDEN[a.priority] - PRIORIDAD_ORDEN[b.priority]);
      }
    });
    return arr;
  }, [tasks, orden, ordenDeColumna]);

  /**
   * Completadas aparte, igual que en Calendario: mezcladas con lo pendiente,
   * una tabla larga se lee como si quedara más trabajo del que en realidad
   * queda.
   */
  const pendientes = useMemo(
    () => filas.filter((t) => !columnasDeCierre.has(t.columnId)),
    [filas, columnasDeCierre],
  );
  const completadas = useMemo(
    () => filas.filter((t) => columnasDeCierre.has(t.columnId)),
    [filas, columnasDeCierre],
  );

  function alOrdenar(col: Col) {
    setOrden((o) => (o.col === col ? { col, asc: !o.asc } : { col, asc: true }));
  }

  if (tasks.length === 0) {
    return (
      <div className="flex h-fit max-h-full w-full items-center justify-center rounded-xl border border-white/10 bg-[#202020] p-10 text-center">
        <p className="font-sans text-sm text-white">Este tablero todavía no tiene tareas.</p>
      </div>
    );
  }

  return (
    <div className="h-fit max-h-full overflow-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20 w-full rounded-xl border border-white/10 bg-[#202020]">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-[#202020]">
          <tr className="border-b border-white/10 font-sans text-[11px] font-semibold uppercase tracking-wider text-white">
            <Th
              col="titulo"
              orden={orden}
              onSort={alOrdenar}
              className="min-w-[16rem] border border-white/5"
            >
              Tarea
            </Th>
            <Th
              col="columna"
              orden={orden}
              onSort={alOrdenar}
              className="w-40 border border-white/5"
            >
              Columna
            </Th>
            <th className="px-3 py-2.5 font-semibold border border-white/5">Encargados</th>
            <th className="px-3 py-2.5 font-semibold border border-white/5">Etiquetas</th>
            <Th
              col="vencimiento"
              orden={orden}
              onSort={alOrdenar}
              className="w-32 border border-white/5"
            >
              Vence
            </Th>
            <Th
              col="prioridad"
              orden={orden}
              onSort={alOrdenar}
              className="w-28 border border-white/5"
            >
              Prioridad
            </Th>
          </tr>
        </thead>
        <tbody>
          {pendientes.map((t, i) => (
            <FilaTarea
              key={t.id}
              task={t}
              columna={columnasById.get(t.columnId)}
              indiceDeColumna={ordenDeColumna.get(t.columnId) ?? i}
              nombreDeColumna={nombreDeColumna.get(t.columnId) ?? '—'}
              usersById={usersById}
              onOpen={() => dialog.open(t.id)}
            />
          ))}
        </tbody>

        {/* Completadas aparte: mezcladas con lo pendiente, la tabla se lee
            como si quedara más trabajo del que en realidad queda. */}
        {completadas.length > 0 && (
          <tbody>
            <tr aria-hidden="true">
              <td colSpan={6} className="border border-white/5 bg-black/20 px-3 py-1.5">
                <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  Completadas ({completadas.length})
                </span>
              </td>
            </tr>
            {completadas.map((t, i) => (
              <FilaTarea
                key={t.id}
                task={t}
                columna={columnasById.get(t.columnId)}
                indiceDeColumna={ordenDeColumna.get(t.columnId) ?? i}
                nombreDeColumna={nombreDeColumna.get(t.columnId) ?? '—'}
                usersById={usersById}
                onOpen={() => dialog.open(t.id)}
                atenuada
              />
            ))}
          </tbody>
        )}
      </table>

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

/**
 * Una fila de tarea. Separada de `BoardTable` para pintarse igual en las dos
 * secciones —pendientes y completadas— sin duplicar el JSX.
 */
function FilaTarea({
  task,
  columna,
  indiceDeColumna,
  nombreDeColumna,
  usersById,
  onOpen,
  atenuada = false,
}: {
  task: Task;
  columna: Column | undefined;
  indiceDeColumna: number;
  nombreDeColumna: string;
  usersById: Map<string, UserProfile>;
  onOpen: () => void;
  /** Ya se cuenta como completada: se atenúa para no competir con lo pendiente. */
  atenuada?: boolean;
}) {
  const t = task;
  const due = dueState(t.dueDate);
  const tonoColumna = columna ? tintOf(columna.color, indiceDeColumna) : colors.textSecondary;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: el equivalente de teclado es el <button> del título, cuyo click burbujea hasta aquí; el click en la fila es solo comodidad de ratón
    <tr
      onClick={onOpen}
      className={`cursor-pointer border-b border-white/[0.06] transition-colors last:border-0 hover:bg-[#282828] ${atenuada ? 'opacity-60' : ''}`}
    >
      <td className="px-3 py-2.5 border border-white/5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="block max-w-full truncate text-left font-sans text-[13px] font-medium text-white outline-none focus-visible:underline"
        >
          {t.title}
        </button>
      </td>
      <td className="px-3 py-2.5 border border-white/5">
        <span
          className="inline-flex items-center rounded-md px-2 py-0.5 font-sans text-[11px] font-medium"
          style={{ background: alpha(tonoColumna, 15), color: tonoColumna }}
        >
          {nombreDeColumna}
        </span>
      </td>
      <td className="px-3 py-2.5 border border-white/5">
        {t.assignees.length === 0 ? (
          <span className="font-sans text-[11px] text-white">—</span>
        ) : (
          <span className="flex -space-x-1.5">
            {t.assignees.slice(0, 4).map((a) => {
              const u = usersById.get(a.userId);
              return (
                <Avatar
                  key={a.id}
                  size="sm"
                  label={u ? personLabel(u) : '?'}
                  src={avatarHref(u?.avatarUrl, '/api/gateway')}
                />
              );
            })}
            {t.assignees.length > 4 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 font-sans text-[9px] text-white ring-2 ring-[#202020]">
                +{t.assignees.length - 4}
              </span>
            )}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 border border-white/5">
        <span className="flex flex-wrap gap-1">
          {t.labels.slice(0, 3).map(({ label }) => (
            <span
              key={label.id}
              className="rounded px-1.5 py-0.5 font-sans text-[10px] font-medium"
              style={{
                background: alpha(colors[label.color], 18),
                color: colors[label.color],
              }}
            >
              {label.name}
            </span>
          ))}
          {t.labels.length > 3 && (
            <span className="font-sans text-[10px] text-white">+{t.labels.length - 3}</span>
          )}
        </span>
      </td>
      <td className="px-3 py-2.5 border border-white/5">
        {t.dueDate ? (
          <span
            className={`font-sans text-[12px] ${
              due === 'overdue'
                ? 'font-semibold text-error'
                : due === 'soon'
                  ? 'text-warning'
                  : 'text-white'
            }`}
          >
            {fechaCorta.format(new Date(t.dueDate))}
          </span>
        ) : (
          <span className="font-sans text-[11px] text-white">Sin fecha</span>
        )}
      </td>
      <td className="px-3 py-2.5 border border-white/5">
        <PrioridadChip priority={t.priority} />
      </td>
    </tr>
  );
}

function Th({
  col,
  orden,
  onSort,
  className = '',
  children,
}: {
  col: Col;
  orden: { col: Col; asc: boolean };
  onSort: (c: Col) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const activo = orden.col === col;
  return (
    <th className={`px-3 py-2.5 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`flex items-center gap-1 font-semibold uppercase transition-colors hover:text-white ${
          activo ? 'text-white' : ''
        }`}
      >
        {children}
        {activo && (
          <svg
            className={`h-3 w-3 transition-transform ${orden.asc ? '' : 'rotate-180'}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 15l6-6 6 6" />
          </svg>
        )}
      </button>
    </th>
  );
}

function PrioridadChip({ priority }: { priority: Priority }) {
  const tono =
    priority === 'URGENT'
      ? colors.error
      : priority === 'HIGH'
        ? colors.warning
        : priority === 'MEDIUM'
          ? colors.info
          : colors.textSecondary;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-sans text-[11px] font-medium"
      style={{ background: alpha(tono, 15), color: tono }}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
