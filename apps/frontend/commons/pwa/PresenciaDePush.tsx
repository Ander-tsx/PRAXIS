'use client';

import { useEffect } from 'react';
import { createApiClient } from '../api/client';

/** Cada cuánto se renueva «Praxis está a la vista». El servidor lo da por caducado a los 50 s. */
const LATIDO_MS = 30_000;

/**
 * Le dice al servidor si Praxis está **a la vista** (`POST /me/push/visible`),
 * para que no mande un push de chat a quien ya lo está viendo.
 *
 * Solo lo sabe el navegador: la presencia del SSE no sirve, porque con la app en
 * segundo plano el socket sigue abierto en el servidor y la persona figuraba
 * «conectada» sin ver nada (ver `PushService.CLAVE_VISIBLE`). Mientras la
 * ventana está visible se renueva cada 30 s; al ocultarse o cerrarse se retira.
 * Solo se activa con el permiso de notificaciones concedido: sin él no hay push
 * que evitar y no se gasta ni una petición.
 */
export function PresenciaDePush() {
  useEffect(() => {
    if (!('Notification' in window)) return;
    const api = createApiClient({ gatewayPath: '/api/gateway' });
    const avisar = (visible: boolean) => {
      if (Notification.permission !== 'granted') return;
      api.post('/me/push/visible', { visible }, { keepalive: true }).catch(() => undefined);
    };

    let temporizador: number | undefined;
    const alCambiar = () => {
      window.clearInterval(temporizador);
      if (document.visibilityState === 'visible') {
        avisar(true);
        temporizador = window.setInterval(() => avisar(true), LATIDO_MS);
      } else {
        avisar(false);
      }
    };
    const alSalir = () => avisar(false);

    alCambiar();
    document.addEventListener('visibilitychange', alCambiar);
    window.addEventListener('pagehide', alSalir);
    return () => {
      window.clearInterval(temporizador);
      document.removeEventListener('visibilitychange', alCambiar);
      window.removeEventListener('pagehide', alSalir);
    };
  }, []);

  return null;
}
