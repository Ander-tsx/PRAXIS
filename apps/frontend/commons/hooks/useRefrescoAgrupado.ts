'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

/**
 * Ventana de agrupación. Un refresco cada tanto, como mucho.
 *
 * 800 ms: por debajo de lo que se percibe como «no ha reaccionado» y por encima
 * de lo que tarda una ráfaga de mensajes de chat en llegar entera.
 */
export const ESPERA_DE_AGRUPACION_MS = 800;

/**
 * ⚠️ **El estado va en el módulo, no en el componente, y es a propósito.**
 *
 * Lo que se está racionando es la cola de acciones del App Router, que es **una
 * sola para toda la aplicación**. Con el estado dentro del hook, dos
 * componentes que pidan refresco a la vez —los avisos en vivo y la bandeja, sin
 * ir más lejos— agruparían cada uno por su cuenta y saldrían dos refrescos.
 * Agrupar de verdad exige contarlos donde se cuentan todos.
 *
 * Cada zona es una app Next independiente con su propio bundle, así que esto es
 * de zona, que es exactamente el alcance de su router.
 */
let hayPendiente = false;
let temporizador: number | null = null;
let ultimoRefresco = 0;
let refrescarRuta: (() => void) | null = null;
let cuantosEscuchan = 0;

function ejecutarRefresco() {
  hayPendiente = false;
  ultimoRefresco = Date.now();
  refrescarRuta?.();
}

/**
 * `router.refresh()`, pero agrupado y sin gastarse en una pestaña que nadie mira.
 *
 * ## Por qué no vale llamar a `router.refresh()` a pelo
 *
 * Cada refresco entra en la **misma cola** que las Server Actions —una sola para
 * toda la aplicación, en `app-router-instance.js` de Next— y ocupa la transición
 * global de React mientras el servidor vuelve a renderizar la ruta. Cuanto más
 * rato está esa cola ocupada, más probable es que una navegación caiga encima de
 * una acción en vuelo y la marque `discarded`, que es el camino por el que la
 * promesa de la cola no se resuelve nunca y el botón se queda girando sobre un
 * cambio ya guardado. El detalle está en [`useAccion`].
 *
 * Los avisos llegan por un flujo SSE y **por ahí viaja también el chat**, que no
 * tiene ritmo: una conversación viva son varios eventos por minuto, en todas las
 * pestañas abiertas y en todas las zonas. Uno a uno, eso deja la cola del router
 * ocupada casi todo el rato.
 *
 * ## Qué hace
 *
 * - **El primero sale ya.** Un evento aislado —que es el caso normal— se
 *   refresca sin retraso apreciable.
 * - **Los de la ráfaga se funden en uno.** Diez mensajes seguidos son un
 *   refresco, no diez: el resultado en pantalla es idéntico, porque cada
 *   refresco trae el estado completo y no un incremento.
 * - **Con la pestaña oculta no se refresca**, y se guarda que había algo
 *   pendiente para hacerlo al volver — que además es cuando interesa verlo.
 *
 * Devuelve la función que pide el refresco; llamarla de más es gratis.
 */
export function useRefrescoAgrupado(esperaMs: number = ESPERA_DE_AGRUPACION_MS): () => void {
  const router = useRouter();

  useEffect(() => {
    cuantosEscuchan += 1;
    /* Cualquier router de la zona sirve: `refresh()` despacha a la misma cola.
       El último en montarse gana, y da igual cuál sea. */
    refrescarRuta = () => router.refresh();

    function alCambiarVisibilidad() {
      if (!document.hidden && hayPendiente) ejecutarRefresco();
    }

    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);

      cuantosEscuchan -= 1;
      if (cuantosEscuchan > 0) return;

      /* No queda nadie: se desarma lo que hubiera en vuelo para no refrescar
         una ruta que ya no está montada. */
      if (temporizador !== null) {
        window.clearTimeout(temporizador);
        temporizador = null;
      }
      hayPendiente = false;
      refrescarRuta = null;
    };
  }, [router]);

  return useCallback(() => {
    hayPendiente = true;

    /* Oculta no se programa nada: al volver, `visibilitychange` lo resuelve. */
    if (document.hidden) return;
    /* Ya hay uno en camino; este se suma a él y no programa otro. */
    if (temporizador !== null) return;

    const espera = Math.max(0, esperaMs - (Date.now() - ultimoRefresco));

    temporizador = window.setTimeout(() => {
      temporizador = null;
      if (hayPendiente) ejecutarRefresco();
    }, espera);
  }, [esperaMs]);
}
