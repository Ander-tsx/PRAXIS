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
}

const sizeClasses = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
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
 * ajuste de forma fluida.
 */
export function SlideOver({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: SlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.paddingRight = paddingSizes[size];
      document.body.style.transition = 'padding-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

      const handleGlobalClick = (event: MouseEvent) => {
        // Ignorar clicks dentro del panel
        if (panelRef.current && panelRef.current.contains(event.target as Node)) {
          return;
        }

        // Ignorar clicks en elementos que lo abrieron (como botones con data-state="open")
        // No tenemos una forma perfecta de saber si el click fue en el trigger,
        // pero podemos asumir que si se hizo click fuera y está abierto, queremos cerrarlo.
        // Un pequeño retraso para no cerrarlo inmediatamente al abrir.
        onClose();
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onClose();
        }
      };

      // Usar timeout para evitar capturar el click que abrió el panel
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleGlobalClick);
        document.addEventListener('keydown', handleKeyDown);
      }, 0);

      return () => {
        document.body.style.paddingRight = '0px';
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleGlobalClick);
        document.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.paddingRight = '0px';
    }
  }, [open, size, onClose]);

  // Si no está abierto, podríamos no renderizarlo, pero mantenerlo renderizado
  // permite la animación de salida si se usa con framer-motion o puramente CSS.
  // Como usamos CSS transitions para el transform, lo dejamos en el DOM pero desplazado.
  // Además, si está cerrado ocultamos el overflow para que no estorbe (o le ponemos pointer-events-none).

  return (
    <>
      <div
        ref={panelRef}
        className={[
          'fixed inset-y-0 right-0 z-40 m-0 h-full w-full max-h-screen overflow-y-auto bg-surface p-6 text-left text-text-primary shadow-2xl transition-transform duration-300 sm:left-auto sm:border-l sm:border-border cursor-default',
          sizeClasses[size],
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-full flex-col">
          <header className="mb-6 flex shrink-0 items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              {title && <h2 className="font-sans text-xl font-bold tracking-tight">{title}</h2>}
              {description && (
                <p className="font-sans text-sm text-text-secondary">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar panel"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-hover hover:text-text-primary"
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
