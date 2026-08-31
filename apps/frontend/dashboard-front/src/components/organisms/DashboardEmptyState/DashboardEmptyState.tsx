import { alpha, colors } from '@praxis/commons';
import type { ReactNode } from 'react';

export interface DashboardEmptyStateProps {
  /** Disparador de "crear proyecto". Slot porque es cliente y esto no. */
  action: ReactNode;
}

/**
 * Estado vacío del panel.
 *
 * Una cuenta nueva no tiene proyectos, así que **esta pantalla se ve más que
 * la llena**: es la primera impresión del producto.
 *
 * Los pasos describen lo que pasa de verdad. Antes advertían de que había que
 * crear un rol antes de poder añadir a nadie, porque un proyecto nacía sin
 * roles ni miembros; ahora el backend lo crea al vuelo y esa advertencia
 * sobraba. Si vuelve a cambiar, esto se actualiza con ello.
 */

const STEPS = [
  {
    title: 'Crea tu proyecto',
    body: 'Solo necesita un nombre. Nace contigo dentro y con un rol de administrador listo.',
    available: true,
  },
  {
    title: 'Añade a tu equipo',
    body: 'Cada persona entra con un rol, y ese rol decide lo que puede hacer.',
    available: false,
  },
  {
    title: 'Abre espacios y tableros',
    body: 'Los espacios agrupan tableros, y los tableros ordenan el trabajo en columnas.',
    available: false,
  },
];

export function DashboardEmptyState({ action }: DashboardEmptyStateProps) {
  return (
    <section
      className="flex flex-col items-center gap-8 rounded-sm border border-border bg-surface px-6 py-12 text-center"
      aria-label="Primeros pasos"
    >
      <div className="flex flex-col items-center gap-3">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-sm"
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

        <h3 className="font-display text-3xl text-text-primary">Todavía no tienes proyectos</h3>
        <p className="max-w-md font-serif text-lg italic text-white">
          Un proyecto es el contenedor de todo lo demás: espacios, tableros y tareas.
        </p>
      </div>

      <ol className="grid w-full max-w-3xl grid-cols-1 gap-4 text-left sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col gap-2 rounded-sm border p-4"
            style={{
              borderColor: step.available ? colors.border : alpha(colors.border, 60),
              background: step.available ? alpha(colors.primary, 5) : 'transparent',
            }}
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full font-sans text-xs font-bold"
              style={
                step.available
                  ? { background: colors.primary, color: colors.primaryForeground }
                  : {
                      background: alpha(colors.border, 60),
                      color: colors.textDisabled,
                    }
              }
            >
              {index + 1}
            </span>

            <h4
              className="font-sans text-sm font-semibold"
              style={{ color: step.available ? colors.textPrimary : colors.textSecondary }}
            >
              {step.title}
            </h4>
            <p className="font-sans text-xs leading-relaxed text-white">{step.body}</p>

            {!step.available && (
              <span className="mt-auto font-sans text-[10px] uppercase tracking-wider text-white">
                Al crear el proyecto
              </span>
            )}
          </li>
        ))}
      </ol>

      {action}
    </section>
  );
}
