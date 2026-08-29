'use client';

import {
  type Board,
  type Label as LabelType,
  type Priority,
  type Task,
  type UserProfile,
  alpha,
  colors,
  dueState,
} from '@praxis/commons';
import { useMemo, useState } from 'react';
import { TaskDialog } from '../TaskBoard/TaskDialog';
import { useTaskDialog } from '../TaskBoard/useTaskDialog';

export interface BoardCalendarProps {
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

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** `YYYY-MM-DD` en horario local, para agrupar tareas por día sin líos de zona. */
function claveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tonoDePrioridad(p: Priority): string {
  return p === 'URGENT'
    ? colors.error
    : p === 'HIGH'
      ? colors.warning
      : p === 'MEDIUM'
        ? colors.info
        : colors.textSecondary;
}

/**
 * La vista de **calendario** del tablero: una cuadrícula de mes con las tareas
 * puestas en su fecha de vencimiento. Las tareas **sin fecha** viven en su
 * propio panel al lado, para que no desaparezcan. Pulsar una abre el panel de
 * siempre.
 *
 * Solo lectura de las mismas tareas: no se arrastran entre días. Cambiar el
 * vencimiento se hace desde el panel de la tarea.
 */
export function BoardCalendar({
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
}: BoardCalendarProps) {
  const nombreDeColumna = useMemo(
    () => new Map(board.columns.map((c) => [c.id, c.name])),
    [board.columns],
  );
  const dialog = useTaskDialog(tasks, openTaskId);

  const hoy = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));

  const { conFecha, sinFecha } = useMemo(() => {
    const map = new Map<string, Task[]>();
    const nada: Task[] = [];
    for (const t of tasks) {
      if (!t.dueDate) {
        nada.push(t);
        continue;
      }
      const k = claveDia(new Date(t.dueDate));
      let list = map.get(k);
      if (!list) {
        list = [];
        map.set(k, list);
      }
      list.push(t);
    }
    return { conFecha: map, sinFecha: nada };
  }, [tasks]);

  /** Las 6 semanas (42 celdas) que cubren el mes, empezando en lunes. */
  const celdas = useMemo(() => {
    const primero = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const desplazamiento = (primero.getDay() + 6) % 7; // 0 = lunes
    const inicio = new Date(primero);
    inicio.setDate(primero.getDate() - desplazamiento);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      return d;
    });
  }, [cursor]);

  const claveHoy = claveDia(hoy);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      {/* ── Calendario ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0a]">
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2.5">
          <h4 className="font-sans text-lg font-semibold text-white">
            {MESES[cursor.getMonth()]} {cursor.getFullYear()}
          </h4>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCursor(new Date(hoy.getFullYear(), hoy.getMonth(), 1))}
              className="rounded-md px-2.5 py-1 font-sans text-xs font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              Hoy
            </button>
            <button
              type="button"
              aria-label="Mes anterior"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              aria-label="Mes siguiente"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Chevron dir="right" />
            </button>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-7 border-b border-white/10">
          {DIAS.map((d) => (
            <div
              key={d}
              className="px-2 py-1.5 text-center font-sans text-[10px] font-semibold uppercase tracking-wider text-white/35"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-y-auto">
          {celdas.map((d) => {
            const k = claveDia(d);
            const delMes = d.getMonth() === cursor.getMonth();
            const esHoy = k === claveHoy;
            const delDia = conFecha.get(k) ?? [];
            return (
              <div
                key={k}
                className={`flex min-h-[6.5rem] flex-col gap-1 border-b border-r border-white/[0.06] p-1.5 ${
                  delMes ? '' : 'bg-black/30'
                }`}
              >
                <span
                  className={`self-start rounded px-1 font-sans text-[11px] font-medium ${
                    esHoy
                      ? 'bg-primary text-primary-foreground'
                      : delMes
                        ? 'text-white/55'
                        : 'text-white/20'
                  }`}
                >
                  {d.getDate()}
                </span>
                <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-none">
                  {delDia.map((t) => (
                    <TareaChip key={t.id} task={t} onClick={() => dialog.open(t.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Sin fecha ── */}
      <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0a] lg:w-64">
        <div className="shrink-0 border-b border-white/10 px-3 py-2.5">
          <h4 className="font-sans text-sm font-semibold text-white">
            Sin fecha <span className="font-normal text-white/35">{sinFecha.length}</span>
          </h4>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          {sinFecha.length === 0 ? (
            <p className="px-1 py-2 font-sans text-[11px] text-white/30">
              Todas las tareas tienen fecha.
            </p>
          ) : (
            sinFecha.map((t) => (
              <TareaChip
                key={t.id}
                task={t}
                grande
                columna={nombreDeColumna.get(t.columnId)}
                onClick={() => dialog.open(t.id)}
              />
            ))
          )}
        </div>
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

function TareaChip({
  task,
  onClick,
  grande = false,
  columna,
}: {
  task: Task;
  onClick: () => void;
  grande?: boolean;
  columna?: string;
}) {
  const due = dueState(task.dueDate);
  const tono = due === 'overdue' ? colors.error : tonoDePrioridad(task.priority);
  return (
    <button
      type="button"
      onClick={onClick}
      title={task.title}
      className={`flex w-full items-center gap-1.5 rounded px-1.5 text-left transition-opacity hover:opacity-80 ${
        grande ? 'py-1.5' : 'py-0.5'
      }`}
      style={{ background: alpha(tono, grande ? 12 : 16) }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tono }} />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate font-sans font-medium ${grande ? 'text-[12px] text-white' : 'text-[10px] text-white/90'}`}
        >
          {task.title}
        </span>
        {grande && columna && (
          <span className="block truncate font-sans text-[10px] text-white/35">{columna}</span>
        )}
      </span>
    </button>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
      />
    </svg>
  );
}
