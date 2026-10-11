'use client';

import { type Board, Dialog, type Sprint } from '@praxis/commons';
import { useState } from 'react';
import { TareasDeSprint } from './TareasDeSprint';
import { rangoDeFechas, sprintsCerrados } from './scrum';

/**
 * Los sprints de un tablero que **ya no** trabaja por sprints (invariante 3 y
 * auditoría S8 de `docs/PLAN-SCRUM-KANBAN.md`). Apagar Scrum no borra el
 * historial, y tiene que poder leerse sin volver a encenderlo.
 */
export function HistorialDeSprints({ sprints, board }: { sprints: Sprint[]; board: Board }) {
  const [abierto, setAbierto] = useState(false);
  const [verTareas, setVerTareas] = useState<Sprint | null>(null);
  const cerrados = sprintsCerrados(sprints);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left font-sans text-xs text-text-primary transition-colors hover:bg-white/5"
      >
        Sprints anteriores
        <span className="tabular-nums text-text-secondary">{cerrados.length}</span>
      </button>
      <Dialog
        tone="dark"
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Sprints anteriores"
        size="md"
      >
        <ul className="flex flex-col">
          {cerrados.map((s) => {
            const r = s.closeSummary;
            return (
              <li
                key={s.id}
                className="flex flex-col gap-0.5 border-b border-border py-3 last:border-b-0"
              >
                <span className="font-sans text-sm text-text-primary">{s.name}</span>
                <span className="font-sans text-xs text-text-secondary">
                  {[
                    rangoDeFechas(s),
                    r && `${r.hechas} ${r.hechas === 1 ? 'terminada' : 'terminadas'}`,
                    r && r.puntosHechos > 0 && `${r.puntosHechos} pt`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <button
                  type="button"
                  onClick={() => setVerTareas(s)}
                  className="w-fit cursor-pointer font-sans text-xs text-text-primary underline underline-offset-2 transition-colors hover:text-text-secondary"
                >
                  Ver tareas
                </button>
              </li>
            );
          })}
        </ul>
      </Dialog>
      <TareasDeSprint sprint={verTareas} board={board} onCerrar={() => setVerTareas(null)} />
    </>
  );
}
