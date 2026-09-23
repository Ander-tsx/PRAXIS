'use client';

import { type Sprint, colors } from '@praxis/commons';
import { diasRestantes, rangoDeFechas, textoDiasRestantes } from './scrum';

/**
 * La franja del sprint en curso, encima del tablero.
 *
 * Es la respuesta a «¿cómo sé dónde acaba un sprint y empieza otro?»: el
 * tablero de un tablero Scrum **es** el sprint en curso, y esta franja dice
 * cuál, hasta cuándo y cuánto va hecho. Al cerrarlo desaparece, y la del
 * siguiente dice su nombre y sus fechas (D15 de `docs/PLAN-SCRUM-KANBAN.md`).
 */
export function SprintBanner({
  activo,
  hechas,
  total,
  enBacklog,
  backlogAbierto,
  onBacklog,
  onVerSprint,
}: {
  activo: Sprint;
  hechas: number;
  total: number;
  enBacklog: number;
  backlogAbierto: boolean;
  onBacklog: () => void;
  onVerSprint: () => void;
}) {
  const dias = diasRestantes(activo);
  const vencido = dias !== null && dias < 1;
  const porcentaje = total === 0 ? 0 : Math.round((hechas / total) * 100);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3">
      <button
        type="button"
        onClick={onVerSprint}
        title="Ver el sprint"
        className="flex min-w-0 cursor-pointer items-baseline gap-2 text-left"
      >
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 self-center rounded-full"
          style={{ background: vencido ? colors.warning : colors.primary }}
        />
        <span className="truncate font-sans text-sm font-semibold text-text-primary">
          {activo.name}
        </span>
        <span className="hidden font-sans text-xs text-text-secondary sm:inline">
          {rangoDeFechas(activo)}
        </span>
        <span className={`font-sans text-xs ${vencido ? 'text-warning' : 'text-text-secondary'}`}>
          {textoDiasRestantes(dias)}
        </span>
      </button>

      <span className="flex items-center gap-2 font-sans text-xs text-text-secondary">
        <span className="h-1 w-16 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <span
            className="block h-full rounded-full bg-primary"
            style={{ width: `${porcentaje}%` }}
          />
        </span>
        <span className="tabular-nums">
          {hechas}/{total} hechas
        </span>
      </span>

      <button
        type="button"
        onClick={onBacklog}
        aria-pressed={backlogAbierto}
        className={`ml-auto cursor-pointer rounded-lg px-2.5 py-1 font-sans text-xs font-medium transition-colors ${
          backlogAbierto
            ? 'bg-primary/15 text-primary'
            : 'border border-border text-text-primary hover:border-border-strong'
        }`}
      >
        Backlog{enBacklog > 0 && ` · ${enBacklog}`}
      </button>
    </div>
  );
}
