'use client';

import { moveTaskDueDateAction } from '@/app/(privado)/projects/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  Avatar,
  type Board,
  DONE_COLUMN_COLOR,
  type Label as LabelType,
  type Priority,
  type Task,
  type UserProfile,
  alpha,
  avatarHref,
  colors,
  dueState,
  personLabel,
  useAccion,
} from '@praxis/commons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
 * Se arrastra una tarea a otro día para cambiar su vencimiento (o a «sin
 * fecha» para quitárselo), con el mismo permiso que mueve tarjetas en Kanban
 * (`canMoveTask`). Sin él, la tarea se sigue pudiendo abrir, solo que no
 * arrastrar.
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
  const [mostrarSinFecha, setMostrarSinFecha] = useState(false);

  /**
   * Arrastrar una tarea a otro día cambia su vencimiento, y se guarda solo.
   *
   * Es arrastre nativo (`draggable`), no el motor a medida del Kanban
   * (`arrastre.ts`): aquí el destino es un día entero, no «entre qué dos
   * tarjetas», que es justo la precisión que ese motor existe para dar. Sin
   * esa necesidad, la API nativa del navegador basta y no hay que reconstruir
   * la medición de rectángulos para esto.
   */
  const [moveState, moveAction] = useAccion(moveTaskDueDateAction, TASK_INITIAL_STATE);
  const [diaSobrevolado, setDiaSobrevolado] = useState<string | null>(null);
  /** Adelanta el resultado en pantalla mientras el servidor confirma. `null` es «sin fecha». */
  const [overrides, setOverrides] = useState<Map<string, string | null>>(new Map());
  const colaDeMovimientos = useRef<string[]>([]);
  const ultimoResultado = useRef(moveState);

  useEffect(() => {
    if (moveState === ultimoResultado.current) return;
    ultimoResultado.current = moveState;
    const taskId = colaDeMovimientos.current.shift();
    if (!taskId || !moveState.error) return;
    /* Falló: se deshace el adelanto y la tarea vuelve a su día de verdad. */
    setOverrides((prev) => {
      const next = new Map(prev);
      next.delete(taskId);
      return next;
    });
  }, [moveState]);

  /* Cuando el servidor confirma —la tarea revalidada ya trae el día nuevo—
     el adelanto sobra: dejarlo puesto no cambiaría nada, pero mantenerlo
     indefinidamente arrastraría estado viejo si la tarea vuelve a moverse
     por otro medio (el panel, por ejemplo). */
  useEffect(() => {
    setOverrides((prev) => {
      if (prev.size === 0) return prev;
      let cambio = false;
      const next = new Map(prev);
      for (const [taskId, dueDate] of prev) {
        const task = tasks.find((t) => t.id === taskId);
        const diaReal = task?.dueDate ? claveDia(new Date(task.dueDate)) : null;
        if (task && diaReal === dueDate) {
          next.delete(taskId);
          cambio = true;
        }
      }
      return cambio ? next : prev;
    });
  }, [tasks]);

  /** Columnas de cierre: lo que hay dentro está entregado. Ver `DONE_COLUMN_COLOR`. */
  const columnasDeCierre = useMemo(
    () => new Set(board.columns.filter((c) => c.color === DONE_COLUMN_COLOR).map((c) => c.id)),
    [board.columns],
  );
  const estaCompletada = useCallback(
    (t: Task) => columnasDeCierre.has(t.columnId),
    [columnasDeCierre],
  );

  /**
   * El día de una tarea, ya como clave `YYYY-MM-DD`.
   *
   * ⚠️ **El adelanto se guarda como clave de día, no como ISO, y aquí no se
   * vuelve a pasar por `new Date(...)`.** `new Date('2026-09-19')` (sin hora)
   * se interpreta en UTC; en un huso al oeste de Greenwich, `getFullYear`/
   * `getDate` en horario **local** devuelven el día anterior. Solo se
   * reconstruye la fecha para lo que sí trae hora de verdad (`dueDate`,
   * `updatedAt`), que vienen en ISO completo del backend.
   */
  const diaDeTarea = useCallback(
    (t: Task): string | null => {
      if (overrides.has(t.id)) return overrides.get(t.id) ?? null;
      if (t.dueDate) return claveDia(new Date(t.dueDate));
      if (estaCompletada(t)) return claveDia(new Date(t.updatedAt));
      return null;
    },
    [overrides, estaCompletada],
  );

  /** `dia` es una clave `YYYY-MM-DD`, o `null` para soltar en «sin fecha». */
  function soltarEn(taskId: string, dia: string | null) {
    setDiaSobrevolado(null);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (diaDeTarea(task) === dia) return;

    setOverrides((prev) => new Map(prev).set(taskId, dia));

    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('taskId', taskId);
    datos.set('dueDate', dia ?? '');
    colaDeMovimientos.current.push(taskId);
    moveAction(datos);
  }

  const hoy = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));

  /**
   * Una tarea completada sin fecha de vencimiento no va a «sin fecha»: se
   * ubica el día en que se completó, para que no desaparezca del trabajo
   * hecho esa semana. Si sale de una columna de cierre sin tener vencimiento,
   * vuelve a «sin fecha» — la regla de arriba deja de aplicar.
   *
   * ⚠️ **No hay `completedAt` en el backend.** Se usa `updatedAt` como el
   * proxy disponible: es exacto en el caso normal (se completa y no se vuelve
   * a tocar), pero un cambio posterior —un comentario, reabrir y volver a
   * cerrar— movería la tarea de día sin que nadie la haya "completado" de
   * nuevo. Pendiente real en `docs/frontend/PENDIENTES-BACKEND.md`.
   */
  const { conFecha, sinFecha } = useMemo(() => {
    const map = new Map<string, Task[]>();
    const nada: Task[] = [];
    for (const t of tasks) {
      const k = diaDeTarea(t);
      if (!k) {
        nada.push(t);
        continue;
      }
      let list = map.get(k);
      if (!list) {
        list = [];
        map.set(k, list);
      }
      list.push(t);
    }
    return { conFecha: map, sinFecha: nada };
  }, [tasks, diaDeTarea]);

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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#202020]">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <h4 className="font-sans text-lg font-semibold text-white">
              {MESES[cursor.getMonth()]} {cursor.getFullYear()}
            </h4>
            <div className="ml-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCursor(new Date(hoy.getFullYear(), hoy.getMonth(), 1))}
                className="rounded-md px-2.5 py-1 font-sans text-xs font-medium text-white transition-colors hover:bg-white/5 hover:text-white"
              >
                Hoy
              </button>
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
                className="flex h-7 w-7 items-center justify-center rounded-md text-white transition-colors hover:bg-white/5 hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Mes siguiente"
                onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
                className="flex h-7 w-7 items-center justify-center rounded-md text-white transition-colors hover:bg-white/5 hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </div>
          {sinFecha.length > 0 && (
            <button
              type="button"
              onClick={() => setMostrarSinFecha((v) => !v)}
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-white/5"
            >
              <span>Sin fecha ({sinFecha.length})</span>
              <svg
                className={`w-4 h-4 transition-transform ${mostrarSinFecha ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          )}
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
                onDragOver={(e) => {
                  if (!canMoveTask) return;
                  e.preventDefault();
                  if (diaSobrevolado !== k) setDiaSobrevolado(k);
                }}
                onDragLeave={() => setDiaSobrevolado((actual) => (actual === k ? null : actual))}
                onDrop={(e) => {
                  if (!canMoveTask) return;
                  e.preventDefault();
                  soltarEn(e.dataTransfer.getData('text/plain'), k);
                }}
                className={`flex min-h-[6.5rem] flex-col gap-1 border-b border-r border-white/[0.06] p-1.5 transition-colors ${
                  delMes ? '' : 'bg-black/30'
                } ${diaSobrevolado === k ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : ''}`}
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
                    <TareaChip
                      key={t.id}
                      task={t}
                      usersById={usersById}
                      arrastrable={canMoveTask}
                      onClick={() => dialog.open(t.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Sin fecha ── */}
      {sinFecha.length > 0 && (
        <div
          onDragOver={(e) => {
            if (!canMoveTask) return;
            e.preventDefault();
            if (diaSobrevolado !== 'sin-fecha') setDiaSobrevolado('sin-fecha');
          }}
          onDragLeave={() =>
            setDiaSobrevolado((actual) => (actual === 'sin-fecha' ? null : actual))
          }
          onDrop={(e) => {
            if (!canMoveTask) return;
            e.preventDefault();
            soltarEn(e.dataTransfer.getData('text/plain'), null);
          }}
          className={`flex shrink-0 flex-col overflow-hidden rounded-xl bg-[#202020] border-white/10 transition-all duration-300 ease-in-out ${
            mostrarSinFecha ? 'w-full lg:w-64 opacity-100 border' : 'w-0 opacity-0 border-0'
          } ${diaSobrevolado === 'sin-fecha' ? 'bg-primary/10' : ''}`}
        >
          <div className="shrink-0 border-b border-white/10 px-3 py-2.5 flex items-center justify-between">
            <h4 className="font-sans text-sm font-semibold text-white whitespace-nowrap">
              Sin fecha <span className="font-normal text-white">{sinFecha.length}</span>
            </h4>
            <button
              type="button"
              onClick={() => setMostrarSinFecha(false)}
              className="text-text-secondary hover:text-white/70"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
            {sinFecha.map((t) => (
              <TareaChip
                key={t.id}
                task={t}
                usersById={usersById}
                arrastrable={canMoveTask}
                grande
                columna={nombreDeColumna.get(t.columnId)}
                onClick={() => dialog.open(t.id)}
              />
            ))}
          </div>
        </div>
      )}

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
  usersById,
  onClick,
  grande = false,
  columna,
  arrastrable = false,
}: {
  task: Task;
  usersById: Map<string, UserProfile>;
  onClick: () => void;
  grande?: boolean;
  columna?: string;
  /** Permiso de mover: sin él la tarea se puede abrir, pero no arrastrar. */
  arrastrable?: boolean;
}) {
  const due = dueState(task.dueDate);
  const tono = due === 'overdue' ? colors.error : tonoDePrioridad(task.priority);
  const primerEncargado = task.assignees[0];
  const usuario = primerEncargado ? usersById.get(primerEncargado.userId) : undefined;
  return (
    <button
      type="button"
      draggable={arrastrable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onClick}
      title={task.title}
      className={`flex w-full items-center gap-1.5 rounded px-1.5 text-left transition-opacity hover:opacity-80 ${
        grande ? 'py-1.5' : 'py-0.5'
      } ${arrastrable ? 'cursor-grab active:cursor-grabbing' : ''}`}
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
      {/* Quién la lleva, de un vistazo: antes solo se sabía abriendo la tarea. */}
      {primerEncargado && (
        <Avatar
          size="sm"
          label={usuario ? personLabel(usuario) : 'Alguien que ya no está en el proyecto'}
          src={avatarHref(usuario?.avatarUrl, '/api/gateway')}
          className="shrink-0"
        />
      )}
      {task.assignees.length > 1 && (
        <span className="shrink-0 font-sans text-[9px] text-white/40">
          +{task.assignees.length - 1}
        </span>
      )}
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
