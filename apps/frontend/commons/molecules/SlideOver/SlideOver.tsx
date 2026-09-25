'use client';

import { type ReactNode, useEffect, useRef, useSyncExternalStore } from 'react';
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
  /**
   * `false` para un panel **de trabajo** que convive con la página: el del
   * backlog se queda abierto mientras arrastras tareas al tablero, y un clic
   * fuera —el que genera soltar la tarea— no puede cerrarlo. Se cierra con su
   * botón o con Escape.
   */
  closeOnOutsideClick?: boolean;
  /** Nombre accesible del panel, para lectores de pantalla y pruebas. */
  ariaLabel?: string;
  /**
   * Cómo se llama este panel en el «← Volver a …» del que se abra encima. Sin
   * él, el de encima no ofrece volver.
   */
  etiquetaDeVuelta?: string;
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
 * Paneles abiertos y el hueco que pide cada uno.
 *
 * ⚠️ **Puede haber dos a la vez** —el backlog y, encima, el panel de una de
 * sus tareas—. Cada uno ponía `padding-right` al abrir y lo dejaba a 0 al
 * cerrar, así que cerrar el de encima hacía que el tablero se metiera por
 * debajo del que seguía abierto. El `body` lleva el mayor de los que haya.
 */
const huecos = new Map<symbol, string>();

/**
 * Los paneles abiertos, en el orden en que se abrieron. **Solo se ve el de
 * encima** (D21 de `docs/PLAN-SCRUM-KANBAN.md`): abrir una tarea desde el
 * backlog apilaba los dos paneles a la derecha, uno asomando por debajo del
 * otro. Ahora el de debajo se esconde —sin desmontarse, así que conserva lo
 * que tenía— y el de encima ofrece volver a él. Escape y el clic fuera
 * también son solo del de encima, y de ninguno si hay un `<dialog>` modal.
 */
const pila: { id: symbol; etiqueta?: string }[] = [];
const oyentes = new Set<() => void>();
let version = 0;

function avisarPila() {
  version += 1;
  for (const oyente of oyentes) oyente();
}

function suscribirPila(oyente: () => void) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

function aplicarHueco() {
  const valores = [...huecos.values()];
  const mayor = valores.sort((a, b) => Number.parseFloat(b) - Number.parseFloat(a))[0];
  document.body.style.paddingRight = mayor ?? '0px';
}

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
  closeOnOutsideClick = true,
  ariaLabel,
  etiquetaDeVuelta,
}: SlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const idDelHueco = useRef(Symbol('slide-over'));
  const dark = tone === 'dark';

  /* Se lee la pila en cada cambio: si otro panel se abre encima, este se esconde. */
  useSyncExternalStore(
    suscribirPila,
    () => version,
    () => 0,
  );
  const posicion = pila.findIndex((p) => p.id === idDelHueco.current);
  const esCima = posicion !== -1 && posicion === pila.length - 1;
  const visible = open && (posicion === -1 || esCima);
  const debajo = esCima && posicion > 0 ? pila[posicion - 1] : null;

  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 640px)').matches;
    const id = idDelHueco.current;
    if (open && isDesktop) {
      huecos.set(id, paddingSizes[size]);
      document.body.style.transition = 'padding-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    } else {
      huecos.delete(id);
    }
    aplicarHueco();

    return () => {
      huecos.delete(id);
      aplicarHueco();
    };
  }, [open, size]);

  useEffect(() => {
    if (!open) return;

    const id = idDelHueco.current;
    const esLaDeEncima = () => pila[pila.length - 1]?.id === id;

    const handleGlobalClick = (event: MouseEvent) => {
      if (!closeOnOutsideClick || !esLaDeEncima()) return;
      const target = event.target as Node;
      if (!document.contains(target)) return;
      if (panelRef.current && panelRef.current.contains(target)) return;
      onClose();
    };

    pila.push({ id, etiqueta: etiquetaDeVuelta });
    avisarPila();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!esLaDeEncima()) return;
      if (document.querySelector('dialog[open]')) return;
      onClose();
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleGlobalClick);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener('keydown', handleKeyDown);
      const indice = pila.findIndex((p) => p.id === id);
      if (indice !== -1) pila.splice(indice, 1);
      avisarPila();
    };
  }, [open, onClose, closeOnOutsideClick, etiquetaDeVuelta]);

  return (
    <>
      <div
        ref={panelRef}
        role={ariaLabel ? 'complementary' : undefined}
        aria-label={ariaLabel}
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
          visible ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-full flex-col">
          {debajo?.etiqueta && (
            <button
              type="button"
              onClick={onClose}
              className="-mt-2 mb-3 flex w-fit cursor-pointer items-center gap-1.5 rounded-md py-1 pr-2 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              {debajo.etiqueta}
            </button>
          )}
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
