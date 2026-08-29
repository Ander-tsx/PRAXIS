'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AssistantChat } from '../AssistantChat/AssistantChat';
import { useDock } from './DockPanel';
import { PraxContext, type PraxContextValue, type PraxModo } from './PraxContext';

/**
 * PRAX, disponible **desde cualquier pantalla**.
 *
 * ## Qué es
 *
 * El lanzador vive en la cabecera (`PraxLauncher`, donde antes estaban las
 * insignias de rol y plan). Al pulsarlo se abre el minichat, **sin foco de
 * proyecto** — es el modo `POST /me/assistant/chat` de `AssistantChat`, tres
 * herramientas. El PRAX enfocado del lienzo de Análisis es otra cosa y sigue
 * montándose aparte, en su página.
 *
 * ## Los tres modos
 *
 * - `acoplado` — **el de por defecto**: la columna lateral del armazón
 *   (`DockColumn`), que empuja el contenido de la página. Comparte hueco con el
 *   cajón de Análisis: el último que se abre gana.
 * - `flotante` — ventana arrastrable y redimensionable, abajo a la derecha.
 *   Recuerda posición y tamaño; el minichat se queda montado y solo oculto al
 *   cerrar, así que no se pierde el hilo.
 * - Pantalla completa — no se queda: navega a `/assistant`.
 *
 * Cambiar de modo re-monta el minichat (el hilo vive en la base y se recupera
 * desde el desplegable de conversaciones recientes).
 */

const MODO_KEY = 'praxis_prax_modo';
const POS_KEY = 'praxis_prax_pos';

export function PraxProvider({
  zonePath,
  organizacionActivaId,
  children,
}: {
  zonePath: string;
  organizacionActivaId: string | null;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [montado, setMontado] = useState(false);
  /* Por defecto acoplado: el minichat empuja el contenido en la propia página.
     El flotante es la elección de quien lo prefiere, y se recuerda. */
  const [modo, setModo] = useState<PraxModo>('acoplado');
  /** Texto que otro sitio deja puesto en el compositor. El `sello` re-dispara. */
  const [sugerencia, setSugerencia] = useState<{ texto: string; sello: number } | null>(null);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(MODO_KEY);
      if (guardado === 'flotante' || guardado === 'acoplado') setModo(guardado);
    } catch {}
  }, []);

  const abrir = useCallback(() => {
    setMontado(true);
    setAbierto(true);
  }, []);
  const cerrar = useCallback(() => setAbierto(false), []);
  const alternar = useCallback(() => {
    setMontado(true);
    setAbierto((v) => !v);
  }, []);
  const ponerModo = useCallback((siguiente: PraxModo) => {
    setModo(siguiente);
    try {
      localStorage.setItem(MODO_KEY, siguiente);
    } catch {}
  }, []);
  const aPantallaCompleta = useCallback(() => {
    setAbierto(false);
    window.location.assign('/assistant');
  }, []);
  const sugerir = useCallback((texto: string) => {
    setMontado(true);
    setAbierto(true);
    setSugerencia({ texto, sello: Date.now() });
  }, []);

  const valor = useMemo<PraxContextValue>(
    () => ({
      zonePath,
      abierto,
      modo,
      abrir,
      cerrar,
      alternar,
      ponerModo,
      aPantallaCompleta,
      sugerir,
    }),
    [zonePath, abierto, modo, abrir, cerrar, alternar, ponerModo, aPantallaCompleta, sugerir],
  );

  return (
    <PraxContext.Provider value={valor}>
      {children}
      {montado && (
        <PraxHost
          zonePath={zonePath}
          organizacionActivaId={organizacionActivaId}
          abierto={abierto}
          modo={modo}
          sugerencia={sugerencia}
        />
      )}
    </PraxContext.Provider>
  );
}

function PraxHost({
  zonePath,
  organizacionActivaId,
  abierto,
  modo,
  sugerencia,
}: {
  zonePath: string;
  organizacionActivaId: string | null;
  abierto: boolean;
  modo: PraxModo;
  sugerencia: { texto: string; sello: number } | null;
}) {
  const dock = useDock();
  const enDock = modo === 'acoplado';

  /**
   * En modo acoplado, `PraxHost` es el **único dueño** del estado abierto/cerrado
   * del cajón: lo sincroniza con `abierto` y lo cierra al salir de este modo.
   *
   * ⚠️ **No se usa `DockSlot`** —el genérico— a propósito: su limpieza de
   * desmontaje llama a `dock.cerrar()`, y en `StrictMode` de desarrollo esa
   * limpieza se dispara **después** de que este efecto abriera el cajón, sin que
   * nada lo vuelva a abrir. Resultado: había que pulsar dos veces para pasar de
   * flotante a acoplado. Como `PraxHost` no se re-monta al cambiar de modo, su
   * efecto sí corre una sola vez y manda.
   */
  useEffect(() => {
    if (!enDock || !dock) return;
    dock.ponerTitulo('PRAX');
    if (abierto) dock.abrir();
    else dock.cerrar();
    return () => dock.cerrar();
  }, [enDock, abierto, dock]);

  const chat = (
    <AssistantChat
      projectId={null}
      gatewayPath={`${zonePath}/api/gateway`}
      cuotaInicial={null}
      nombres={{}}
      etiquetas={{}}
      variante="flotante"
      sugerenciaExterna={sugerencia}
      organizacionActivaId={organizacionActivaId}
    />
  );

  if (enDock) {
    /* El cajón trae su carcasa (alto, scroll). El fondo negro lo pone este
       envoltorio para no teñir el cajón que también usa Análisis. */
    if (!dock?.hueco) return null;
    return createPortal(
      <div className="flex min-h-0 flex-1 flex-col bg-black">{chat}</div>,
      dock.hueco,
    );
  }

  return <PraxFloatingWindow visible={abierto}>{chat}</PraxFloatingWindow>;
}

interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MARGEN = 16;
const MIN_W = 340;
const MIN_H = 420;
const DEF_W = 400;
const DEF_H = 560;
const TAM_KEY = 'praxis_prax_tam';

function topesDe() {
  return {
    maxW: Math.max(MIN_W, window.innerWidth - MARGEN * 2),
    maxH: Math.max(MIN_H, window.innerHeight - MARGEN * 2),
  };
}

/**
 * Ventana flotante de PRAX: se arrastra por su asa superior y se redimensiona
 * por la esquina inferior derecha, entre un mínimo y el tamaño de la ventana.
 * Recuerda posición y tamaño.
 */
function PraxFloatingWindow({ visible, children }: { visible: boolean; children: ReactNode }) {
  const [caja, setCaja] = useState<Caja | null>(null);
  /** El gesto en curso: mover o redimensionar, con el ancla del puntero. */
  const gesto = useRef<
    | { tipo: 'mover'; dx: number; dy: number }
    | { tipo: 'resize'; x0: number; y0: number; w0: number; h0: number }
    | null
  >(null);

  const encajar = useCallback((c: Caja): Caja => {
    const { maxW, maxH } = topesDe();
    const w = Math.max(MIN_W, Math.min(c.w, maxW));
    const h = Math.max(MIN_H, Math.min(c.h, maxH));
    return {
      w,
      h,
      x: Math.max(MARGEN, Math.min(c.x, window.innerWidth - w - MARGEN)),
      y: Math.max(MARGEN, Math.min(c.y, window.innerHeight - h - MARGEN)),
    };
  }, []);

  useEffect(() => {
    let w = DEF_W;
    let h = DEF_H;
    try {
      const raw = localStorage.getItem(TAM_KEY);
      if (raw) {
        const t = JSON.parse(raw) as { w: number; h: number };
        if (typeof t?.w === 'number' && typeof t?.h === 'number') {
          w = t.w;
          h = t.h;
        }
      }
    } catch {}
    let x = window.innerWidth - w - MARGEN;
    let y = window.innerHeight - h - MARGEN;
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { x: number; y: number };
        if (typeof p?.x === 'number' && typeof p?.y === 'number') {
          x = p.x;
          y = p.y;
        }
      }
    } catch {}
    setCaja(encajar({ x, y, w, h }));
  }, [encajar]);

  useEffect(() => {
    function alRedimensionarVentana() {
      setCaja((c) => (c ? encajar(c) : c));
    }
    window.addEventListener('resize', alRedimensionarVentana);
    return () => window.removeEventListener('resize', alRedimensionarVentana);
  }, [encajar]);

  /**
   * Mientras dura un gesto se bloquea la selección de texto y se fuerza el
   * cursor en **todo** el documento: sin esto, arrastrar rápido sacaba el
   * puntero del asa y el navegador empezaba a seleccionar el texto del chat.
   */
  const bloquearSeleccion = useCallback((cursor: string) => {
    document.body.style.userSelect = 'none';
    document.body.style.cursor = cursor;
  }, []);
  const soltarSeleccion = useCallback(() => {
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  useEffect(() => {
    function alMover(e: PointerEvent) {
      const g = gesto.current;
      if (!g) return;
      e.preventDefault();
      if (g.tipo === 'mover') {
        setCaja((c) => (c ? encajar({ ...c, x: e.clientX - g.dx, y: e.clientY - g.dy }) : c));
      } else {
        setCaja((c) =>
          c ? encajar({ ...c, w: g.w0 + (e.clientX - g.x0), h: g.h0 + (e.clientY - g.y0) }) : c,
        );
      }
    }
    function alSoltar() {
      if (!gesto.current) return;
      gesto.current = null;
      soltarSeleccion();
      setCaja((c) => {
        if (c) {
          try {
            localStorage.setItem(POS_KEY, JSON.stringify({ x: c.x, y: c.y }));
            localStorage.setItem(TAM_KEY, JSON.stringify({ w: c.w, h: c.h }));
          } catch {}
        }
        return c;
      });
    }
    window.addEventListener('pointermove', alMover, { passive: false });
    window.addEventListener('pointerup', alSoltar);
    window.addEventListener('pointercancel', alSoltar);
    return () => {
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alSoltar);
      window.removeEventListener('pointercancel', alSoltar);
    };
  }, [encajar, soltarSeleccion]);

  /* Por si el componente se desmonta a mitad de un gesto. */
  useEffect(() => soltarSeleccion, [soltarSeleccion]);

  if (!caja) return null;

  return (
    <div
      className={`fixed z-[60] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl transition-opacity duration-150 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      style={{ left: caja.x, top: caja.y, width: caja.w, height: caja.h }}
      aria-hidden={!visible}
    >
      {/* El asa: la única zona por la que se arrastra la ventana. Cursor `grab`. */}
      <div
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          gesto.current = { tipo: 'mover', dx: e.clientX - caja.x, dy: e.clientY - caja.y };
          bloquearSeleccion('grabbing');
        }}
        title="Arrastra para mover"
        aria-hidden="true"
        className="flex h-7 shrink-0 cursor-grab touch-none select-none items-center justify-center border-b border-white/5 bg-white/[0.03] active:cursor-grabbing"
      >
        <span className="h-1 w-9 rounded-full bg-white/20" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>

      {/* Redimensionar por la esquina inferior derecha. */}
      <div
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          gesto.current = { tipo: 'resize', x0: e.clientX, y0: e.clientY, w0: caja.w, h0: caja.h };
          bloquearSeleccion('nwse-resize');
        }}
        title="Arrastra para redimensionar"
        aria-hidden="true"
        className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-nwse-resize touch-none select-none"
      >
        <span className="absolute bottom-1.5 right-1.5 h-2 w-2 border-b-2 border-r-2 border-white/30" />
      </div>
    </div>
  );
}
