'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Registra el service worker y avisa cuando hay una versión nueva (M1 de
 * `docs/PLAN-MOVIL.md`).
 *
 * ## Solo en producción
 *
 * En `next dev` los recursos cambian a cada guardado y no llevan hash: un SW
 * guardándolos serviría código viejo y volvería loco el refresco en caliente.
 *
 * ## Una versión nueva nunca se impone (D6)
 *
 * El SW nuevo se instala y **espera**. Aquí se detecta y se ofrece
 * «Actualizar»; solo al pulsarlo se le dice `activar`, y cuando toma el mando
 * (`controllerchange`) se recarga. Recargar sin preguntar podría tirar un
 * documento a medio escribir.
 *
 * Además se le pide al navegador que compruebe si hay versión cada vez que la
 * app vuelve a primer plano: una app instalada puede pasar días abierta sin
 * navegar, y sin esto no se enteraría nunca.
 */
export function RegistroDelServiceWorker() {
  const [esperando, setEsperando] = useState<ServiceWorker | null>(null);
  /**
   * 🔴 **Solo se recarga si se pidió.** `controllerchange` salta también en la
   * **primera** instalación —el SW recién activado reclama la página con
   * `clients.claim()`—, y recargar ahí se comía lo que hubiera a medio
   * escribir: el formulario de alta perdía el correo a los dos segundos de
   * entrar por primera vez. La prueba `01-pwa` lo destapó.
   */
  const actualizacionPedida = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;

    let registro: ServiceWorkerRegistration | null = null;
    let recargando = false;

    const vigilar = (reg: ServiceWorkerRegistration) => {
      /* Ya había uno esperando de una visita anterior. */
      if (reg.waiting && navigator.serviceWorker.controller) setEsperando(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        nuevo?.addEventListener('statechange', () => {
          /* Con `controller` es una actualización; sin él es la primera
             instalación y no hay nada que actualizar. */
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
            setEsperando(nuevo);
          }
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

  if (!esperando) return null;

  return (
    <output
      /* En móvil, por encima de la barra inferior y de la zona segura; en
         escritorio, abajo en el centro. Solo aparece al haber una versión
         nueva: no cambia ninguna pantalla en reposo (I1). */
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] z-[300] flex justify-center px-4 md:bottom-6"
    >
      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-[#252525] py-2 pl-4 pr-2 shadow-xl">
        <span className="font-sans text-sm text-text-primary">Hay una versión nueva</span>
        <button
          type="button"
          onClick={() => {
            actualizacionPedida.current = true;
            esperando.postMessage({ tipo: 'activar' });
          }}
          className="cursor-pointer rounded-full bg-white px-3.5 py-1.5 font-sans text-xs font-semibold text-black transition-opacity hover:opacity-90"
        >
          Actualizar
        </button>
      </div>
    </output>
  );
}
