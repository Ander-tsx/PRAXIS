'use client';

import { createBacklogTaskAction } from '@/app/(privado)/projects/[id]/sprint-actions';
import { SPRINT_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  type Board,
  type Column,
  PRIORITIES,
  PRIORITY_LABELS,
  type Sprint,
  type Task,
  type UserProfile,
  personLabel,
  useAccion,
} from '@praxis/commons';
import { useEffect, useMemo, useState } from 'react';
import { MIME_BACKLOG } from './BoardColumns';
import { porOrden } from './scrum';

export interface BacklogDrawerProps {
  abierto: boolean;
  onCerrar: () => void;
  board: Board;
  projectId: string;
  /** Todas las tareas del tablero: aquí se enseñan las que no tienen sprint. */
  tasks: Task[];
  /** El sprint en curso. Sin él, se puede escribir en el backlog pero no traer nada. */
  activo: Sprint | null;
  members: UserProfile[];
  usersById: Map<string, UserProfile>;
  canCreateTask: boolean;
  /** Traer una tarea al sprint es un `PATCH`: `canEditTask`. */
  canEditTask: boolean;
  /** Mete la tarea en el sprint en curso, en esa columna. Lo resuelve el tablero. */
  onTraer: (taskId: string, column: Column) => void;
  trayendo: boolean;
  error: string | null;
}

/**
 * El backlog del tablero, en un panel lateral (D14 de
 * `docs/PLAN-SCRUM-KANBAN.md`).
 *
 * Es lo que no está en ningún sprint. Desde aquí solo se va **al sprint en
 * curso**: arrastrando la tarjeta hasta una columna, o —en el móvil, donde
 * arrastrar pelea con el desplazamiento— con el «→ columna» de cada fila.
 *
 * En el escritorio no oscurece el tablero: tiene que verse para poder soltar
 * en él. Se cierra con la ×, con Escape o volviendo a pulsar «Backlog».
 */
export function BacklogDrawer({
  abierto,
  onCerrar,
  board,
  projectId,
  tasks,
  activo,
  members,
  usersById,
  canCreateTask,
  canEditTask,
  onTraer,
  trayendo,
  error,
}: BacklogDrawerProps) {
  const [estadoAlta, crear, creando] = useAccion(createBacklogTaskAction, SPRINT_INITIAL_STATE);
  const [formularioAbierto, setFormularioAbierto] = useState(false);

  const backlog = useMemo(() => tasks.filter((t) => t.sprintId === null).sort(porOrden), [tasks]);
  const columnas = useMemo(() => [...board.columns].sort((a, b) => a.order - b.order), [board]);
  const primera = columnas[0];
  const puntos = backlog.reduce((s, t) => s + (t.estimatePoints ?? 0), 0);
  const puedeTraer = canEditTask && activo !== null;

  useEffect(() => {
    if (!abierto) return;
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar();
    }
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [abierto, onCerrar]);

  /* Alta confirmada: el formulario se vacía solo (`action=`) y se pliega. */
  const [ultimaAlta, setUltimaAlta] = useState<string | null>(null);
  if (estadoAlta.done && estadoAlta.done !== ultimaAlta) {
    setUltimaAlta(estadoAlta.done);
    setFormularioAbierto(false);
  }

  /* Cerrado no existe: montado y escondido, sus tareas seguirían en la página
     —para un lector de pantalla y para cualquier búsqueda— como si estuvieran
     en el tablero. */
  if (!abierto) return null;

  return (
    <aside
      aria-label="Backlog del tablero"
      className="animate-entrar-desde-la-derecha fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-[#161616] shadow-2xl sm:w-[25rem]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 pb-4 pt-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl text-text-primary">Backlog</h2>
          <p className="font-sans text-xs text-text-secondary">
            {backlog.length} {backlog.length === 1 ? 'tarea' : 'tareas'} fuera de sprint
            {puntos > 0 && ` · ${puntos} pt`}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el backlog"
          className="cursor-pointer rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <p className="border-b border-border px-5 py-3 font-sans text-xs leading-snug text-text-secondary">
        {activo ? (
          <>
            Arrastra una tarea a una columna para meterla en{' '}
            <span className="text-text-primary">{activo.name}</span>.
          </>
        ) : (
          'No hay sprint en curso: puedes llenar el backlog, y traerás tareas cuando empiece uno.'
        )}
      </p>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {canCreateTask && primera && (
          <div className="border-b border-border px-5 py-3">
            {!formularioAbierto ? (
              <button
                type="button"
                onClick={() => setFormularioAbierto(true)}
                className="flex w-full cursor-pointer items-center gap-2 font-sans text-sm text-primary"
              >
                <span aria-hidden="true">+</span> Nueva tarea en el backlog
              </button>
            ) : (
              /* `action=`: es un formulario de alta, vaciarse al enviar es lo que se quiere. */
              <form action={crear} className="flex flex-col gap-3">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="boardId" value={board.id} />
                <input type="hidden" name="columnId" value={primera.id} />
                <input type="hidden" name="status" value={primera.name} />
                <input type="hidden" name="order" value={backlog.length} />

                <Campo etiqueta="Título">
                  <input name="title" required maxLength={255} autoFocus className={ESTILO_CAMPO} />
                </Campo>
                <Campo etiqueta="Descripción (opcional)">
                  <textarea name="description" rows={3} className={`${ESTILO_CAMPO} resize-y`} />
                </Campo>
                <div className="grid grid-cols-2 gap-3">
                  <Campo etiqueta="Prioridad">
                    <select name="priority" defaultValue="MEDIUM" className={ESTILO_CAMPO}>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo etiqueta="Puntos">
                    <input
                      name="estimatePoints"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={999}
                      placeholder="Sin estimar"
                      className={ESTILO_CAMPO}
                    />
                  </Campo>
                </div>
                <Campo etiqueta="Encargado">
                  <select name="assigneeIds" defaultValue="" className={ESTILO_CAMPO}>
                    <option value="">Sin encargado</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {personLabel(m)}
                      </option>
                    ))}
                  </select>
                </Campo>
                {estadoAlta.error && (
                  <p role="alert" className="font-sans text-xs text-error">
                    {estadoAlta.error}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={creando}
                    className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 font-sans text-xs font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-60"
                  >
                    {creando ? 'Añadiendo…' : 'Añadir al backlog'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormularioAbierto(false)}
                    className="cursor-pointer px-2 py-1.5 font-sans text-xs text-text-secondary hover:text-text-primary"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="px-5 pt-3 font-sans text-xs text-error">
            {error}
          </p>
        )}

        {backlog.length === 0 ? (
          <p className="px-5 py-6 font-sans text-sm text-text-secondary">
            Nada pendiente fuera de un sprint.
          </p>
        ) : (
          <ul className="flex flex-col">
            {backlog.map((task) => {
              const encargado = task.assignees?.[0]
                ? usersById.get(task.assignees[0].userId)
                : undefined;
              return (
                <li
                  key={task.id}
                  draggable={puedeTraer}
                  onDragStart={(evento) => {
                    evento.dataTransfer.setData(MIME_BACKLOG, task.id);
                    evento.dataTransfer.effectAllowed = 'move';
                  }}
                  className={`flex flex-col gap-1.5 border-b border-border px-5 py-3 ${
                    puedeTraer ? 'cursor-grab active:cursor-grabbing' : ''
                  }`}
                >
                  <span className="font-sans text-sm text-text-primary">{task.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[11px] text-text-secondary">
                    <span>{PRIORITY_LABELS[task.priority]}</span>
                    {task.estimatePoints !== null && <span>· {task.estimatePoints} pt</span>}
                    {encargado && <span>· {personLabel(encargado)}</span>}
                    {puedeTraer && (
                      <select
                        aria-label={`Meter «${task.title}» en el sprint, en la columna`}
                        value=""
                        disabled={trayendo}
                        onChange={(e) => {
                          const columna = columnas.find((c) => c.id === e.target.value);
                          if (columna) onTraer(task.id, columna);
                        }}
                        className="ml-auto cursor-pointer rounded-md border border-border bg-transparent px-1.5 py-0.5 text-[11px] text-text-secondary focus:border-primary focus:outline-none"
                      >
                        <option value="">→ columna</option>
                        {columnas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

const ESTILO_CAMPO =
  'w-full rounded-lg border border-border bg-[#1c1c1b] px-2.5 py-1.5 font-sans text-sm text-text-primary outline-none focus:border-primary [color-scheme:dark]';

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 font-sans text-[11px] text-text-secondary">
      {etiqueta}
      {children}
    </label>
  );
}
