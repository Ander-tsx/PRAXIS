import { alpha, colors } from '@praxis/commons';
import type { ReactNode } from 'react';

export interface DashboardMetricsProps {
  projects: number;
  workspaces: number;
  members: number;
}

interface MetricProps {
  value: number;
  label: string;
  hint: string;
  icon: ReactNode;
  tint: string;
}

function Metric({ value, label, hint, icon, tint }: MetricProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <span className="font-sans text-xs uppercase tracking-wider text-text-secondary">
          {label}
        </span>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: alpha(tint, 12), color: tint }}
        >
          {icon}
        </span>
      </div>

      <span className="font-display text-4xl leading-none text-text-primary">{value}</span>
      <span className="font-sans text-xs text-text-disabled">{hint}</span>
    </div>
  );
}

/** `aria-hidden` va explícito en cada `<svg>`: dentro del spread el linter de
 *  accesibilidad no lo ve y pide un `<title>` que estos iconos decorativos no
 *  necesitan — la métrica ya tiene su etiqueta de texto. */
const iconProps = {
  className: 'h-5 w-5',
  fill: 'none',
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 1.75,
} as const;

/**
 * Las tres métricas del panel.
 *
 * Salen todas de `GET /projects`: los espacios y los miembros vienen ya
 * agregados en `_count` de cada proyecto, así que sumarlos no cuesta ninguna
 * petición extra.
 */
export function DashboardMetrics({ projects, workspaces, members }: DashboardMetricsProps) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Resumen">
      <Metric
        value={projects}
        label="Proyectos"
        hint={projects === 1 ? 'Proyecto del que eres dueño' : 'Proyectos de los que eres dueño'}
        tint={colors.primary}
        icon={
          <svg {...iconProps} aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2"
            />
          </svg>
        }
      />
      <Metric
        value={workspaces}
        label="Espacios"
        hint="Espacios de trabajo dentro de tus proyectos"
        tint={colors.accent}
        icon={
          <svg {...iconProps} aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        }
      />
      <Metric
        value={members}
        label="Miembros"
        hint="Personas invitadas a tus proyectos"
        tint={colors.info}
        icon={
          <svg {...iconProps} aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        }
      />
    </section>
  );
}
