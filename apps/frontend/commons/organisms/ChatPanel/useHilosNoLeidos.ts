'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Qué hilos tienen respuestas que esta persona no ha visto.
 *
 * ## 🔴 El fallo que arregla
 *
 * Reportado por un usuario: llega una respuesta escrita **dentro de un hilo**,
 * el aviso suena y hasta se puede pulsar, pero lleva a la conversación — y allí
 * no hay nada nuevo que ver. El mensaje existe, está dentro de un hilo colgado
 * de algún mensaje de más arriba, y **nada en la pantalla dice cuál**. Había que
 * ir abriendo hilos a ciegas.
 *
 * ## ⚠️ Por qué se guarda en el navegador y no en el servidor
 *
 * Porque el servidor no sabe contestarlo. Lo no leído se guarda en
 * `ChatChannelState.lastReadAt`: **un instante por canal y persona**, y su
 * propio esquema explica por qué no es por mensaje —mil mensajes por seis
 * lectores son seis mil filas para pintar un número—. De ahí no sale «hasta
 * dónde has leído **dentro de este hilo**».
 *
 * Y hay algo peor que la falta de dato: abrir la conversación **mueve**
 * `lastReadAt` por delante de las respuestas del hilo (`disparadorDeLectura` ya
 * cuenta las del hilo a propósito, para que no se quedaran sin acuse nunca). O
 * sea que aunque el servidor sirviera la marca, entrar al chat la borraría
 * justo antes de poder enseñarla — que es exactamente el síntoma reportado.
 *
 * Saberlo de verdad pide una tabla nueva y su migración, y eso es del equipo de
 * backend. Mientras tanto esto se apoya en el único dato que ya viaja con cada
 * mensaje raíz: `_count.replies`. Se recuerda cuántas respuestas tenía la última
 * vez que se miró el hilo, y si ahora hay más, hay novedad.
 *
 * ⚠️ **Las dos consecuencias de que viva en `localStorage`**, y hay que
 * contarlas antes de que alguien las descubra como fallos:
 *
 * 1. Es **por navegador**, no por cuenta. Leer el hilo en el portátil no lo
 *    apaga en el móvil. Un `lastReadAt` por hilo en el servidor sí lo haría.
 * 2. Un hilo que se ve por primera vez se siembra como **visto**. La
 *    alternativa —darlo por nuevo— encendería de golpe todos los hilos que ya
 *    existían la primera vez que alguien abre la conversación, y un aviso que
 *    aparece cien veces el primer día enseña a ignorarlo.
 *
 * ⚠️ Y como el contador es el de respuestas vivas, **borrar una respuesta baja
 * el número**: un hilo con una respuesta nueva y otra borrada a la vez empata y
 * no se enciende. Es el precio de contar en vez de fechar; el caso es raro y el
 * fallo cae del lado bueno —se calla— en vez de mentir.
 */

/** Prefijo de la clave. El canal va detrás: un almacén por conversación. */
const CLAVE = 'praxis_hilos_vistos';

type Vistos = Record<string, number>;

function claveDe(channelId: string): string {
  return `${CLAVE}:${channelId}`;
}

/**
 * ⚠️ Todo acceso va envuelto: `localStorage` **lanza** en modo privado de
 * algunos navegadores y cuando la cuota está llena. Aquí eso no puede tumbar la
 * conversación entera — es una ayuda visual, no un dato del que dependa nada.
 */
function leer(channelId: string): Vistos {
  try {
    const crudo = window.localStorage.getItem(claveDe(channelId));
    if (!crudo) return {};
    const valor: unknown = JSON.parse(crudo);
    if (typeof valor !== 'object' || valor === null) return {};
    return valor as Vistos;
  } catch {
    return {};
  }
}

function escribir(channelId: string, vistos: Vistos): void {
  try {
    window.localStorage.setItem(claveDe(channelId), JSON.stringify(vistos));
  } catch {
    /* Sin sitio o sin permiso: se pierde el recuerdo, no la conversación. */
  }
}

export interface HilosNoLeidos {
  /** Si este hilo tiene respuestas que no se han mirado. */
  tieneNovedad: (rootId: string, respuestas: number) => boolean;
  /** Este hilo queda al día en este número de respuestas. */
  marcarVisto: (rootId: string, respuestas: number) => void;
  /** Da por vistos los hilos que aún no se conocían. Ver la nota 2 de arriba. */
  sembrar: (conteos: Map<string, number>) => void;
  /**
   * Si ya se ha leído el almacén.
   *
   * ⚠️ **Hasta que sea `true` no se pinta ni un punto, y es a propósito.**
   * `localStorage` no existe en el servidor: leerlo durante el primer render
   * daría un HTML distinto del que sirvió el servidor y React se quejaría de la
   * hidratación. Así el primer fotograma no tiene puntos y aparecen justo
   * después.
   */
  listo: boolean;
}

export function useHilosNoLeidos(channelId: string): HilosNoLeidos {
  /* `null` = todavía no se ha leído del disco. Ver `listo`. */
  const [vistos, setVistos] = useState<Vistos | null>(null);

  useEffect(() => {
    setVistos(leer(channelId));
  }, [channelId]);

  const marcarVisto = useCallback(
    (rootId: string, respuestas: number) => {
      setVistos((previos) => {
        const base = previos ?? {};
        if (base[rootId] === respuestas) return previos;
        const siguiente = { ...base, [rootId]: respuestas };
        escribir(channelId, siguiente);
        return siguiente;
      });
    },
    [channelId],
  );

  const sembrar = useCallback(
    (conteos: Map<string, number>) => {
      setVistos((previos) => {
        /* Sin almacén cargado no se siembra: se daría por visto sobre un `{}`
           que no es el de esta persona, y se perdería todo lo recordado. */
        if (previos === null) return previos;

        let cambio = false;
        const siguiente = { ...previos };
        for (const [rootId, respuestas] of conteos) {
          /* Solo los que no se conocían. Volver a escribir uno conocido sería
             darlo por leído sin que nadie lo haya abierto — o sea, apagar el
             punto justo por cargar la conversación, que es el fallo original. */
          if (!(rootId in siguiente)) {
            siguiente[rootId] = respuestas;
            cambio = true;
          }
        }
        if (!cambio) return previos;
        escribir(channelId, siguiente);
        return siguiente;
      });
    },
    [channelId],
  );

  const tieneNovedad = useCallback(
    (rootId: string, respuestas: number) => {
      if (vistos === null) return false;
      const visto = vistos[rootId];
      /* Desconocido = recién sembrado o a punto de serlo: no se enciende. */
      if (visto === undefined) return false;
      return respuestas > visto;
    },
    [vistos],
  );

  return { tieneNovedad, marcarVisto, sembrar, listo: vistos !== null };
}
