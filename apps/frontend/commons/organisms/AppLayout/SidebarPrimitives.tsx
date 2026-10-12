'use client';

import { ChevronDown, Loader2, MoreHorizontal, Search, X } from 'lucide-react';
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createApiClient } from '../../api/client';
import type { EffectivePermissions, ProjectPermission } from '../../api/domain';
import { HojaInferior } from '../../molecules/HojaInferior/HojaInferior';

/**
 * Las piezas que comparten las tres pestañas de la barra lateral —Inicio, Chat
 * y Configuraciones—.
 *
 * ## Por qué viven aquí
 *
 * Cada pestaña nació por separado y se notaba: las etiquetas de sección eran
 * blancas en una y grises en otra, unas filas eran `rounded-full` y otras
 * `rounded-lg`, el alto cambiaba de 36 a 40 px según la pestaña y solo
 * Configuraciones se plegaba. Una sola definición de la fila y de la sección
 * es lo que impide que vuelvan a separarse: si una pestaña necesita algo
 * distinto, lo pide aquí y se ve en las tres.
 */

/** La fila de la barra: mismo alto, radio, hueco y tipografía en las tres pestañas. */
export const SIDEBAR_FILA =
  'flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 font-sans text-[13px] transition-colors duration-150 max-md:min-h-11 max-md:text-[15px]';

/** Fila abierta: activo por tono, no por caja (kyloo-design §13). */
export const SIDEBAR_FILA_ACTIVA = 'bg-white/10 font-semibold text-white';

/** Fila en reposo. */
export const SIDEBAR_FILA_REPOSO =
  'font-medium text-text-primary hover:bg-white/5 hover:text-white';

/** El icono de una fila. `h-4 w-4` en todas: el de Configuraciones era de 20 px y el del árbol de 14. */
export const SIDEBAR_ICONO = 'h-4 w-4 shrink-0';

/** La caja donde se centra lo que va a la izquierda de una fila (icono, monograma o avatar). */
export const SIDEBAR_INICIO = 'flex h-7 w-7 shrink-0 items-center justify-center';

/** La etiqueta de una sección. Gris, no blanca: el blanco es para lo que se puede pulsar. */
export const SIDEBAR_ETIQUETA =
  'font-sans text-[11px] font-semibold uppercase tracking-wider text-text-secondary';

/** Curva de todas las animaciones de la barra. */
const CURVA = 'ease-[cubic-bezier(0.22,0.85,0.28,1)]';

/**
 * ## El rail: la barra plegada
 *
 * Plegada, la barra tenía cinco tamaños a la vez —el pliegue en una caja de
 * 28 px, «Inicio» en una de 50, Chat y Ajustes como iconos sueltos, los
 * proyectos en 44 con un recuadro activo aún mayor, y tu avatar en 40— y el
 * activo se pintaba de tres maneras. Nada decía qué era grupo y qué no.
 *
 * Ahora todo es la misma celda de 40 × 40, con dos contenidos posibles: un
 * icono de 18 px o una imagen de 32 (organización, proyecto, persona, tú). La
 * jerarquía la dan los grupos —separados por `RAIL_DIVISORIA`— y no el tamaño.
 * El activo es siempre el mismo: fondo suave y una barrita de acento a la
 * izquierda.
 */
export const RAIL_CELDA =
  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';
export const RAIL_ACTIVA =
  "bg-white/10 text-white before:absolute before:-left-2 before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-full before:bg-primary before:content-['']";
export const RAIL_REPOSO = 'text-text-secondary hover:bg-white/5 hover:text-white';
/** El icono de una celda del rail. */
export const RAIL_ICONO = 'h-[18px] w-[18px] shrink-0';
/** Entre grupos del rail: la misma raya fina siempre. */
export const RAIL_DIVISORIA = 'mx-auto my-2 h-px w-8 shrink-0 bg-border';

/**
 * El nombre de cada celda del rail, a la derecha y al pasar por encima.
 *
 * Delegado: las celdas solo llevan `data-rail-tip="Nombre"`, y esto escucha en
 * el contenedor. Un `title` nativo tarda un segundo, sale con la tipografía del
 * sistema y en otro sitio en cada navegador; y uno por celda dentro del área
 * con scroll quedaría recortado por su `overflow`. Por eso se pinta en un
 * portal con `position: fixed`.
 *
 * ⚠️ Con su propio estado, en su propio componente: si viviera en el armazón,
 * cada `pointerover` repintaría la barra entera.
 */
export function RailTooltip({
  contenedor,
  activo,
}: {
  contenedor: RefObject<HTMLElement | null>;
  activo: boolean;
}) {
  const [tip, setTip] = useState<{ texto: string; x: number; y: number } | null>(null);
  const actual = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const raiz = contenedor.current;
    if (!raiz || !activo) {
      actual.current = null;
      setTip(null);
      return;
    }
    const mostrar = (objetivo: EventTarget | null) => {
      const el = (objetivo as Element | null)?.closest?.('[data-rail-tip]') as HTMLElement | null;
      if (el === actual.current) return;
      actual.current = el;
      if (!el?.dataset.railTip) {
        setTip(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setTip({ texto: el.dataset.railTip, x: r.right + 10, y: r.top + r.height / 2 });
    };
    const esconder = () => {
      actual.current = null;
      setTip(null);
    };
    const alPasar = (e: Event) => mostrar(e.target);
    raiz.addEventListener('pointerover', alPasar);
    raiz.addEventListener('pointerleave', esconder);
    raiz.addEventListener('focusin', alPasar);
    raiz.addEventListener('focusout', esconder);
    raiz.addEventListener('click', esconder);
    raiz.addEventListener('scroll', esconder, true);
    return () => {
      raiz.removeEventListener('pointerover', alPasar);
      raiz.removeEventListener('pointerleave', esconder);
      raiz.removeEventListener('focusin', alPasar);
      raiz.removeEventListener('focusout', esconder);
      raiz.removeEventListener('click', esconder);
      raiz.removeEventListener('scroll', esconder, true);
    };
  }, [contenedor, activo]);

  if (!tip || typeof document === 'undefined') return null;
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[200] -translate-y-1/2 whitespace-nowrap rounded-md border border-white/10 bg-surface-3 px-2 py-1 font-sans text-xs font-medium text-white shadow-lg"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.texto}
    </div>,
    document.body,
  );
}

/**
 * El buscador de cada pestaña de la barra: Inicio, Chat y Configuraciones.
 *
 * Uno solo para las tres, y siempre en el mismo sitio —primera fila de la
 * pestaña—, para que cambiar de pestaña no mueva lo de debajo: antes solo Chat
 * tenía buscador y las otras dos empezaban más arriba.
 *
 * ⚠️ **`type="text"` con `role="searchbox"`, no `type="search"`.** El de
 * búsqueda trae la X nativa del navegador, que en Chrome es un aspa azulada
 * fuera de la paleta, en Safari un círculo gris, y en Firefox nada. El botón de
 * limpiar es nuestro: el mismo en todos, solo cuando hay algo escrito, y Escape
 * hace lo mismo.
 */
export function BuscadorDeBarra({
  valor,
  onCambiar,
  placeholder,
  etiqueta,
  movil = false,
  children,
}: {
  valor: string;
  onCambiar: (valor: string) => void;
  placeholder: string;
  /** Nombre accesible: qué se busca. */
  etiqueta: string;
  /**
   * La forma de las pantallas de móvil (Inicio y Chat, M8 de
   * `docs/PLAN-MOVIL.md`): pegado arriba mientras se desplaza, más alto para el
   * dedo y con letra de 16 px —con menos, Safari amplía la página al enfocar—.
   * ⚠️ Cuenta con el relleno de `AppHeader` (`p-4`) y lo devuelve con márgenes
   * negativos: así cae **en el mismo sitio** en las dos pantallas.
   */
  movil?: boolean;
  /** Lo que va pegado debajo del campo, en la misma franja (móvil). */
  children?: ReactNode;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const caja = (
    <div className="group/buscador relative shrink-0">
      <Search
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-text-secondary transition-colors group-focus-within/buscador:text-text-primary ${
          movil ? 'left-3 h-4 w-4' : 'left-2.5 h-3.5 w-3.5'
        }`}
        aria-hidden="true"
      />
      <input
        ref={campo}
        type="text"
        role="searchbox"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && valor) {
            e.preventDefault();
            onCambiar('');
          }
        }}
        placeholder={placeholder}
        aria-label={etiqueta}
        autoComplete="off"
        spellCheck={false}
        className={`w-full bg-white/[0.04] font-sans text-text-primary outline-none ring-1 ring-inset ring-white/[0.08] transition-[box-shadow,background-color] placeholder:text-text-secondary hover:ring-white/15 focus:bg-white/[0.06] focus:ring-white/30 ${
          movil ? 'h-10 rounded-xl pl-10 pr-10 text-base' : 'h-8 rounded-lg pl-8 pr-8 text-[13px]'
        }`}
      />
      {valor && (
        <button
          type="button"
          onClick={() => {
            onCambiar('');
            campo.current?.focus();
          }}
          aria-label="Borrar la búsqueda"
          title="Borrar (Esc)"
          className={`absolute top-1/2 flex -translate-y-1/2 items-center justify-center text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
            movil ? 'right-1 h-8 w-8 rounded-lg' : 'right-1.5 h-5 w-5 rounded-md'
          }`}
        >
          <X className={movil ? 'h-4 w-4' : 'h-3 w-3'} strokeWidth={2.25} aria-hidden="true" />
        </button>
      )}
    </div>
  );
  if (!movil) return caja;
  return (
    <div className="sticky top-0 z-10 -mx-4 -mt-4 flex flex-col gap-2 bg-surface/95 px-4 pb-2 pt-3 backdrop-blur-md">
      {caja}
      {children}
    </div>
  );
}

/** Normaliza para buscar: minúsculas y sin acentos, así «diseno» encuentra «Diseño». */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Anima entre 0 y la altura natural del contenido.
 *
 * El truco del grid `0fr ↔ 1fr` con una **transición** y no una `@keyframes`:
 * una animación solo reproduce hacia delante al montar, y esto tiene que
 * interpolar en las dos direcciones. El hijo lleva su propio `overflow-hidden`
 * para poder encogerse por debajo de lo que mide su contenido.
 */
export function Desplegable({
  abierto = true,
  children,
  className = '',
}: {
  abierto?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ${CURVA} motion-reduce:transition-none ${className}`}
      style={{ gridTemplateRows: abierto ? '1fr' : '0fr', opacity: abierto ? 1 : 0 }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/**
 * Lo que se monta y **crece** hasta su sitio, en vez de aparecer de golpe.
 *
 * Nace cerrado y un instante después se abre. `setTimeout` y no
 * `requestAnimationFrame`: en una pestaña en segundo plano los fotogramas se
 * pausan y el contenido se quedaba montado pero a altura cero.
 */
export function Aparece({ children }: { children: ReactNode }) {
  const [dentro, setDentro] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setDentro(true), 20);
    return () => window.clearTimeout(t);
  }, []);
  return <Desplegable abierto={dentro}>{children}</Desplegable>;
}

/**
 * Una sección de la barra: raya fina, etiqueta y contenido plegable.
 *
 * Plegada la barra no hay etiqueta —no cabe— y queda la raya, que sigue
 * separando los grupos. La raya va en todas **menos la primera** de su pestaña:
 * la de arriba del todo no separa nada de nada.
 *
 * Plegable por estado propio, o controlada si se le pasa `compactada` y
 * `onAlternar` (así `NavList` conserva lo que ya guardaba en `localStorage`).
 */
export function SidebarSection({
  etiqueta,
  plegada = false,
  children,
  compactada,
  onAlternar,
  sinCabecera = false,
  sinDivisoria = false,
  accion,
}: {
  etiqueta: string;
  plegada?: boolean;
  children: ReactNode;
  compactada?: boolean;
  onAlternar?: () => void;
  sinCabecera?: boolean;
  /** Sin la raya de arriba que la separa de la sección anterior. */
  sinDivisoria?: boolean;
  /** Un control a la derecha de la etiqueta (un menú ⋯). Ver `MenuFlotante`. */
  accion?: ReactNode;
}) {
  const [interna, setInterna] = useState(false);
  const cerrada = !plegada && (compactada ?? interna);
  const alternar = onAlternar ?? (() => setInterna((v) => !v));

  return (
    <section
      aria-label={etiqueta}
      className={
        plegada || sinDivisoria
          ? 'flex flex-col gap-1'
          : 'flex flex-col gap-1 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border [&:not(:first-child)]:pt-3'
      }
    >
      {!plegada && !sinCabecera && (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={alternar}
            aria-expanded={!cerrada}
            className={`group/seccion flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2.5 py-1 text-left transition-colors hover:text-white ${SIDEBAR_ETIQUETA}`}
          >
            {etiqueta}
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                cerrada ? '-rotate-90' : ''
              }`}
              aria-hidden="true"
            />
          </button>
          {accion}
        </div>
      )}
      <Desplegable abierto={!cerrada}>
        <div className={plegada ? 'flex flex-col items-center gap-1' : 'flex flex-col gap-0.5'}>
          {children}
        </div>
      </Desplegable>
    </section>
  );
}

/** Una entrada del menú ⋯. */
export interface ItemDeMenu {
  clave: string;
  etiqueta: string;
  icono: ReactNode;
  onElegir: () => void;
  peligro?: boolean;
  /** Si el usuario no la tiene en el proyecto, la entrada no se pinta. */
  permiso?: ProjectPermission;
  /** Encabezado pequeño que se pinta antes del primero de su grupo. */
  grupo?: string;
}

/**
 * El botón ⋯ y su menú flotante.
 *
 * Los permisos se piden **al abrir** (`permissions/me`) y no al pintar la fila:
 * una barra con cuarenta filas no puede hacer cuarenta peticiones para
 * enseñar un botón que casi nadie pulsa. Mientras llegan, el menú dice
 * «Comprobando…».
 *
 * Va por portal y con `fixed`: la barra hace scroll y recortaría un menú
 * absoluto, y dentro del cajón móvil —que se mueve con `transform`— un `fixed`
 * normal queda atrapado en el cajón.
 */
export function MenuFlotante({
  etiquetaAria,
  items,
  projectId,
  gatewayPath,
  activa = false,
}: {
  etiquetaAria: string;
  items: ItemDeMenu[];
  /** Sin proyecto no hay permisos que pedir: todas las entradas se enseñan. */
  projectId?: string;
  gatewayPath: string;
  /** La fila está abierta: el botón se queda visible sin pasar el ratón. */
  activa?: boolean;
}) {
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [dentro, setDentro] = useState(false);
  const [posicion, setPosicion] = useState({ top: 0, left: 0 });
  const [permisos, setPermisos] = useState<EffectivePermissions | null | undefined>(undefined);
  /**
   * En móvil el menú es una hoja de acciones (D10 de `docs/PLAN-MOVIL.md`): un
   * flotante de 208 px pegado a un botón de 24 no se acierta con el dedo. Se
   * decide al abrir, que es cuando importa.
   */
  const [comoHoja, setComoHoja] = useState(false);

  useEffect(() => {
    /* La hoja se cierra sola (fondo, Escape, arrastre); y su propio scroll no
       es «la página se movió». */
    if (!abierto || comoHoja) return;
    function fuera(evento: MouseEvent) {
      const destino = evento.target as Node;
      if (menuRef.current?.contains(destino) || botonRef.current?.contains(destino)) return;
      setAbierto(false);
    }
    function tecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false);
    }
    /* Con scroll el botón se mueve y el menú no: se cierra en vez de quedarse flotando. */
    function alDesplazar() {
      setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', alDesplazar, true);
    const t = window.setTimeout(() => setDentro(true), 10);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', alDesplazar, true);
      window.clearTimeout(t);
      setDentro(false);
    };
  }, [abierto, comoHoja]);

  function alternar() {
    if (abierto) {
      setAbierto(false);
      return;
    }
    setComoHoja(window.matchMedia('(max-width: 767px)').matches);
    const caja = botonRef.current?.getBoundingClientRect();
    if (caja) {
      setPosicion({
        top: caja.bottom + 4,
        left: Math.max(8, Math.min(caja.right - 208, window.innerWidth - 216)),
      });
    }
    setAbierto(true);
    if (!projectId) {
      setPermisos({ permissions: {} } as unknown as EffectivePermissions);
      return;
    }
    setPermisos(undefined);
    createApiClient({ gatewayPath })
      .get<EffectivePermissions>(`/projects/${projectId}/permissions/me`)
      .then(setPermisos)
      .catch(() => setPermisos(null));
  }

  const visibles = items.filter(
    (item) => !projectId || !item.permiso || permisos?.permissions[item.permiso] === true,
  );

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        onClick={alternar}
        aria-label={etiquetaAria}
        aria-haspopup="menu"
        aria-expanded={abierto}
        /* En móvil no hay `hover` que lo enseñe: siempre a la vista, y del
           tamaño de un dedo (I5). */
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-secondary transition hover:bg-white/10 hover:text-white focus-visible:opacity-100 max-md:h-9 max-md:w-9 max-md:opacity-100 ${
          abierto || activa ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {comoHoja && (
        <HojaInferior abierta={abierto} onCerrar={() => setAbierto(false)} titulo={etiquetaAria}>
          <div className="flex flex-col px-2 pb-3">
            {permisos === undefined ? (
              <p className="px-3 py-4 font-sans text-sm text-text-secondary">Comprobando…</p>
            ) : visibles.length === 0 ? (
              <p className="px-3 py-4 font-sans text-sm text-text-secondary">
                No tienes permiso para cambiar esto.
              </p>
            ) : (
              visibles.map((item, i) => {
                const nuevoGrupo = item.grupo && item.grupo !== visibles[i - 1]?.grupo;
                const nuevaZona = item.peligro && !visibles[i - 1]?.peligro && i > 0;
                return (
                  <div key={item.clave}>
                    {(nuevaZona || (nuevoGrupo && i > 0)) && (
                      <div className="mx-3 my-1 border-t border-white/10" aria-hidden="true" />
                    )}
                    {nuevoGrupo && (
                      <p className={`px-3 pb-1 pt-2 ${SIDEBAR_ETIQUETA}`}>{item.grupo}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setAbierto(false);
                        item.onElegir();
                      }}
                      className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left font-sans text-[15px] active:bg-white/10 ${
                        item.peligro ? 'text-error' : 'text-text-primary'
                      }`}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-5 [&>svg]:w-5">
                        {item.icono}
                      </span>
                      {item.etiqueta}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </HojaInferior>
      )}
      {abierto &&
        !comoHoja &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: posicion.top, left: posicion.left }}
            className={`fixed z-[120] w-52 origin-top-right rounded-xl border border-white/10 bg-surface p-1 shadow-2xl transition-[opacity,transform] duration-150 motion-reduce:transition-none ${
              dentro ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
            }`}
          >
            {permisos === undefined ? (
              <p className="px-2.5 py-2 font-sans text-xs text-text-secondary">Comprobando…</p>
            ) : visibles.length === 0 ? (
              <p className="px-2.5 py-2 font-sans text-xs text-text-secondary">
                No tienes permiso para cambiar esto.
              </p>
            ) : (
              visibles.map((item, i) => {
                const nuevoGrupo = item.grupo && item.grupo !== visibles[i - 1]?.grupo;
                const nuevaZona = item.peligro && !visibles[i - 1]?.peligro && i > 0;
                return (
                  <div key={item.clave}>
                    {(nuevaZona || (nuevoGrupo && i > 0)) && (
                      <div className="my-1 border-t border-white/10" aria-hidden="true" />
                    )}
                    {nuevoGrupo && (
                      <p className={`px-2.5 pb-1 pt-1.5 ${SIDEBAR_ETIQUETA}`}>{item.grupo}</p>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAbierto(false);
                        item.onElegir();
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left font-sans text-[13px] transition-colors ${
                        item.peligro
                          ? 'text-error hover:bg-error-muted'
                          : 'text-text-primary hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
                        {item.icono}
                      </span>
                      {item.etiqueta}
                    </button>
                  </div>
                );
              })
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Una fila que es un campo de texto: crear o renombrar **sin salir de la lista**.
 *
 * - **Intro** envía, **Escape** cancela.
 * - Perder el foco con el campo vacío o sin cambios cancela; con texto no hace
 *   nada, para no perder lo escrito por pulsar fuera sin querer.
 * - `onEnviar` devuelve el mensaje de error, o `null` si salió bien. Un fallo
 *   deja la fila abierta con el texto y el motivo debajo.
 */
export function CampoEnLinea({
  icono,
  inicial = '',
  placeholder,
  etiquetaAria,
  maxLength = 100,
  minimo = 2,
  extra,
  onEnviar,
  onCancelar,
}: {
  icono: ReactNode;
  inicial?: string;
  placeholder: string;
  etiquetaAria: string;
  maxLength?: number;
  minimo?: number;
  /** Controles bajo el campo (el tipo de tablero, por ejemplo). */
  extra?: ReactNode;
  onEnviar: (valor: string) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [valor, setValor] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  async function enviar() {
    const limpio = valor.trim();
    if (limpio.length < minimo) {
      setError(minimo > 1 ? `Necesita al menos ${minimo} caracteres.` : 'Escribe un nombre.');
      return;
    }
    if (limpio === inicial.trim()) {
      onCancelar();
      return;
    }
    setOcupado(true);
    setError(null);
    const fallo = await onEnviar(limpio);
    setOcupado(false);
    if (fallo) setError(fallo);
  }

  return (
    <Aparece>
      <div
        ref={contenedorRef}
        className="flex flex-col gap-1 py-0.5"
        onBlur={(evento) => {
          /* Mover el foco dentro del propio bloque (a un chip, por ejemplo) no es salir. */
          if (contenedorRef.current?.contains(evento.relatedTarget as Node | null)) return;
          if (!ocupado && (valor.trim() === '' || valor.trim() === inicial.trim())) onCancelar();
        }}
      >
        <div className="flex min-h-9 items-center gap-2.5 rounded-lg bg-white/5 px-2.5 ring-1 ring-inset ring-white/20 focus-within:ring-white/40">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-secondary [&>svg]:h-4 [&>svg]:w-4">
            {icono}
          </span>
          <input
            // biome-ignore lint/a11y/noAutofocus: el campo nace por una acción de la persona, y el foco es lo esperado.
            autoFocus
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void enviar();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancelar();
              }
            }}
            onFocus={(e) => e.currentTarget.select()}
            disabled={ocupado}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-label={etiquetaAria}
            aria-invalid={error ? true : undefined}
            className="min-w-0 flex-1 bg-transparent font-sans text-[13px] font-medium text-white placeholder:text-text-secondary focus:outline-none disabled:opacity-60"
          />
          {ocupado && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-text-secondary" />}
        </div>
        {extra}
        {error ? (
          <p role="alert" className="px-2.5 font-sans text-[11px] leading-snug text-error">
            {error}
          </p>
        ) : (
          <p className="px-2.5 font-sans text-[10px] text-text-secondary">
            Intro para guardar · Esc para cancelar
          </p>
        )}
      </div>
    </Aparece>
  );
}

/**
 * La confirmación de borrar, **dentro de la lista** y no en un modal.
 *
 * Crece justo bajo la fila afectada, así que se ve qué se va a borrar. Si
 * `escribir` viene, hay que teclear ese nombre: es lo que protege un proyecto
 * o un espacio, que se llevan por delante todo lo que contienen.
 */
export function ConfirmarEnLinea({
  nombre,
  aviso,
  escribir,
  etiquetaBoton = 'Eliminar',
  onConfirmar,
  onCancelar,
}: {
  nombre: string;
  aviso: string;
  escribir?: string;
  etiquetaBoton?: string;
  onConfirmar: () => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const permitido = !escribir || texto.trim() === escribir;

  async function confirmar() {
    if (!permitido || ocupado) return;
    setOcupado(true);
    setError(null);
    const fallo = await onConfirmar();
    setOcupado(false);
    if (fallo) setError(fallo);
  }

  return (
    <Aparece>
      <div
        role="alertdialog"
        aria-label={`Eliminar ${nombre}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancelar();
        }}
        className="my-1 flex flex-col gap-2 rounded-lg border border-error/30 bg-error-muted p-2.5"
      >
        <p className="font-sans text-[12px] font-semibold leading-snug text-white">
          ¿Eliminar «{nombre}»?
        </p>
        <p className="font-sans text-[11px] leading-snug text-text-secondary">{aviso}</p>
        {escribir && (
          <input
            // biome-ignore lint/a11y/noAutofocus: aparece al pedir eliminar; el foco es lo esperado.
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void confirmar();
              }
            }}
            placeholder={`Escribe «${escribir}»`}
            aria-label={`Escribe ${escribir} para confirmar`}
            className="min-h-8 rounded-md bg-black/30 px-2 font-sans text-[12px] text-white ring-1 ring-inset ring-white/15 placeholder:text-text-secondary focus:outline-none focus:ring-white/40"
          />
        )}
        {error && (
          <p role="alert" className="font-sans text-[11px] leading-snug text-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onCancelar}
            disabled={ocupado}
            className="rounded-md px-2.5 py-1 font-sans text-[12px] font-medium text-text-primary transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={!permitido || ocupado}
            className="flex items-center gap-1.5 rounded-md bg-error px-2.5 py-1 font-sans text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ocupado && <Loader2 className="h-3 w-3 animate-spin" />}
            {etiquetaBoton}
          </button>
        </div>
      </div>
    </Aparece>
  );
}

/**
 * El ciclo de vida de un flotante anclado a la barra —avisos, perfil—: montarlo,
 * animar su entrada y su salida, y cerrarlo con un clic fuera o con Escape.
 *
 * - `visible` es si está montado; `entrada`, si está en su sitio. Son dos para
 *   poder animar las dos direcciones: al abrir se monta y **un instante después**
 *   se pone en su sitio (si no, nace ya en destino y no hay transición); al
 *   cerrar se saca primero y se desmonta cuando termina.
 * - `ref` va en un contenedor que envuelva **el botón y el flotante**: un clic
 *   en el botón no es «fuera», y si lo fuera, el mismo clic que lo cierra lo
 *   volvería a abrir.
 *
 * ⚠️ Hay dos instancias de la barra (escritorio y cajón móvil) que comparten el
 * estado `abierto`. La que está oculta por CSS no monta nada ni reacciona al
 * clic fuera: sin ese filtro, pulsar dentro del flotante visible lo cerraría
 * desde la instancia invisible.
 */
export function usePopover(abierto: boolean, onCerrar: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [entrada, setEntrada] = useState(false);

  useEffect(() => {
    const enPantalla = (ref.current?.getClientRects().length ?? 0) > 0;
    if (abierto && enPantalla) {
      setVisible(true);
      /* `setTimeout` y no `requestAnimationFrame`: en una pestaña en segundo plano
         los fotogramas se pausan y el flotante se quedaba montado y transparente. */
      const t = window.setTimeout(() => setEntrada(true), 20);
      return () => window.clearTimeout(t);
    }
    setEntrada(false);
    const t = window.setTimeout(() => setVisible(false), 220);
    return () => window.clearTimeout(t);
  }, [abierto]);

  useEffect(() => {
    const enPantalla = (ref.current?.getClientRects().length ?? 0) > 0;
    if (!abierto || !enPantalla) return;

    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCerrar();
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar();
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto, onCerrar]);

  return { ref, visible, entrada };
}

/**
 * La caja de un flotante de la barra, con su animación de entrada.
 *
 * `anclaje` dice desde dónde crece: `'abajo'` para lo que vive en el pie
 * (perfil, avisos) y `'arriba'` para lo de la cabecera (la organización con la
 * barra plegada). Misma caja, mismo movimiento, solo cambia hacia dónde abre.
 */
export function claseDePopover(
  entrada: boolean,
  plegada: boolean,
  anclaje: 'abajo' | 'arriba' = 'abajo',
): string {
  const arriba = anclaje === 'arriba';
  return `absolute z-50 rounded-2xl border border-border bg-surface-3 shadow-xl transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
    plegada
      ? arriba
        ? 'top-0 left-full ml-2 w-80 origin-top-left'
        : 'bottom-0 left-full ml-2 w-80 origin-bottom-left'
      : 'bottom-full left-2 right-2 mb-2 origin-bottom'
  } ${
    entrada
      ? 'translate-y-0 scale-100 opacity-100'
      : `pointer-events-none ${arriba ? '-translate-y-3' : 'translate-y-3'} scale-95 opacity-0`
  }`;
}
