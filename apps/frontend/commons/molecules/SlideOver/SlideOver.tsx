'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { alpha, colors } from '../../tokens';

export interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  /**
   * Determina la anchura del SlideOver en escritorio.
   * `md` = max-w-md, `lg` = max-w-lg, `xl` = max-w-xl
   */
  size?: 'md' | 'lg' | 'xl';
  /**
   * Paleta del panel.
   *
   * `default` es la de siempre —`surface` azulado, `text-primary`—. `dark` es la
   * del refrandeo: negro casi puro (`#0c0c0b`), bordes y textos en blanco
   * translúcido. Se añadió para el diálogo de tarea, que abre sobre el tablero
   * ya refrandeado y desentonaba en azul. Los demás consumidores no pasan `tone`
   * y siguen exactamente igual.
   */
  tone?: 'default' | 'dark';
}

const sizeClasses = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
} as const;

const paddingSizes = {
  md: '28rem',
  lg: '32rem',
  xl: '36rem',
} as const;

/**
 * SlideOver panel.
 *
 * En lugar de flotar sobre la página como un `<dialog>`, empuja el contenido
 * añadiendo padding al `body`. Esto permite que la rejilla de proyectos se
 * ajuste de forma fluida. En móviles abarca el 100% de la pantalla sin animar.
 */
export function SlideOver({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  tone = 'default',
}: SlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dark = tone === 'dark';

  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 640px)').matches;
    if (open && isDesktop) {
      document.body.style.paddingRight = paddingSizes[size];
      document.body.style.transition = 'padding-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    } else {
      document.body.style.paddingRight = '0px';
    }

    return () => {
      document.body.style.paddingRight = '0px';
    };
  }, [open, size]);

  useEffect(() => {
    if (!open) return;

    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!document.contains(target)) return;
      if (panelRef.current && panelRef.current.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleGlobalClick);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <>
      <div
        ref={panelRef}
        /* `data-tone="dark"` redefine los tokens de color para todo el subárbol
           (ver `theme.css`): los átomos de dentro —Select, SelectorDeFecha,
           Input…— salen en la paleta near-black sin tocarlos uno a uno. El
           panel además fija su propio fondo/borde a pelo porque quiere el
           `#0c0c0b` del rebrand, un peldaño por debajo del `surface` de dentro. */
        data-tone={dark ? 'dark' : undefined}
        className={[
          'fixed inset-y-0 right-0 z-40 m-0 h-full w-full max-h-screen overflow-y-auto p-6 text-left transition-none sm:transition-transform sm:duration-300 sm:left-auto sm:border-l cursor-default',
          dark
            ? 'bg-[#202020] text-white sm:border-white/[0.08]'
            : 'bg-surface text-text-primary sm:border-border',
          sizeClasses[size],
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-full flex-col">
          <header className="mb-6 flex shrink-0 items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              {title && <h2 className="font-sans text-xl font-bold tracking-tight">{title}</h2>}
              {description && <p className="font-sans text-sm text-white">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar panel"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white transition-colors hover:bg-hover hover:text-text-primary"
            >
              <svg
                className="h-5 w-5"
                aria-hidden="true"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div className="flex-1 min-h-0 flex flex-col pr-1 -mr-1">{children}</div>
        </div>
      </div>
    </>
  );
}
