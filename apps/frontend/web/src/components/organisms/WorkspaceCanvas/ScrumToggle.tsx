'use client';

import { toggleScrumAction } from '@/app/(privado)/projects/[id]/sprint-actions';
import { SPRINT_INITIAL_STATE } from '@/lib/projects/action-state';
import { type Board, colors, useAccion } from '@praxis/commons';

/**
 * Encender o apagar Scrum en un tablero (D1 de `docs/PLAN-SCRUM-KANBAN.md`).
 *
 * No pide confirmación en ningún sentido, y es a propósito: apagarlo no cierra
 * ningún sprint ni mueve ninguna tarea (invariante 3) — solo esconde Backlog y
 * Sprint hasta que se vuelva a encender. Un «¿seguro?» delante de algo que se
 * deshace con el mismo clic es fricción sin protección.
 */
export function ScrumToggle({ projectId, board }: { projectId: string; board: Board }) {
  const [estado, enviar, enviando] = useAccion(toggleScrumAction, SPRINT_INITIAL_STATE);
  const encendido = board.scrumEnabled;

  function alternar() {
    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('boardId', board.id);
    datos.set('enabled', String(!encendido));
    enviar(datos);
  }

  return (
    <div className="flex flex-col">
      <button
        type="button"
        role="switch"
        aria-checked={encendido}
        disabled={enviando}
        onClick={alternar}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left font-sans text-xs text-text-primary transition-colors hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span>Trabajar por sprints (Scrum)</span>
          <span className="text-[11px] text-text-secondary">
            {encendido ? 'Backlog y Sprint activos' : 'Añade Backlog y Sprint al tablero'}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="relative h-4 w-7 shrink-0 rounded-full transition-colors"
          style={{ background: encendido ? colors.primary : 'rgba(255,255,255,0.15)' }}
        >
          <span
            className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all"
            style={{ left: encendido ? '0.875rem' : '0.125rem' }}
          />
        </span>
      </button>
      {estado.error && (
        <p role="alert" className="px-2.5 pb-1 font-sans text-[11px] text-error">
          {estado.error}
        </p>
      )}
      <div aria-hidden="true" className="mx-2 my-1 border-t border-white/10" />
    </div>
  );
}
