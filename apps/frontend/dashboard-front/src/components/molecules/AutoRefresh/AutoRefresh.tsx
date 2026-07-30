'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export interface AutoRefreshProps {
  /** Cada cuántos segundos se vuelve a pedir la página. */
  seconds: number;
}

/**
 * Vuelve a pedir la página cada tanto, para que los avisos aparezcan solos.
 *
 * No hay tiempo real: los avisos nacen de acciones de otras personas y no hay
 * canal abierto —ni WebSocket ni SSE— por el que enterarse. Reconsultar es lo
 * que permite la arquitectura de hoy, y para una bandeja llega de sobra.
 *
 * `router.refresh()` y no `location.reload()`: vuelve a renderizar el Server
 * Component **conservando el estado del cliente**, así que no se pierde lo que
 * haya escrito ni salta el scroll. La página es un Server Component; sin este
 * empujón se quedaría con los datos del primer render hasta navegar.
 *
 * ⚠️ **Se pausa con la pestaña oculta.** Sin eso, veinte pestañas olvidadas
 * seguirían pidiendo cada minuto para nadie. Al volver refresca en el acto, que
 * además es justo cuando la persona quiere ver lo nuevo.
 */
export function AutoRefresh({ seconds }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const period = seconds * 1000;
    let timer: ReturnType<typeof setInterval> | undefined;

    function stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    }
    function start() {
      stop();
      timer = setInterval(() => router.refresh(), period);
    }

    function onVisibility() {
      if (document.hidden) {
        stop();
        return;
      }
      router.refresh();
      start();
    }

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, seconds]);

  return null;
}
