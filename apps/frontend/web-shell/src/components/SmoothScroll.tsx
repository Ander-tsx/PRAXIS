'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';

/**
 * Scroll suave para la landing — la misma librería que usa Kyloo (Lenis).
 *
 * `duration` más alto que el valor por defecto (1.2) y `wheelMultiplier`
 * por debajo de 1: el scroll pesa un poco más de lo normal a propósito,
 * para que cada sección tarde lo suficiente en pasar y las animaciones de
 * `Reveal` tengan tiempo de completarse antes de que el visitante siga de
 * largo. No es una barra de progreso ni bloquea el scroll — solo lo frena.
 *
 * No monta nada: solo engancha el bucle de `requestAnimationFrame`. Vive
 * fuera de `layout.tsx` porque solo la landing lo necesita — `not-found.tsx`
 * no tiene secciones que merezcan este ritmo.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({
      duration: 1.45,
      easing: (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t)),
      wheelMultiplier: 0.85,
      touchMultiplier: 1.1,
    });

    let rafId: number;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return null;
}
