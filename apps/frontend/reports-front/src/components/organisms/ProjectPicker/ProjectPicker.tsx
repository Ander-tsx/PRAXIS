'use client';

import { type Project, alpha, colors, reportPath } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export interface ProjectPickerProps {
  projects: Project[];
  activeId: string;
}

/**
 * Selector del proyecto del que se ven los reportes.
 *
 * Mismo gesto que el selector de espacios del tablero, y a propósito: cambiar de
 * proyecto aquí es la misma clase de acción que cambiar de espacio allí, y dos
 * formas distintas de hacer lo mismo se aprenden dos veces.
 *
 * Antes esto era una rejilla de tarjetas en una pantalla aparte, y obligaba a un
 * viaje de ida y vuelta cada vez que se quería comparar dos proyectos. Como
 * desplegable, cambiar de proyecto no cambia de pantalla.
 *
 * El proyecto activo vive en la URL, así que un reporte se puede enlazar y el
 * botón atrás funciona.
 */
export function ProjectPicker({ projects, activeId }: ProjectPickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const active = projects.find((project) => project.id === activeId);

  /** Cerrar al pulsar fuera o con Escape, como cualquier desplegable. */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function select(slug: string) {
    setOpen(false);
    /* Sin el basePath: Next añade `/reports`. `push` y no `replace` para que el
       botón atrás devuelva al proyecto anterior, que es lo que se espera al
       estar comparando. */
    router.push(reportPath({ slug }));
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong"
      >
        <span className="flex min-w-0 flex-col">
          <span className="font-sans text-[11px] uppercase tracking-wider text-text-disabled">
            Proyecto
          </span>
          <span className="truncate font-sans text-base font-semibold text-text-primary">
            {active?.name ?? 'Elige un proyecto'}
          </span>
        </span>

        <svg
          className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-border bg-surface"
          style={{ boxShadow: `0 16px 40px ${alpha(colors.overlay, 60)}` }}
        >
          {/* Botones y no un `listbox`: uno de verdad exige navegación con
              flechas y foco gestionado, y anunciarlo sin implementarlo engaña
              al lector de pantalla. `aria-current` marca el activo. */}
          <ul className="max-h-72 overflow-y-auto py-1">
            {projects.map((project) => {
              const isActive = project.id === activeId;
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => select(project.slug)}
                    className={[
                      'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors',
                      isActive
                        ? 'text-text-primary'
                        : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
                    ].join(' ')}
                    style={isActive ? { background: alpha(colors.primary, 10) } : undefined}
                  >
                    <span className="truncate font-sans text-sm">{project.name}</span>
                    <span className="shrink-0 font-sans text-xs text-text-disabled">
                      {project._count.members}{' '}
                      {project._count.members === 1 ? 'persona' : 'personas'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {projects.length === 0 && (
            <p className="px-4 py-3 font-sans text-sm text-text-disabled">
              Todavía no estás en ningún proyecto.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
