'use client';

import { toggleScrumAction } from '@/app/(privado)/projects/[id]/sprint-actions';
import { SPRINT_INITIAL_STATE } from '@/lib/projects/action-state';
import { type Board, Button, Dialog, colors, useAccion } from '@praxis/commons';
import { useEffect, useState } from 'react';

/**
 * Encender o apagar Scrum en un tablero (D1 de `docs/PLAN-SCRUM-KANBAN.md`).
 *
 * **Encender pregunta** si ya hay trabajo en las columnas. Encender no mueve
 * nada, pero lo que el equipo *ve* es su tablero en blanco de golpe y lo que
 * tenía en Doing en un backlog (auditoría S7). Así que se ofrece lo que casi
 * siempre se quiere: que lo abierto sea el primer sprint.
 *
 * **Apagar no se puede con un sprint en marcha**: lo dejaba corriendo sin que
 * nadie lo viera (S8). El servidor también lo rechaza; aquí se dice antes.
 */
export function ScrumToggle({
  projectId,
  board,
  tareasAbiertas,
  haySprintEnCurso,
}: {
  projectId: string;
  board: Board;
  tareasAbiertas: string[];
  haySprintEnCurso: boolean;
}) {
  const [estado, enviar, enviando] = useAccion(toggleScrumAction, SPRINT_INITIAL_STATE);
  const [preguntando, setPreguntando] = useState(false);
  const encendido = board.scrumEnabled;
  const bloqueado = encendido && haySprintEnCurso;

  useEffect(() => {
    if (estado.done) setPreguntando(false);
  }, [estado.done]);

  function mandar(enabled: boolean, llevarAbiertas: boolean) {
    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('boardId', board.id);
    datos.set('enabled', String(enabled));
    if (llevarAbiertas) for (const id of tareasAbiertas) datos.append('taskIds', id);
    enviar(datos);
  }

  function alternar() {
    if (!encendido && tareasAbiertas.length > 0) {
      setPreguntando(true);
      return;
    }
    mandar(!encendido, false);
  }

  const n = tareasAbiertas.length;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        role="switch"
        aria-checked={encendido}
        disabled={enviando || bloqueado}
        onClick={alternar}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left font-sans text-xs text-text-primary transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span>Trabajar por sprints (Scrum)</span>
          <span className="text-[11px] text-text-secondary">
            {bloqueado ? 'Cierra el sprint en curso para apagarlo' : 'Backlog y sprints'}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="relative h-4 w-7 shrink-0 rounded-full transition-colors"
          style={{ background: encendido ? colors.primary : colors.border }}
        >
          <span
            className="absolute top-0.5 h-3 w-3 rounded-full bg-text-primary transition-all"
            style={{ left: encendido ? '0.875rem' : '0.125rem' }}
          />
        </span>
      </button>
      {estado.error && !preguntando && (
        <p role="alert" className="px-2.5 pb-1 font-sans text-[11px] text-error">
          {estado.error}
        </p>
      )}
      <div aria-hidden="true" className="mx-2 my-1 border-t border-border" />

      <Dialog
        tone="dark"
        open={preguntando}
        onClose={() => setPreguntando(false)}
        title="Trabajar por sprints"
        size="md"
      >
        <p className="font-sans text-sm text-text-secondary">
          El tablero enseñará solo lo del sprint; lo demás esperará en el backlog. Hay {n}{' '}
          {n === 1 ? 'tarea abierta' : 'tareas abiertas'} en las columnas.
        </p>
        {estado.error && (
          <p role="alert" className="mt-3 font-sans text-xs text-error">
            {estado.error}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => mandar(true, false)} disabled={enviando}>
            Todo al backlog
          </Button>
          <Button onClick={() => mandar(true, true)} isLoading={enviando}>
            {n === 1 ? 'Llevarla al Sprint 1' : `Llevar las ${n} al Sprint 1`}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
