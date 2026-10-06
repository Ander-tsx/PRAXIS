'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CONSULTA_MOVIL } from '../../hooks/useEsMovil';
import { useRefrescoAgrupado } from '../../hooks/useRefrescoAgrupado';

/** Desde cuántos píxeles del borde izquierdo empieza el gesto de volver. */
const BORDE_PX = 24;
/** Lo que hay que arrastrar para que cuente. */
const UMBRAL_ATRAS_PX = 80;
const UMBRAL_REFRESCO_PX = 72;
/** El tirón se frena: el indicador recorre menos que el dedo. */
const RESISTENCIA = 0.5;

/** Las raíces de cada pestaña de abajo: de ahí no se vuelve deslizando. */
const RAICES = new Set(['/projects', '/chat', '/assistant']);

/**
 * Los dos gestos que una app instalada no trae sola (D11 de
 * `docs/PLAN-MOVIL.md`). **Solo en móvil**: en escritorio no escucha nada.
 *
 * ## Volver deslizando desde el borde
 *
 * Safari en una PWA instalada no tiene el gesto de volver de iOS: sin esto, la
 * única salida de una pantalla es su botón «atrás». Empieza a menos de 24 px
 * del borde izquierdo —para no robarle el gesto horizontal al tablero o a un
 * carrusel—, sigue al dedo con una flecha, y si se suelta pasados 80 px,
 * `history.back()`. En la raíz de una pestaña no hace nada: volver desde ahí
 * sacaría de la app. En Android lo atrapa antes el gesto del sistema, que hace
 * lo mismo.
 *
 * ## Tirar para refrescar
 *
 * Solo cuando lo que se desplaza es la pantalla entera (`<main>` con scroll) y
 * ya está arriba del todo. El tablero y el chat se desplazan por dentro y ahí
 * un tirón hacia abajo es leer mensajes viejos, no refrescar. Refresca con
 * `useRefrescoAgrupado` (regla del repo), no con un `router.refresh()` suelto.
 */
export function GestosMoviles() {
  const router = useRouter();
  const refrescar = useRefrescoAgrupado();
  const [atras, setAtras] = useState(0);
  const [tiron, setTiron] = useState(0);
  const [refrescando, setRefrescando] = useState(false);
  const refrescarRef = useRef(refrescar);
  refrescarRef.current = refrescar;

  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA_MOVIL);
    let gesto: 'atras' | 'refresco' | null = null;
    let x0 = 0;
    let y0 = 0;
    let dx = 0;
    let dy = 0;

    const empieza = (e: TouchEvent) => {
      if (!consulta.matches || e.touches.length !== 1) return;
      const t = e.touches[0];
      x0 = t.clientX;
      y0 = t.clientY;
      dx = 0;
      dy = 0;
      gesto = null;
      const objetivo = e.target as Element | null;
      /* Dentro de una hoja o de un diálogo no hay ni volver ni refrescar. */
      if (objetivo?.closest('[role="dialog"]')) return;
      if (x0 <= BORDE_PX && !RAICES.has(window.location.pathname)) {
        gesto = 'atras';
        return;
      }
      const principal = objetivo?.closest('main');
      if (
        principal &&
        principal.scrollTop <= 0 &&
        getComputedStyle(principal).overflowY === 'auto' &&
        principal.scrollHeight >= principal.clientHeight
      ) {
        gesto = 'refresco';
      }
    };

    const mueve = (e: TouchEvent) => {
      if (!gesto) return;
      const t = e.touches[0];
      dx = t.clientX - x0;
      dy = t.clientY - y0;
      if (gesto === 'atras') {
        /* Si el dedo va más en vertical que en horizontal, no era volver. */
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
          gesto = null;
          setAtras(0);
          return;
        }
        setAtras(Math.max(0, dx));
      } else if (gesto === 'refresco') {
        if (dy <= 0 || Math.abs(dx) > dy) {
          setTiron(0);
          if (dy < -4) gesto = null;
          return;
        }
        setTiron(dy * RESISTENCIA);
      }
    };

    const termina = () => {
      if (gesto === 'atras' && dx > UMBRAL_ATRAS_PX && window.history.length > 1) {
        router.back();
      }
      if (gesto === 'refresco' && dy * RESISTENCIA > UMBRAL_REFRESCO_PX) {
        setRefrescando(true);
        refrescarRef.current();
        window.setTimeout(() => setRefrescando(false), 900);
      }
      gesto = null;
      setAtras(0);
      setTiron(0);
    };

    document.addEventListener('touchstart', empieza, { passive: true });
    document.addEventListener('touchmove', mueve, { passive: true });
    document.addEventListener('touchend', termina);
    document.addEventListener('touchcancel', termina);
    return () => {
      document.removeEventListener('touchstart', empieza);
      document.removeEventListener('touchmove', mueve);
      document.removeEventListener('touchend', termina);
      document.removeEventListener('touchcancel', termina);
    };
  }, [router]);

  const progresoAtras = Math.min(1, atras / UMBRAL_ATRAS_PX);
  const recorrido = refrescando ? UMBRAL_REFRESCO_PX : Math.min(tiron, UMBRAL_REFRESCO_PX * 1.4);
  const progresoRefresco = Math.min(1, recorrido / UMBRAL_REFRESCO_PX);

  return (
    <div aria-hidden="true" className="pointer-events-none md:hidden">
      {atras > 0 && (
        <span
          className="fixed left-0 top-1/2 z-[350] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[#252525] text-white shadow-lg"
          style={{
            transform: `translate(${Math.min(atras, 96) * 0.6 - 20}px, -50%)`,
            opacity: 0.35 + progresoAtras * 0.65,
          }}
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </span>
      )}
      {(tiron > 0 || refrescando) && (
        <span
          className="fixed left-1/2 top-0 z-[350] flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#252525] text-white shadow-lg"
          style={{
            transform: `translate(-50%, calc(env(safe-area-inset-top, 0px) + ${recorrido - 20}px))`,
            opacity: refrescando ? 1 : 0.3 + progresoRefresco * 0.7,
          }}
        >
          <svg
            aria-hidden="true"
            className={`h-4 w-4 ${refrescando ? 'animate-spin' : ''}`}
            style={refrescando ? undefined : { transform: `rotate(${progresoRefresco * 270}deg)` }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.25}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 12a8 8 0 11-2.34-5.66M20 4v4h-4"
            />
          </svg>
        </span>
      )}
    </div>
  );
}
