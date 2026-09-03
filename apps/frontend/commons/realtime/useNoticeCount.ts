'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createApiClient } from '../api/client';
import type { NotificationPage } from '../api/domain';
import { useLiveEvent, useReconnection } from './LiveSource';

/**
 * Cuánto se espera antes de reconciliar con el servidor.
 *
 * Misma ventana y mismo motivo que `useMessageCount`: bajar exige preguntar, y
 * marcar varias como leídas de seguido dispararía una petición por fila.
 */
const ESPERA_DE_RECONCILIACION_MS = 2500;

/**
 * Aviso de que alguien ha marcado avisos como leídos, para que la insignia
 * vuelva a preguntar.
 *
 * ## Por qué un evento del navegador y no un contexto
 *
 * Quien marca es la lista de la pestaña, que es **hermana** de la insignia, no
 * descendiente: las dos cuelgan del armazón. Subir el estado a un proveedor para
 * un número que cambia dos veces al día era montar una tubería para un goteo.
 *
 * El evento no lleva el número nuevo a propósito: el hook vuelve a preguntar,
 * que es la única forma de acertar cuando hay dos pestañas abiertas.
 */
export const AVISOS_LEIDOS_EVENT = 'praxis:avisos-leidos';

export function avisarDeAvisosLeidos(): void {
  window.dispatchEvent(new Event(AVISOS_LEIDOS_EVENT));
}

/**
 * Los avisos de bandeja sin leer, para la pestaña «Bandeja de entrada».
 *
 * ## Por qué es un gemelo de `useMessageCount` y no el mismo hook
 *
 * Cuentan cosas distintas de sitios distintos —esto sale de
 * `/me/notifications`, aquello de `/me/chats`— y sobre todo **suben con eventos
 * distintos**: aquí `aviso`, allí `chat.mensaje`. Un hook parametrizado tendría
 * que recibir el tipo de evento, el endpoint y cómo sumar, que es más andamio
 * que las quince líneas que ahorra.
 *
 * ## Las dos direcciones tampoco son simétricas
 *
 * **Subir es exacto**: llega un `aviso`, es uno más. Se aplica al instante.
 *
 * **Bajar no se puede calcular aquí**, porque marcar leído pasa en la pestaña
 * de la bandeja y no manda nada por el flujo. Se pregunta al servidor con la
 * misma petición mínima que hace el servidor al pintar —`unreadOnly` con
 * `limit=1`, que solo trae el contador— y se agrupa.
 *
 * ⚠️ **`unreadOnly`, no `unread`.** El DTO declara ese nombre exacto y el
 * gateway va con `forbidNonWhitelisted: true`: un campo que no reconoce es un
 * **400**, no un filtro ignorado. La pestaña de la bandeja mandaba `unread=true`
 * y por eso decía «Nada nuevo por aquí» con la bandeja llena.
 */
export function useNoticeCount(inicial: number, gatewayPath: string): number {
  const [total, setTotal] = useState(inicial);

  /* Lo que sirvió el servidor manda cuando cambia: pasa al navegar, y ahí es
     más fresco que lo acumulado aquí. */
  useEffect(() => setTotal(inicial), [inicial]);

  const temporizador = useRef<number | null>(null);

  const reconciliar = useCallback(() => {
    if (temporizador.current !== null) return;

    temporizador.current = window.setTimeout(() => {
      temporizador.current = null;
      createApiClient({ gatewayPath })
        .get<NotificationPage>('/me/notifications?unreadOnly=true&limit=1')
        .then((inbox) => setTotal(inbox.unread))
        /* Un fallo deja el número que había: una insignia algo vieja informa
           mejor que una que desaparece. */
        .catch(() => undefined);
    }, ESPERA_DE_RECONCILIACION_MS);
  }, [gatewayPath]);

  useEffect(
    () => () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    },
    [],
  );

  useLiveEvent('aviso', () => setTotal((previo) => previo + 1));

  /* Bajar: lo dispara la lista al marcar leído. Ver `AVISOS_LEIDOS_EVENT`. */
  useEffect(() => {
    const alLeer = () => reconciliar();
    window.addEventListener(AVISOS_LEIDOS_EVENT, alLeer);
    return () => window.removeEventListener(AVISOS_LEIDOS_EVENT, alLeer);
  }, [reconciliar]);

  /* Tras un corte, lo acumulado aquí puede haberse quedado atrás. */
  useReconnection(reconciliar);

  return total;
}
