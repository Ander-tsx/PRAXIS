'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';

/**
 * Dispara una vez cuando el elemento cruza el umbral del viewport — el
 * equivalente CSS de `ScrollTrigger({ start: 'top 80%', once: true })`.
 *
 * El movimiento reducido no necesita caso aparte: las transiciones de
 * `.reveal-inner`/`.g-eyebrow-word` ya se desactivan en `theme.css`, así que
 * el elemento se pinta en su estado final tanto si el observer dispara como
 * si no.
 */
export function useInView<T extends HTMLElement>(
  rootMargin = '0px 0px -20% 0px',
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, inView];
}

/**
 * Progreso de scroll de un elemento, acotado a 0..1. El propio elemento se
 * pasa al callback para escribir estilos "scrubbeados" directamente, sin
 * tocar un ref durante el render.
 *
 * `mode: "cross"` mide el elemento cruzando el viewport completo (top a
 * bottom); `mode: "enter"` empieza en 0 hasta que el borde superior llega al
 * 70% del viewport y termina cuando el inferior llega al 40% — un scrub más
 * tardío y ceñido para texto que debe quedarse apagado hasta que el lector
 * está encima de verdad.
 */
export function useScrollProgress<T extends HTMLElement>(
  onProgress: (progress: number, element: T) => void,
  mode: 'cross' | 'enter' = 'cross',
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const callbackRef = useRef(onProgress);

  useEffect(() => {
    callbackRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let ticking = false;

    const measure = () => {
      ticking = false;
      const rect = node.getBoundingClientRect();
      const vh = window.innerHeight;

      let travelled: number;
      let range: number;
      if (mode === 'enter') {
        travelled = vh * 0.7 - rect.top;
        range = vh * 0.3 + rect.height;
      } else {
        travelled = vh - rect.top;
        range = rect.height + vh;
      }

      if (range <= 0) return;
      callbackRef.current(Math.min(Math.max(travelled / range, 0), 1), node);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [mode]);

  return ref;
}
