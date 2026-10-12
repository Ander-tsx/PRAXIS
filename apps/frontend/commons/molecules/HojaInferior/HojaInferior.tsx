'use client';

import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

/** Lo que tarda en entrar o salir. Espejo de `duration-[260ms]` del panel. */
const DURACION_MS = 260;
/** Arrastrar más que esto hacia abajo, o soltar con prisa, cierra la hoja. */
const UMBRAL_DE_CIERRE_PX = 110;
const VELOCIDAD_DE_CIERRE = 0.6; // px/ms

const SELECTOR_ENFOCABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export interface HojaInferiorProps {
  abierta: boolean;
  onCerrar: () => void;
  /** El nombre de la hoja: título visible y nombre accesible del diálogo. */
  titulo: string;
  /** Esconde el título visible (sigue siendo el nombre accesible). */
  sinTitulo?: boolean;
  /**
   * `auto` mide lo que su contenido, hasta el 92 % de la pantalla.
   * `completa` ocupa la pantalla menos la franja de estado: para lo que se
   * edita (una tarea), que en una hoja a medias no cabe.
   */
  altura?: 'auto' | 'completa';
  /** Botones a la derecha del título. */
  acciones?: ReactNode;
  /**
   * También desde `md`. Por defecto la hoja es solo de móvil; la abre en una
   * tableta lo que llega por un gesto táctil (la pulsación larga del Kanban),
   * y ahí tiene que verse.
   */
  tambienEnTableta?: boolean;
  children: ReactNode;
}

/**
 * La hoja que sube desde abajo: el contenedor de casi todo lo que en móvil
 * flota (D10 de `docs/PLAN-MOVIL.md`). En escritorio no se usa.
 *
 * Lo que una hoja de app tiene que hacer y una `<div>` fija no hace sola:
 *
 * - **Arrastrar para cerrar** desde el asa o la cabecera, siguiendo el dedo;
 *   cierra si se arrastra lo bastante o se suelta con prisa, y si no, vuelve.
 * - **Lo de detrás no existe** mientras está abierta: `inert` en el resto del
 *   `<body>`, así que ni el lector de pantalla ni el tabulador se escapan, y el
 *   desplazamiento de la página se bloquea.
 * - **El foco entra y vuelve:** al abrir va al primer control (o al panel), y
 *   al cerrar vuelve a lo que la abrió.
 * - **Escape** cierra (teclado externo en tableta).
 *
 * Se monta en un portal y solo mientras hace falta —desde que se abre hasta que
 * termina de salir—, para poder animar la salida sin dejar nada montado.
 */
export function HojaInferior({
  abierta,
  onCerrar,
  titulo,
  sinTitulo = false,
  altura = 'auto',
  acciones,
  tambienEnTableta = false,
  children,
}: HojaInferiorProps) {
  const [montada, setMontada] = useState(abierta);
  const [dentro, setDentro] = useState(false);
  const [arrastre, setArrastre] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const portal = useRef<HTMLDivElement | null>(null);
  const tituloId = useId();
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;

  /* Montar → entrar; cerrar → salir y desmontar al terminar. */
  useEffect(() => {
    if (abierta) {
      setMontada(true);
      const t = window.setTimeout(() => setDentro(true), 16);
      return () => window.clearTimeout(t);
    }
    setDentro(false);
    setArrastre(0);
    const t = window.setTimeout(() => setMontada(false), DURACION_MS);
    return () => window.clearTimeout(t);
  }, [abierta]);

  /* Fondo inerte, página quieta, foco dentro y de vuelta. */
  useEffect(() => {
    if (!montada || !abierta) return;
    const anterior = document.activeElement as HTMLElement | null;
    const hermanos = [...document.body.children].filter(
      (el) => el !== portal.current && !el.hasAttribute('inert'),
    );
    for (const el of hermanos) el.setAttribute('inert', '');
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    const t = window.setTimeout(() => {
      const primero = panel.current?.querySelector<HTMLElement>(SELECTOR_ENFOCABLE);
      (primero ?? panel.current)?.focus({ preventScroll: true });
    }, 30);

    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrarRef.current();
    };
    document.addEventListener('keydown', tecla);

    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', tecla);
      for (const el of hermanos) el.removeAttribute('inert');
      document.documentElement.style.overflow = overflow;
      anterior?.focus?.({ preventScroll: true });
    };
  }, [montada, abierta]);

  const empezarArrastre = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    /* Solo el gesto sobre el fondo del asa o la cabecera, no sobre un botón. */
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    const origen = e.clientY;
    const inicio = performance.now();
    const asa = e.currentTarget;
    asa.setPointerCapture(e.pointerId);
    let dy = 0;
    const mover = (ev: PointerEvent) => {
      dy = Math.max(0, ev.clientY - origen);
      setArrastre(dy);
    };
    const soltar = () => {
      asa.removeEventListener('pointermove', mover);
      asa.removeEventListener('pointerup', soltar);
      asa.removeEventListener('pointercancel', soltar);
      const velocidad = dy / Math.max(1, performance.now() - inicio);
      if (dy > UMBRAL_DE_CIERRE_PX || velocidad > VELOCIDAD_DE_CIERRE) cerrarRef.current();
      else setArrastre(0);
    };
    asa.addEventListener('pointermove', mover);
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
  }, []);

  if (!montada || typeof document === 'undefined') return null;

  const arrastrando = arrastre > 0;

  return createPortal(
    <div
      ref={(el) => {
        portal.current = el;
      }}
      className={`fixed inset-0 z-[400] ${tambienEnTableta ? '' : 'md:hidden'}`}
    >
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onCerrar}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-[260ms] motion-reduce:transition-none ${
          dentro ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {/* Un `<div>` con `role="dialog"` y no un `<dialog>`: el elemento trae su
          propia capa superior y su gestión del foco, que pelean con la
          animación y el arrastre. Foco, Escape y fondo inerte van a mano. */}
      <div
        ref={panel}
        // biome-ignore lint/a11y/useSemanticElements: ver el comentario de encima
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className={`absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[1.25rem] border-t border-white/10 bg-surface-2 shadow-2xl outline-none ${
          arrastrando
            ? ''
            : 'transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]'
        } motion-reduce:transition-none ${
          altura === 'completa'
            ? 'h-[calc(100dvh-env(safe-area-inset-top,0px)-0.75rem)]'
            : 'max-h-[92dvh]'
        }`}
        style={{
          transform: dentro ? `translateY(${arrastre}px)` : 'translateY(100%)',
        }}
      >
        {/* El asa y la cabecera: de aquí se arrastra para cerrar. */}
        <div onPointerDown={empezarArrastre} className="shrink-0 touch-none select-none">
          <div className="flex justify-center pb-1 pt-2.5">
            <span aria-hidden="true" className="h-1 w-9 rounded-full bg-white/20" />
          </div>
          <div
            className={`flex min-h-11 items-center gap-2 px-4 ${sinTitulo ? 'sr-only' : 'pb-2'}`}
          >
            <h2
              id={tituloId}
              className="min-w-0 flex-1 truncate font-sans text-[17px] font-semibold text-text-primary"
            >
              {titulo}
            </h2>
            {acciones}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export interface AccionDeHoja {
  clave: string;
  etiqueta: string;
  icono?: ReactNode;
  onElegir: () => void;
  /** En rojo: borra o no se deshace. */
  peligro?: boolean;
  deshabilitada?: boolean;
}

/**
 * La lista de acciones de un menú ⋯, en móvil (D10). Cada fila mide 52 px —por
 * encima de los 44 de I5— y elegir una cierra la hoja antes de actuar.
 */
export function HojaDeAcciones({
  abierta,
  onCerrar,
  titulo,
  acciones,
  tambienEnTableta = false,
}: {
  abierta: boolean;
  onCerrar: () => void;
  titulo: string;
  acciones: AccionDeHoja[];
  tambienEnTableta?: boolean;
}) {
  return (
    <HojaInferior
      abierta={abierta}
      onCerrar={onCerrar}
      titulo={titulo}
      tambienEnTableta={tambienEnTableta}
    >
      <ul className="flex flex-col px-2 pb-3">
        {acciones.map((a) => (
          <li key={a.clave}>
            <button
              type="button"
              disabled={a.deshabilitada}
              onClick={() => {
                onCerrar();
                a.onElegir();
              }}
              className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left font-sans text-[15px] transition-colors active:bg-white/10 disabled:opacity-40 ${
                a.peligro ? 'text-error' : 'text-text-primary'
              }`}
            >
              {a.icono && (
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 shrink-0 items-center justify-center [&_svg]:h-5 [&_svg]:w-5"
                >
                  {a.icono}
                </span>
              )}
              {a.etiqueta}
            </button>
          </li>
        ))}
      </ul>
    </HojaInferior>
  );
}
