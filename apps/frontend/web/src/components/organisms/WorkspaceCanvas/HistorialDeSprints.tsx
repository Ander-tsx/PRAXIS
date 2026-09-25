'use client';

import { Dialog, type Sprint } from '@praxis/commons';
import { useState } from 'react';
import { rangoDeFechas, sprintsCerrados } from './scrum';

/**
 * Los sprints de un tablero que **ya no** trabaja por sprints (invariante 3 y
 * auditoría S8 de `docs/PLAN-SCRUM-KANBAN.md`). Apagar Scrum no borra el
 * historial, y tiene que poder leerse sin volver a encenderlo.
 */
export function HistorialDeSprints({ sprints }: { sprints: Sprint[] }) {
  const [abierto, setAbierto] = useState(false);
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
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}
