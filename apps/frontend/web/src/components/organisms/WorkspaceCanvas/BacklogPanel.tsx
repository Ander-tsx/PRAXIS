'use client';

import { createBacklogTaskAction } from '@/app/(privado)/projects/[id]/sprint-actions';
import { SPRINT_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  type Board,
  type Column,
  type Label,
  SlideOver,
  type Task,
  type UserProfile,
  colors,
  useAccion,
} from '@praxis/commons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ColumnTasks } from '../TaskBoard/ColumnTasks';
import type { ArrastreEnCurso, DestinoDeTarea, Disposicion } from '../TaskBoard/arrastre';
import { BACKLOG } from './scrum';

export interface BacklogPanelProps {
  abierto: boolean;
  onCerrar: () => void;
  board: Board;
  projectId: string;
  /** Las del backlog, en su orden y con los movimientos optimistas aplicados. */
  tareas: Task[];
  members: UserProfile[];
  labels: Label[];
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  canCreate: boolean;
  /** Arrastrar entre el backlog y el sprint es planificar: `canEditTask`. */
  canMove: boolean;
  canComment: boolean;
  canManageLabels: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onOpenTask: (task: Task) => void;
  openTaskId: string | null;
  ultimoGuardado: { taskId: string; nonce: number } | null;
  /* El motor de arrastre del tablero: el panel se registra en él como una
     columna más (`BACKLOG`). */
  arrastre: ArrastreEnCurso | null;
  destino: DestinoDeTarea | null;
  alEmpezarArrastre: (taskId: string, columnId: string, evento: React.PointerEvent) => void;
  registrarColumna: (columnId: string, el: HTMLElement | null) => void;
  registrarLista: (columnId: string, el: HTMLElement | null, disposicion: Disposicion) => void;
  registrarTarjeta: (columnId: string, taskId: string, el: HTMLElement | null) => void;
  registrarReposicion: (id: string, el: HTMLElement | null) => void;
  alDesplazar: () => void;
}

/**
 * El backlog del tablero, en un panel lateral como el de la tarea (D17 de
 * `docs/PLAN-SCRUM-KANBAN.md`).
 *
 * Empuja el tablero en vez de taparlo, así que **las columnas siguen a la
 * vista** para soltar en ellas. Las tarjetas son las mismas del tablero y el
 * gesto es el mismo: el panel es una columna más del motor de arrastre, con
 * su fantasma, su hueco exacto y su movimiento instantáneo. Desde aquí:
 *
 * - se **escribe** una tarea nueva (solo el título; lo demás al abrirla),
 * - se **ordena** arrastrando —arriba lo más importante—,
 * - se **abre** una tarea para refinarla,
 * - se **lleva** al sprint soltándola en una columna, y se devuelve soltándola
 *   aquí.
 *
 * No se cierra al hacer clic fuera: soltar una tarea en el tablero es un clic
 * fuera, y cerrarse ahí rompería justo el gesto para el que existe.
 */
export function BacklogPanel({
  abierto,
  onCerrar,
  board,
  projectId,
  tareas,
  canCreate,
  canMove,
  ...resto
}: BacklogPanelProps) {
  const [busqueda, setBusqueda] = useState('');
  const termino = busqueda.trim().toLowerCase();
  const visibles = useMemo(
    () => (termino ? tareas.filter((t) => t.title.toLowerCase().includes(termino)) : tareas),
    [tareas, termino],
  );
  const puntos = tareas.reduce((s, t) => s + (t.estimatePoints ?? 0), 0);
  const primera = useMemo(
    () => [...board.columns].sort((a, b) => a.order - b.order)[0] ?? null,
    [board.columns],
  );

  /* Una «columna» para `ColumnTasks`: el panel se pinta con las mismas piezas
     que el tablero, y así no hay un segundo diseño de tarjeta que mantener. */
  const columna: Column = useMemo(
    () => ({
      id: BACKLOG,
      name: 'Backlog',
      order: -1,
      color: 'primary',
      boardId: board.id,
      wipLimit: null,
    }),
    [board.id],
  );

  return (
    <SlideOver
      open={abierto}
      onClose={onCerrar}
      title="Backlog"
      description={
        <span className="text-text-secondary">
          {tareas.length} {tareas.length === 1 ? 'tarea' : 'tareas'}
          {puntos > 0 && ` · ${puntos} pt`}
        </span>
      }
      size="md"
      tone="dark"
      closeOnOutsideClick={false}
      ariaLabel="Backlog del tablero"
      etiquetaDeVuelta="Backlog"
    >
      {/* Cerrado, el panel sigue montado para animar la entrada, pero **sin
          contenido**: sus tarjetas estarían en la página —para un lector de
          pantalla y para cualquier búsqueda— como si estuvieran en el tablero. */}
      {abierto && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {canCreate && primera && (
            <AltaRapida
              projectId={projectId}
              boardId={board.id}
              columna={primera}
              orden={tareas.length}
            />
          )}

          {tareas.length > 6 && (
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en el backlog"
              aria-label="Buscar en el backlog"
              className="h-9 shrink-0 rounded-lg border border-border bg-transparent px-3 font-sans text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-primary"
            />
          )}

          <div
            ref={(el) => resto.registrarColumna(BACKLOG, el)}
            className="-mx-2 flex min-h-0 flex-1 flex-col"
          >
            <ColumnTasks
              {...resto}
              projectId={projectId}
              boardId={board.id}
              column={columna}
              tasks={visibles}
              canCreate={false}
              /* Buscando, el orden que se ve no es el del backlog: reordenar ahí
               colocaría la tarea en un sitio distinto del que enseña el hueco. */
              canMove={canMove && !termino}
              textoVacio={termino ? 'Nada coincide' : 'El backlog está vacío'}
            />
          </div>
        </div>
      )}
    </SlideOver>
  );
}

/**
 * Escribir en el backlog: un título y Enter, como un paso del checklist. Es un
 * formulario **de alta**, así que `action=` y que se vacíe solo al enviar es
 * justo lo que se quiere.
 */
function AltaRapida({
  projectId,
  boardId,
  columna,
  orden,
}: {
  projectId: string;
  boardId: string;
  columna: Column;
  orden: number;
}) {
  const [estado, crear, creando] = useAccion(createBacklogTaskAction, SPRINT_INITIAL_STATE);
  const campo = useRef<HTMLInputElement>(null);
  const [titulo, setTitulo] = useState('');

  useEffect(() => {
    if (!estado.done) return;
    setTitulo('');
    campo.current?.focus();
  }, [estado.done]);

  return (
    <form action={crear} className="flex shrink-0 flex-col gap-1.5">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="columnId" value={columna.id} />
      <input type="hidden" name="status" value={columna.name} />
      <input type="hidden" name="order" value={orden} />
      <div className="relative">
        <input
          ref={campo}
          name="title"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={255}
          autoComplete="off"
          placeholder="Añadir al backlog…"
          aria-label="Título de la tarea nueva en el backlog"
          className="h-11 w-full rounded-xl border border-border bg-surface pl-3.5 pr-11 font-sans text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-primary"
        />
        <button
          type="submit"
          disabled={!titulo.trim() || creando}
          aria-label="Añadir al backlog"
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          style={{ background: colors.primary }}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-7 7l7-7 7 7" />
          </svg>
        </button>
      </div>
      {estado.error && (
        <p role="alert" className="font-sans text-xs text-error">
          {estado.error}
        </p>
      )}
    </form>
  );
}
