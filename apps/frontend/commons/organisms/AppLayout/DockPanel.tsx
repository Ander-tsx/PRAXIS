'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { alpha, colors } from '../../tokens';

/**
 * El cajón lateral del área privada: una columna más del armazón.
 *
 * ## Por qué vive en el armazón y no en la página
 *
 * Porque **empuja el contenido en vez de taparlo**, y eso solo se puede hacer
 * bien desde el sitio que manda en el ancho. La primera versión lo conseguía
 * escribiendo `document.body.style.paddingRight` desde el propio panel, y
 * funcionaba — pero es estado global sin dueño: dos cajones abiertos a la vez,
 * o un desmontaje sin limpieza, dejan el relleno pegado para siempre y nadie
 * sabe quién lo puso.
 *
 * `AppShell` ya es una fila flex —barra lateral, contenido— así que el cajón es
 * el tercer hermano. Abrir es cambiar un ancho; el contenido se recoloca porque
 * es lo que hace un `flex`, no porque nadie le haya sumado un margen. Y el
 * contenedor de scroll del contenido mide bien, que con el truco del `body` no
 * pasaba.
 *
 * ## Empujar y no tapar, y por qué importa aquí
 *
 * En Análisis el gesto es **mirar un gráfico y preguntar por él**. Un panel
 * flotante taparía justamente aquello sobre lo que se pregunta, que es la única
 * cosa que este cajón no se puede permitir.
 *
 * ⚠️ **En móvil no hay a dónde empujar**, así que ahí deja de empujar y se
 * comporta como una hoja a pantalla casi completa, con su velo. No es el mismo
 * componente encogido: es otra forma, porque el problema es otro.
 *
 * ## El contenido va por portal, y esa es la decisión que importa
 *
 * `DockSlot` renderiza **dentro del árbol de React de la página** y lo proyecta
 * al hueco del armazón. Se hizo así por una razón concreta: la conversación con
 * PRAX **tiene que sobrevivir a cerrar el cajón**. El gesto real es preguntar,
 * cerrar, mirar el gráfico, volver a abrir y seguir; si al cerrar se desmontara,
 * cada vuelta empezaría de cero y el asistente dejaría de servir justo para lo
 * que se abrió.
 *
 * Por eso cerrado **no se desmonta nada**: la columna se queda en ancho cero y
 * el contenido sigue montado detrás. Cuesta tener un componente vivo que no se
 * ve; se paga a gusto a cambio de no perder el hilo.
 */

interface DockContextValue {
  abierto: boolean;
  abrir: () => void;
  cerrar: () => void;
  alternar: () => void;
  /** El hueco del armazón donde `DockSlot` proyecta. `null` antes de montar. */
  hueco: HTMLDivElement | null;
  /** Lo registra el armazón; nadie más debería llamarlo. */
  registrarHueco: (nodo: HTMLDivElement | null) => void;
  titulo: string;
  ponerTitulo: (titulo: string) => void;
}

const DockContext = createContext<DockContextValue | null>(null);

/**
 * Estado del cajón.
 *
 * Fuera del armazón privado devuelve `null` en vez de reventar: hay componentes
 * compartidos que se montan también en la landing, y un `throw` los rompería
 * ahí por una función que ni usan.
 */
export function useDock(): DockContextValue | null {
  return useContext(DockContext);
}

export function DockProvider({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const [hueco, setHueco] = useState<HTMLDivElement | null>(null);
  const [titulo, setTitulo] = useState('');

  const abrir = useCallback(() => setAbierto(true), []);
  const cerrar = useCallback(() => setAbierto(false), []);
  const alternar = useCallback(() => setAbierto((estaba) => !estaba), []);

  /**
   * Escape cierra.
   *
   * Solo eso: **no se cierra al pulsar fuera**, al revés que un diálogo. Un
   * cajón que empuja no es modal —el contenido de al lado sigue siendo
   * utilizable, y de hecho para eso empuja— así que interpretar un clic en un
   * gráfico como «cierra el cajón» sería cerrarlo justo cuando se está haciendo
   * lo que el cajón vino a acompañar.
   */
  useEffect(() => {
    if (!abierto) return;
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [abierto]);

  const valor = useMemo<DockContextValue>(
    () => ({
      abierto,
      abrir,
      cerrar,
      alternar,
      hueco,
      registrarHueco: setHueco,
      titulo,
      ponerTitulo: setTitulo,
    }),
    [abierto, abrir, cerrar, alternar, hueco, titulo],
  );

  return <DockContext.Provider value={valor}>{children}</DockContext.Provider>;
}

/**
 * La columna del cajón. La monta `AppShell`, una vez.
 *
 * ⚠️ **La transición es sobre `width`, y eso tiene un coste conocido**: obliga
 * al navegador a recalcular el diseño en cada fotograma, y arrastra con él a
 * todo lo que haya en la columna de al lado. En una pantalla de gráficos eso se
 * nota, porque `ResponsiveContainer` de Recharts vuelve a medir con cada cambio.
 *
 * Se acepta a propósito: la alternativa —animar un `transform`, que va en la
 * capa de composición y no toca el diseño— **no puede empujar nada**, porque un
 * elemento transformado sigue ocupando su sitio original. Empujar es justamente
 * lo que se quiere aquí, así que el pago es ese. 240 ms es el tope antes de que
 * el tirón se vea.
 */
export function DockColumn() {
  const dock = useDock();
  if (!dock) return null;

  const { abierto, cerrar, registrarHueco, titulo } = dock;

  return (
    <>
      {/**
       * El velo, **solo en móvil**. En escritorio no hay: el cajón no es modal
       * y lo de al lado se sigue pudiendo usar.
       */}
      {abierto && (
        <button
          type="button"
          aria-label="Cerrar el panel"
          onClick={cerrar}
          className="fixed inset-0 z-30 cursor-default md:hidden"
          style={{ background: alpha(colors.overlay, 55) }}
        />
      )}

      <aside
        aria-hidden={!abierto}
        aria-label={titulo || 'Panel lateral'}
        className={[
          'flex shrink-0 flex-col',
          /* Móvil: hoja fija por encima de todo. Escritorio: columna que empuja. */
          'fixed inset-y-0 right-0 z-40 w-[min(26rem,92vw)] md:relative md:z-auto',
          abierto
            ? 'translate-x-0 md:w-[26rem] lg:w-[28rem]'
            : 'translate-x-full md:w-0 md:translate-x-0',
          'transition-[width,transform] duration-[240ms] ease-out motion-reduce:transition-none',
        ].join(' ')}
      >
        <div
          className={[
            'absolute inset-0 flex flex-col overflow-hidden bg-surface border-l border-border',
            abierto ? 'md:border-l' : 'md:border-l-0',
          ].join(' ')}
        >
          {/**
           * ⚠️ El hueco se registra **siempre**, esté abierto o cerrado.
           *
           * Es lo que mantiene el contenido montado detrás de una columna de ancho
           * cero, que es toda la razón de ser del portal: cerrar el cajón no puede
           * perder la conversación. Si esto solo existiera con `abierto`, el
           * portal se desmontaría al cerrar y el hilo se iría con él.
           */}
          <div ref={registrarHueco} className="flex min-h-0 min-w-0 flex-1 flex-col" />
        </div>

        {/* El botón de plegar, asomando en el borde izquierdo. Solo se muestra en desktop. */}
        <button
          type="button"
          onClick={cerrar}
          title="Plegar asistente"
          aria-label="Plegar asistente"
          /* Cerrado sigue montado —solo invisible— así que sin esto el tabulador
             se para en un botón que no se ve. */
          tabIndex={abierto ? 0 : -1}
          className={[
            'absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10',
            'hidden md:flex h-8 w-8 items-center justify-center rounded-full bg-surface border border-border text-text-secondary shadow-sm transition-all hover:text-text-primary hover:bg-hover hover:scale-105',
            abierto ? 'opacity-100 scale-100 delay-100' : 'opacity-0 scale-75 pointer-events-none',
          ].join(' ')}
          style={{ boxShadow: `0 4px 12px ${alpha(colors.overlay, 15)}` }}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </aside>
    </>
  );
}

export interface DockSlotProps {
  /** Se anuncia como nombre accesible de la columna. */
  titulo: string;
  children: ReactNode;
}

/**
 * Proyecta contenido al cajón, desde la página.
 *
 * Se monta y se queda: la visibilidad la decide la columna con su ancho, no
 * este componente desapareciendo. Ver la nota del portal arriba.
 */
export function DockSlot({ titulo, children }: DockSlotProps) {
  const dock = useDock();
  const cerrarRef = useRef(dock?.cerrar);
  cerrarRef.current = dock?.cerrar;

  useEffect(() => {
    dock?.ponerTitulo(titulo);
  }, [dock, titulo]);

  useEffect(() => {
    return () => {
      cerrarRef.current?.();
    };
  }, []);

  if (!dock?.hueco) return null;
  return createPortal(children, dock.hueco);
}
