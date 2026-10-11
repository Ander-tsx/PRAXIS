'use client';

import { useEffect, useRef } from 'react';

/**
 * Registra el service worker y **aplica solo** cada versión nueva (M1 de
 * `docs/PLAN-MOVIL.md`).
 *
 * ## Solo en producción
 *
 * En `next dev` los recursos cambian a cada guardado y no llevan hash: un SW
 * guardándolos serviría código viejo y volvería loco el refresco en caliente.
 *
 * ## Una versión nueva se impone (D6, revisada el 2026-10-11)
 *
 * El SW nuevo se instala y, en cuanto está listo, se le dice `activar`; al tomar
 * el mando (`controllerchange`) la página se recarga. Antes se ofrecía un botón
 * «Actualizar» y la actualización esperaba a que alguien lo pulsara: no aportaba
 * nada, molestaba, y dejaba a medio mundo días con una versión vieja.
 *
 * Además se le pide al navegador que compruebe si hay versión cada vez que la
 * app vuelve a primer plano: una app instalada puede pasar días abierta sin
 * navegar, y sin esto no se enteraría nunca.
 */
export function RegistroDelServiceWorker() {
  /**
   * 🔴 **Solo se recarga si se pidió.** `controllerchange` salta también en la
   * **primera** instalación —el SW recién activado reclama la página con
   * `clients.claim()`—, y recargar ahí se comía lo que hubiera a medio
   * escribir: el formulario de alta perdía el correo a los dos segundos de
   * entrar por primera vez. La prueba `01-pwa` lo destapó. «Se pidió» es ahora
   * «había ya uno controlando y llegó otro»: solo una actualización.
   */
  const actualizacionPedida = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;

    let registro: ServiceWorkerRegistration | null = null;
    let recargando = false;

    const aplicar = (nuevo: ServiceWorker) => {
      actualizacionPedida.current = true;
      nuevo.postMessage({ tipo: 'activar' });
    };

    const vigilar = (reg: ServiceWorkerRegistration) => {
      /* Ya había uno esperando de una visita anterior. */
      if (reg.waiting && navigator.serviceWorker.controller) aplicar(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        nuevo?.addEventListener('statechange', () => {
          /* Con `controller` es una actualización; sin él es la primera
             instalación y no hay nada que actualizar. */
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) aplicar(nuevo);
        });
      });
    };

    const alCambiarDeMando = () => {
      if (!actualizacionPedida.current || recargando) return;
      recargando = true;
      window.location.reload();
    };
    const alVolver = () => {
      if (document.visibilityState === 'visible') registro?.update().catch(() => undefined);
    };

    navigator.serviceWorker
      /* URL fija: la versión va dentro del script. Ver `src/app/sw.js/route.ts`. */
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        registro = reg;
        vigilar(reg);
      })
      .catch(() => undefined);

    navigator.serviceWorker.addEventListener('controllerchange', alCambiarDeMando);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', alCambiarDeMando);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, []);

  return null;
}
