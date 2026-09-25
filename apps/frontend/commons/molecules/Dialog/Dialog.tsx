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
  /**
   * `sm` para confirmaciones, `md` por defecto, `lg` para formularios largos y
   * `xl` para lo que **enseña una estructura**, no un formulario.
   *
   * `xl` entró con la vista previa de la plantilla del asistente: un árbol de
   * espacios → tableros → columnas dentro de 42rem obliga a que cada nivel
   * envuelva, y un árbol cuyos nombres envuelven deja de leerse como un árbol.
   * En pantallas estrechas da igual —`max-w` no fuerza ancho— así que no hay
   * nada que compensar en móvil.
   *
   * ⚠️ **48rem y no 56rem.** El primer intento fue `max-w-4xl` y en un monitor
   * de escritorio el diálogo se comía la pantalla: el árbol cabía de sobra y el
   * espacio de más solo servía para separar el nombre de un campo de su valor.
   * Cada escalón es un paso de la escala de Tailwind, no un salto.
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * Si es true, el diálogo no ocultará el contenido que sobresalga de él (por
   * ejemplo, los menús desplegables absolutos). Si se activa, el diálogo
   * pierde la capacidad de hacer scroll interno.
   */
  overflowVisible?: boolean;
  /**
   * Paleta, igual que en `SlideOver`. `dark` es la actual de la aplicación
   * —negro casi puro, tokens redefinidos por `data-tone="dark"`— con el
   * título en sans. `default` es la azulada de antes, con Redaction: la
   * conservan los diálogos que todavía no se han pasado.
   */
  tone?: 'default' | 'dark';
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
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
  overflowVisible = false,
  tone = 'default',
}: DialogProps) {
  const dark = tone === 'dark';
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
      data-tone={dark ? 'dark' : undefined}
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
        /**
         * ⚠️ `cursor-default` no es cosmético: **el cursor se hereda**.
         *
         * `showModal()` saca el diálogo a la capa superior, pero **no lo saca
         * del DOM**: sigue siendo descendiente de donde se renderizó. El
         * diálogo de una tarea se monta dentro de su columna, que es
         * `draggable` y lleva `cursor-grab`, así que el modal entero se
         * mostraba con la mano de arrastrar — prometiendo un gesto que ahí no
         * existe.
         *
         * Se corrige aquí y no en el tablero para que valga para cualquier
         * diálogo que se monte dentro de algo arrastrable. Los botones y campos
         * de dentro declaran su propio cursor y siguen mandando sobre este.
         */
        'cursor-default',
        /* Sin barra de scroll: en un diálogo alto la barra parte el borde
           redondeado y pesa más de lo que informa. Se sigue desplazando con la
           rueda y con el teclado. */
        overflowVisible ? 'overflow-visible' : 'scrollbar-none',
        'backdrop:bg-overlay/75 backdrop:backdrop-blur-sm',
        sizeClasses[size],
      ].join(' ')}
      style={{ boxShadow: `0 24px 64px ${alpha(colors.overlay, 70)}` }}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3
            id={titleId}
            className={
              dark
                ? 'font-sans text-xl font-semibold tracking-tight text-text-primary'
                : 'font-display text-2xl text-text-primary'
            }
          >
            {title}
          </h3>
          {description && (
            <p className={`font-sans text-sm ${dark ? 'text-text-secondary' : 'text-white'}`}>
              {description}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="shrink-0 rounded-md p-1 text-white transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
