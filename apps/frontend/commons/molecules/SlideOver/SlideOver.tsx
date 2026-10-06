'use client';

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
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
 *
 * Con todos los paneles a la misma anchura (`lg`, D-todos-igual) este máximo
 * es siempre el mismo número, pero se deja el cálculo: es gratis y cubre el
 * día que alguien registre un tamaño distinto.
 */
const huecos = new Map<symbol, string>();

/**
 * Los paneles abiertos, en el orden en que se abrieron.
 *
 * **Solo el de encima recibe Escape y el clic fuera.** Cuando uno se abre
 * sobre otro (una tarea desde el backlog, por ejemplo), el de debajo **no se
 * anima**: se queda quieto, tapado por el de encima —mismo ancho, mismo
 * borde derecho, así que lo cubre entero mientras dura la entrada— y solo
 * cuando el de encima ya terminó de deslizarse se cierra **de verdad**, no
 * solo se esconde: se le avisa a quien lo abrió (`onClose`) igual que si
 * hubiera pulsado su aspa.
 *
 * ⚠️ **A propósito no «vuelve».** Se probó lo contrario —el de debajo se
 * escondía sin cerrarse y reaparecía al cerrar el de encima, con un «← Volver
 * a Backlog»— y resultó confuso: cerrar la tarea traía de vuelta un backlog
 * que la persona ya daba por cerrado. Si hace falta volver a abrirlo, se abre
 * con su propio botón, como cualquier otro.
 */
const pila: symbol[] = [];
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
  const posicion = pila.indexOf(idDelHueco.current);
  const esCima = posicion !== -1 && posicion === pila.length - 1;
  /** Alguien se abrió encima: seguimos «abiertos» pero ya no se nos ve a nosotros. */
  const cubierto = posicion !== -1 && !esCima;

  /**
   * Mientras estamos tapados nos quedamos quietos —ver el comentario de
   * `pila` más arriba—, y solo pasado el tiempo que tarda el de encima en
   * terminar de entrar avisamos que nos cerramos de verdad. Si el de encima
   * se cierra antes de que venza el plazo, se cancela y ni se nota: seguimos
   * abiertos tal cual estábamos, sin deslizar nada.
   */
  const alCerrar = useRef(onClose);
  alCerrar.current = onClose;
  const [esperando, setEsperando] = useState(false);
  useEffect(() => {
    if (!cubierto) {
      setEsperando(false);
      return;
    }
    /* 320ms: el `sm:duration-300` del panel de encima, con un margen pequeño
       para no adelantarnos al último frame de su transición. */
    const id = setTimeout(() => {
      setEsperando(true);
      alCerrar.current();
    }, 320);
    return () => clearTimeout(id);
  }, [cubierto]);

  const visible = open && !(cubierto && esperando);

  useLayoutEffect(() => {
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
    const esLaDeEncima = () => pila[pila.length - 1] === id;

    const handleGlobalClick = (event: MouseEvent) => {
      if (!closeOnOutsideClick || !esLaDeEncima()) return;
      const target = event.target as Node;
      if (!document.contains(target)) return;
      if (panelRef.current && panelRef.current.contains(target)) return;
      onClose();
    };

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
    };
  }, [open, onClose, closeOnOutsideClick]);

  /**
   * Entrar y salir de la pila, **solo cuando cambia `open`**. Estaba en el
   * efecto de los oyentes, que depende de `onClose`: si esa función cambiaba de
   * identidad, el panel salía y volvía a entrar —arriba del todo—, tapando al
   * que de verdad estaba encima.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const id = idDelHueco.current;
    pila.push(id);
    avisarPila();
    return () => {
      const indice = pila.indexOf(id);
      if (indice !== -1) pila.splice(indice, 1);
      avisarPila();
    };
  }, [open]);

  return (
    <>
      <div
        ref={panelRef}
        role={ariaLabel ? 'complementary' : undefined}
        aria-label={ariaLabel}
        /* Tapado por otro panel: ni clic ni foco ni lector de pantalla — todo
           eso es del de encima mientras dure. `inert` lo quita de los tres a
           la vez, y es justo el estado en el que nos quedamos quietos (ver
           `esperando` arriba), así que no hace falta más que esto. */
        inert={cubierto || undefined}
        /* `data-tone="dark"` redefine los tokens de color para todo el subárbol
           (ver `theme.css`): los átomos de dentro —Select, SelectorDeFecha,
           Input…— salen en la paleta near-black sin tocarlos uno a uno. El
           panel además fija su propio fondo/borde a pelo porque quiere el
           `#0c0c0b` del rebrand, un peldaño por debajo del `surface` de dentro. */
        data-tone={dark ? 'dark' : undefined}
        /* Por posición en la pila: el que se abrió después pinta encima, y es
           lo que hace que tape por completo al de debajo mientras entra —sin
           esto, cuál queda arriba dependía del orden en el árbol de React, no
           de cuál se abrió último.
           ⚠️ **`-1` (fuera de la pila) va a 39, no a 40.** Es el panel que se
           está cerrando: acaba de salir de la pila —su propio efecto lo quita
           antes de pintar— y si aquí se aplanara a 0 empataría con el que
           quede de verdad en esa posición, y el empate lo resuelve el orden
           en el árbol, no quién se abrió último. Con eso, cerrar el de
           encima mientras quedaba otro debajo lo hacía «aparecer por
           encima» un instante, a medio deslizar. */
        style={{ zIndex: posicion === -1 ? 39 : 40 + posicion }}
        className={[
          /* Móvil (por debajo de `sm`): ocupa la pantalla, sube desde abajo como
             una hoja y deja libres el notch y la barra de inicio (M3 de
             `docs/PLAN-MOVIL.md`). Antes aparecía de golpe, sin transición, y
             con la barra inferior encima tapándole el final. Desde `sm`, todo
             es lo de siempre (I1). */
          'fixed inset-y-0 right-0 m-0 h-full w-full max-h-screen overflow-y-auto p-5 text-left max-sm:pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] max-sm:pt-[calc(env(safe-area-inset-top,0px)+1rem)] max-sm:transition-transform max-sm:duration-300 max-sm:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:transition-transform sm:duration-300 sm:left-auto sm:border-l cursor-default',
          dark
            ? 'bg-[#202020] text-white sm:border-white/[0.08]'
            : 'bg-surface text-text-primary sm:border-border',
          sizeClasses[size],
          visible ? 'translate-x-0 translate-y-0' : 'max-sm:translate-y-full sm:translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-full min-w-0 flex-col">
          {/* Sin `title` ni `description` no hay cabecera de este panel: es lo
              que usa PRAX, que trae la suya propia (el desplegable del nombre
              de la conversación) dentro de `children`. Ponerla igual aquí
              vacía —solo el aspa, flotando sobre un hueco— era justo la
              «separación extraña arriba» que se veía: dos cabeceras, una sin
              nada dentro. Sin `title`, quien encierra este panel tiene que
              traer su propio botón de cerrar dentro de `children`. */}
          {(title || description) && (
            <header className="mb-5 flex shrink-0 items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                {title && (
                  <h2 className="truncate font-sans text-lg font-bold tracking-tight">{title}</h2>
                )}
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
          )}

          <div className="flex-1 min-h-0 min-w-0 flex flex-col pr-1 -mr-1">{children}</div>
        </div>
      </div>
    </>
  );
}
