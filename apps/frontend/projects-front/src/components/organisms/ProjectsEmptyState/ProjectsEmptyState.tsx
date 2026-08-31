import { alpha, colors } from '@praxis/commons';
import type { ReactNode } from 'react';

export interface ProjectsEmptyStateProps {
  action: ReactNode;
}

/**
 * Estado vacío de la lista.
 *
 * Un proyecto nuevo nace con su rol de administrador y contigo dentro, así que
 * no hay que advertir de ningún orden obligatorio: se crea y ya se puede
 * repartir trabajo.
 */
export function ProjectsEmptyState({ action }: ProjectsEmptyStateProps) {
  return (
    <section className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-surface px-6 py-14 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: alpha(colors.primary, 12), color: colors.primary }}
      >
        <svg
          className="h-7 w-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </span>

      <div className="flex flex-col gap-2">
        <h3 className="font-display text-3xl text-text-primary">Todavía no tienes proyectos</h3>
        <p className="max-w-md font-serif text-lg italic text-white">
          Aquí verás los que creas y aquellos donde te añada tu equipo.
        </p>
      </div>

      {action}
    </section>
  );
}
