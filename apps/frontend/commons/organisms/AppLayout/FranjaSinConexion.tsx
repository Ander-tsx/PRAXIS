'use client';

import { useEffect, useState } from 'react';

/** Cuánto se espera a la sonda antes de darla por perdida. */
const ESPERA_DE_SONDA_MS = 4000;

/**
 * ¿Hay red de verdad? `navigator.onLine` no basta: dice `true` con un wifi sin
 * salida a internet, y en una página que sirvió el service worker sin red
 * también puede decirlo. Se confirma con una petición real a `/sw.js`, que es
 * lo único que el SW nunca contesta de caché (ver `src/service-worker/sw.js`).
 */
async function hayRed(): Promise<boolean> {
  if (!navigator.onLine) return false;
  const control = new AbortController();
  const t = window.setTimeout(() => control.abort(), ESPERA_DE_SONDA_MS);
  try {
    const respuesta = await fetch('/sw.js', {
      method: 'HEAD',
      cache: 'no-store',
      signal: control.signal,
    });
    return respuesta.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(t);
  }
}

/**
 * La franja de «Sin conexión» (D13 de `docs/PLAN-MOVIL.md`).
 *
 * Sin red, lo que se ve puede ser la copia que guardó el service worker (M7),
 * y nada de lo que se toque se va a guardar: las acciones fallan contra el
 * servidor. Sin decirlo, una pantalla que no responde se lee como una avería.
 * En escritorio también: la falta de red no es cosa del tamaño.
 */
export function FranjaSinConexion() {
  const [sinRed, setSinRed] = useState(false);

  useEffect(() => {
    let vigente = true;
    const comprobar = () => {
      hayRed().then((hay) => {
        if (vigente) setSinRed(!hay);
      });
    };
    const alVolver = () => {
      if (document.visibilityState === 'visible') comprobar();
    };
    comprobar();
    window.addEventListener('online', comprobar);
    window.addEventListener('offline', comprobar);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vigente = false;
      window.removeEventListener('online', comprobar);
      window.removeEventListener('offline', comprobar);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, []);

  if (!sinRed) return null;
  return (
    <output className="pointer-events-none fixed inset-x-0 top-0 z-[320] flex justify-center px-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]">
      <span className="rounded-full border border-warning/30 bg-[#2a2416] px-3.5 py-1.5 text-center font-sans text-xs text-warning shadow-lg">
        Sin conexión · Ves lo último que se cargó, y lo que cambies no se guardará.
      </span>
    </output>
  );
}
