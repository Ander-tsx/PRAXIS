'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../api/domain';
import { alpha, colors } from '../../tokens';

export interface ProjectPickerProps {
  projects: Project[];
  /** El proyecto abierto. **El UUID resuelto, no el parámetro de la ruta.** */
  activeId: string;
  /**
   * `project.id` → la ruta a la que lleva elegirlo, **relativa a la zona**.
   *
   * ⚠️ **Es un diccionario y no una función `(project) => string`, y la
   * diferencia no es de estilo.** Esto es un componente de cliente, y quien lo
   * monta en Análisis es un Server Component: pasarle una función revienta con
   * *«Functions cannot be passed directly to Client Components»*, porque no hay
   * forma de serializar una función en la frontera servidor→cliente. Un objeto
   * de cadenas sí viaja.
   *
   * Costó encontrarlo porque **el HTML se sirve igual**: el 200 llega, la página
   * se pinta, y el fallo salta después al hidratar — o sea que la pantalla
   * aparece un instante y la sustituye el `error.tsx` con «no pudimos cargar
   * esta página», que no dice nada de funciones ni de fronteras.
   *
   * ⚠️ Y las rutas van **sin el basePath**: Next lo añade solo al navegar con
   * `router.push`, y escribirlo aquí daría `/reports/reports/…`. Las construye
   * quien usa el selector porque cada zona tiene la suya —una ruta en Análisis,
   * una query en la del asistente— y ninguna vale en la otra. Ver §16.
   */
  paths: Record<string, string>;
  /** El rótulo de encima del nombre. Por defecto, «Proyecto». */
  label?: string;
  /** Qué se dice cuando no hay ninguno elegido. */
  placeholder?: string;
  /** Qué se dice cuando la lista está vacía. */
  vacio?: string;
}

/**
 * Selector del proyecto sobre el que se está trabajando.
 *
 * Mismo gesto que el selector de espacios del tablero, y a propósito: cambiar de
 * proyecto aquí es la misma clase de acción que cambiar de espacio allí, y dos
 * formas distintas de hacer lo mismo se aprenden dos veces.
 *
 * En Análisis esto era antes una rejilla de tarjetas en una pantalla aparte, y
 * obligaba a un viaje de ida y vuelta cada vez que se quería comparar dos
 * proyectos. Como desplegable, cambiar de proyecto no cambia de pantalla.
 *
 * El proyecto activo vive en la URL, así que la vista se puede enlazar y el botón
 * atrás funciona.
 *
 * ## Por qué vive en `commons`
 *
 * Porque desde que PRAX tiene pantalla propia hacen falta dos: uno elige de qué
 * proyecto son los gráficos y el otro de qué proyecto se habla. Lo único que
 * cambia entre ellos es a dónde lleva elegir, y eso entra por `pathDe`.
 */
export function ProjectPicker({
  projects,
  activeId,
  paths,
  label = 'Proyecto',
  placeholder = 'Elige un proyecto',
  vacio = 'Todavía no estás en ningún proyecto.',
}: ProjectPickerProps) {
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

  function select(project: Project) {
    const destino = paths[project.id];
    /* Un proyecto sin ruta no debería estar en la lista, pero si pasa es mejor
       no hacer nada que navegar a `undefined`. */
    if (!destino) return;

    setOpen(false);
    /* `push` y no `replace` para que el botón atrás devuelva al proyecto
       anterior, que es lo que se espera al estar comparando dos. */
    router.push(destino);
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
            {label}
          </span>
          <span className="truncate font-sans text-base font-semibold text-text-primary">
            {active?.name ?? placeholder}
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
                    onClick={() => select(project)}
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
            <p className="px-4 py-3 font-sans text-sm text-text-disabled">{vacio}</p>
          )}
        </div>
      )}
    </div>
  );
}
