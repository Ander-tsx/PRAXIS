'use client';

import { type ReactNode, useId, useState } from 'react';

/**
 * Una integración del catálogo: una fila con su nombre, qué hace y en qué
 * estado está, que se despliega para configurarla.
 *
 * Fila con raya fina y no tarjeta (kyloo-design §4 y §13). El despliegue usa
 * el truco de rejilla `0fr ↔ 1fr` con transición, igual que los grupos de la
 * barra lateral: anima en las dos direcciones.
 */
export function IntegrationRow({
  title,
  description,
  status,
  children,
  defaultOpen = false,
  disabled = false,
}: {
  title: string;
  description: string;
  /** Una palabra o dos: «Activo», «Disponible en Pro», «Pronto». */
  status: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  /** Sin contenido que desplegar (p. ej. «Pronto»). */
  disabled?: boolean;
}) {
  const [abierta, setAbierta] = useState(defaultOpen);
  const panelId = useId();
  const desplegable = !disabled && Boolean(children);

  return (
    <section className="border-t border-border">
      <button
        type="button"
        onClick={() => desplegable && setAbierta((v) => !v)}
        aria-expanded={desplegable ? abierta : undefined}
        aria-controls={desplegable ? panelId : undefined}
        disabled={!desplegable}
        className="flex w-full items-start justify-between gap-6 py-6 text-left disabled:cursor-default"
      >
        <span className="flex flex-col gap-1">
          <span className="font-sans text-lg font-semibold tracking-tight text-text-primary">
            {title}
          </span>
          <span className="max-w-2xl font-sans text-sm text-text-secondary">{description}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3 pt-0.5">
          <span className="font-sans text-xs text-text-secondary">{status}</span>
          {desplegable && (
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className={`h-4 w-4 text-text-secondary transition-transform ${abierta ? 'rotate-180' : ''}`}
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </span>
      </button>

      {desplegable && (
        <div
          id={panelId}
          className={`grid transition-[grid-template-rows] duration-200 ${abierta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            {/* Sangrado bajo una raya: todo lo de dentro es de ESTA integración y
                no de la siguiente (lo pidió el dueño: la jerarquía no se leía). */}
            <div className="mb-8 ml-1 flex flex-col gap-8 border-l border-border pl-6">
              {children}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
