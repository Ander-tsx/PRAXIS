'use client';

import { renameClosedColumnAction } from '@/app/(privado)/projects/[id]/sprint-actions';
import { SPRINT_INITIAL_STATE } from '@/lib/projects/action-state';
import { type Task, type UserProfile, alpha, colors, useAccion } from '@praxis/commons';
import { Check, Lock, Pencil, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { TaskCard } from '../TaskBoard/TaskCard';

/** El gris de la columna: **fijo**, no es un color de columna y no se elige. */
const GRIS = '#9b9b95';

export interface ColumnaCerradaProps {
  boardId: string;
  projectId: string;
  nombre: string;
  /** Lo terminado en sprints cerrados, lo último primero. */
  tareas: Task[];
  /** Cuántas hay en total; si es más que `tareas`, hay más por cargar. */
  total: number;
  /** El nombre de cada sprint, para la etiqueta de cada tarjeta. */
  nombreDeSprint: Map<string, string>;
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  /** Renombrar la columna es editar el tablero: `canEditBoard`. */
  puedeRenombrar: boolean;
  onOpenTask: (task: Task) => void;
  openTaskId: string | null;
  onCargarMas: () => void;
  cargandoMas: boolean;
  errorAlCargar: boolean;
}

/**
 * La columna final de un tablero con Scrum: **lo terminado en sprints ya cerrados**, de solo lectura.
 *
 * No es una columna de verdad. Las tareas no se mueven a ella —siguen en su columna de cierre y
 * en su sprint—: se **muestran** aquí por tener `completedAt` y un sprint cerrado. Por eso no
 * se registra en el motor de arrastre, no se reordena, no tiene menú de color ni de borrado, y
 * sus tarjetas se abren pero no se editan. Lo que no se terminó pasó al siguiente sprint o al
 * backlog al cerrar, y no sale aquí.
 *
 * Solo se puede cambiar cómo se llama (`closedColumnName` del tablero), y el gris no.
 */
export function ColumnaCerrada({
  boardId,
  projectId,
  nombre,
  tareas,
  total,
  nombreDeSprint,
  usersById,
  currentUserId,
  puedeRenombrar,
  onOpenTask,
  openTaskId,
  onCargarMas,
  cargandoMas,
  errorAlCargar,
}: ColumnaCerradaProps) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(nombre);
  /* Lo que se acaba de guardar, hasta que la página revalidada traiga el nombre nuevo. */
  const [guardado, setGuardado] = useState<string | null>(null);
  const [estado, accion, guardando] = useAccion(renameClosedColumnAction, SPRINT_INITIAL_STATE);
  const visible = guardado ?? nombre;

  function empezar() {
    setBorrador(visible);
    setEditando(true);
  }

  /** `onSubmit` + `FormData` a mano: un `<form action>` se resetea al terminar (ver CLAUDE.md). */
  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const limpio = borrador.trim();
    setEditando(false);
    if (limpio === visible) return;
    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('boardId', boardId);
    datos.set('name', limpio);
    setGuardado(limpio || 'Closed');
    accion(datos);
  }

  return (
    <div
      className="flex h-fit max-h-full w-72 shrink-0 flex-col overflow-hidden rounded-2xl bg-surface-2 max-md:w-[calc(100vw-3rem)] max-md:snap-center"
      style={{ boxShadow: `0 1px 0 ${alpha(colors.border, 45)}` }}
      data-columna-cerrada
    >
      <header className="flex shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-4">
        {editando ? (
          <form onSubmit={guardar} className="flex min-w-0 flex-1 items-center gap-1">
            <input
              // biome-ignore lint/a11y/noAutofocus: se entra a renombrar a propósito
              autoFocus
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditando(false);
                }
              }}
              maxLength={40}
              aria-label="Nombre de la columna"
              placeholder="Closed"
              className="min-w-0 flex-1 rounded-full bg-white/[0.08] px-2.5 py-0.5 font-sans text-sm font-semibold text-white outline-none ring-1 ring-white/20 focus:ring-white/40"
            />
            <button
              type="submit"
              aria-label="Guardar nombre"
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-white hover:bg-white/10"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Cancelar"
              onClick={() => setEditando(false)}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-white hover:bg-white/10"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5">
            <h5
              className="truncate rounded-full px-2.5 py-0.5 font-sans text-sm font-semibold"
              style={{ background: alpha(GRIS, 16), color: GRIS }}
            >
              {visible}
            </h5>
            {puedeRenombrar && (
              <button
                type="button"
                onClick={empezar}
                disabled={guardando}
                aria-label="Renombrar la columna"
                title="Renombrar"
                className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-text-secondary transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </span>
        )}

        <span className="flex shrink-0 items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-text-secondary" aria-label="Solo lectura" role="img" />
          <span
            className="rounded-full px-2 py-0.5 font-sans text-[11px] tabular-nums text-white"
            style={{ background: alpha(colors.border, 60) }}
          >
            {total}
          </span>
        </span>
      </header>

      {estado.error && (
        <p role="alert" className="px-4 pb-2 font-sans text-xs text-error">
          {estado.error}
        </p>
      )}

      <div /* `pt-1`/`pb-1` de más: el borde de «tarjeta abierta» o de hover es un `outline` de 2 px que
          sale de la tarjeta, y el contenedor con scroll recorta lo que sobresale: la primera tarjeta
          lo perdía por arriba. */
        className="scrollbar-none flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-4 pt-1"
      >
        {tareas.length === 0 ? (
          <p className="px-2 py-4 font-sans text-xs text-text-secondary">
            Aquí se verá lo que termines en cada sprint, ya cerrado. Es solo de lectura.
          </p>
        ) : (
          tareas.map((tarea) => (
            <TaskCard
              key={tarea.id}
              task={tarea}
              usersById={usersById}
              currentUserId={currentUserId}
              onOpen={() => onOpenTask(tarea)}
              canEdit={false}
              isOpen={openTaskId === tarea.id}
              isDone
              draggable={false}
              etiquetaDeSprint={
                (tarea.sprintId && nombreDeSprint.get(tarea.sprintId)) || 'Sprint cerrado'
              }
            />
          ))
        )}

        {errorAlCargar && (
          <p role="alert" className="px-2 font-sans text-xs text-error">
            No se pudieron cargar más tareas.
          </p>
        )}
        {tareas.length < total && (
          <button
            type="button"
            onClick={onCargarMas}
            disabled={cargandoMas}
            className="cursor-pointer rounded-lg px-3 py-2 text-center font-sans text-xs text-text-secondary transition-colors hover:bg-white/5 hover:text-white disabled:cursor-wait disabled:opacity-60"
          >
            {cargandoMas ? 'Cargando…' : `Cargar más (${total - tareas.length})`}
          </button>
        )}
      </div>
    </div>
  );
}
