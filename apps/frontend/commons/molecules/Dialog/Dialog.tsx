'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { alpha, colors } from '../../tokens';

export interface DialogProps {
  open: boolean;
  /** Se llama con Escape, con el clic en el fondo y con el botón de cerrar. */
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Acciones del pie. Normalmente Cancelar + confirmar. */
  footer?: ReactNode;
  /** `sm` para confirmaciones, `md` por defecto, `lg` para formularios largos. */
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

/**
 * Diálogo modal sobre `<dialog>` nativo.
 *
 * Usa `showModal()` a propósito: el navegador da **atrapado de foco, cierre con
 * Escape y fondo inerte** gratis. La primera versión de esto era un `div` con
 * `role="dialog"` y el tabulador se escapaba por detrás; reimplementar las tres
 * cosas a mano es trabajo que el navegador ya hace bien.
 *
 * Sube a commons porque el área privada necesita este mismo diálogo para crear
 * proyectos, roles, espacios y para añadir miembros. Copiarlo cinco veces es
 * cómo se degradan estas cosas.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `dialog-title-${title.replace(/\s+/g, '-').toLowerCase()}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: el equivalente de teclado es Escape, que el <dialog> nativo gestiona y llega por onClose
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      /**
       * Con `showModal()` el fondo es el `::backdrop` del propio dialog, así
       * que un clic fuera de la tarjeta llega aquí con `target === dialog`.
       */
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className={[
        'm-auto w-full rounded-2xl border border-border bg-surface p-6 text-left text-text-primary',
        /* Sin barra de scroll: en un diálogo alto la barra parte el borde
           redondeado y pesa más de lo que informa. Se sigue desplazando con la
           rueda y con el teclado. */
        'scrollbar-none',
        'backdrop:bg-overlay/75 backdrop:backdrop-blur-sm',
        sizeClasses[size],
      ].join(' ')}
      style={{ boxShadow: `0 24px 64px ${alpha(colors.overlay, 70)}` }}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 id={titleId} className="font-display text-2xl text-text-primary">
            {title}
          </h3>
          {description && (
            <p className="font-sans text-sm text-text-secondary">{description}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="shrink-0 rounded-md p-1 text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {children}

      {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
    </dialog>
  );
}
