'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker, que solo sirve la pantalla «Sin conexión»
 * (ver `src/service-worker/sw.js`).
 *
 * ## Solo en producción
 *
 * En `next dev` los recursos cambian a cada guardado y no llevan hash; un SW
 * en medio no aporta nada y estorba al refresco en caliente.
 *
 * ## Sin avisos de actualización
 *
 * El SW nuevo se activa solo (`skipWaiting`) y ya no guarda nada para servirlo
 * con red, así que no hay versión vieja que pueda quedarse sirviendo ni motivo
 * para recargar la página. Antes se vigilaba la versión, se recargaba al
 * cambiar de mando y se comprobaba al volver a primer plano; todo eso era la
 * contrapartida de las cachés y se fue con ellas.
 */
export function RegistroDelServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      /* URL fija: la versión va dentro del script. Ver `src/app/sw.js/route.ts`. */
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => undefined);
  }, []);

  return null;
}
