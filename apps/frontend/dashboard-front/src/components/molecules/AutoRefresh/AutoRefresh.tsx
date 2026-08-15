'use client';

import { useRefrescoAgrupado } from '@praxis/commons';
import { useEffect } from 'react';

export interface AutoRefreshProps {
  /** Cada cuántos segundos se vuelve a pedir la página. */
  seconds: number;
}

/**
 * Vuelve a pedir la página cada tanto, por si el tiempo real se ha caído.
 *
 * ## Ya no es la vía principal, y eso cambia lo que debe hacer
 *
 * Cuando se escribió esto no había canal abierto y reconsultar era la única
 * forma de enterarse. Ahora `AvisosEnVivo` mantiene un flujo SSE desde el
 * armazón —una conexión por persona, viva en todas las pantallas— y refresca la
 * ruta con cada aviso que llega. La bandeja se pone al día **en el momento**, no
 * al minuto.
 *
 * Lo que queda aquí es la red de seguridad: si Redis o el flujo se caen, el
 * `EventSource` reconecta solo pero puede perderse lo publicado mientras estaba
 * fuera. Un repaso de vez en cuando lo recupera.
 *
 * ⚠️ **Por eso el intervalo es largo y no corto.** Cada refresco entra en la
 * misma cola global que las Server Actions, y tenerla ocupada es lo que destapa
 * el fallo del botón que gira para siempre —explicado en
 * `commons/hooks/useAccion`—. Un sondeo frecuente sobre algo que ya llega solo
 * es coste puro: paga la carrera y no aporta nada.
 *
 * Va por [`useRefrescoAgrupado`], como todo lo demás, para que un repaso que
 * caiga justo encima de un aviso del flujo sea **un** refresco y no dos.
 *
 * ⚠️ **Se pausa con la pestaña oculta.** Sin eso, veinte pestañas olvidadas
 * seguirían pidiendo para nadie. Al volver refresca en el acto, que además es
 * justo cuando la persona quiere ver lo nuevo.
 */
export function AutoRefresh({ seconds }: AutoRefreshProps) {
  const pedirRefresco = useRefrescoAgrupado();

  useEffect(() => {
    const periodo = seconds * 1000;
    let temporizador: ReturnType<typeof setInterval> | undefined;

    function parar() {
      if (temporizador) clearInterval(temporizador);
      temporizador = undefined;
    }

    function arrancar() {
      parar();
      temporizador = setInterval(pedirRefresco, periodo);
    }

    function alCambiarVisibilidad() {
      if (document.hidden) {
        parar();
        return;
      }
      pedirRefresco();
      arrancar();
    }

    if (!document.hidden) arrancar();
    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    return () => {
      parar();
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, [pedirRefresco, seconds]);

  return null;
}
