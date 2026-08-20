'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { CURVA, DURACION_DE_REPOSICION_MS, movimientoReducido } from './arrastre';

/**
 * Que todo lo que cambia de sitio **viaje** hasta su sitio nuevo.
 *
 * Es la técnica de siempre —medir antes, medir después, animar la diferencia—
 * pero conviene decir qué problema resuelve aquí, porque no es cosmético: en un
 * tablero, cuando una tarjeta se va de una columna las de abajo suben. Si suben
 * de golpe, el ojo pierde de vista cuál era cuál y hay que releer la columna
 * entera. Recorriendo esos píxeles en 220 ms, la lista se lee como el mismo
 * objeto que se ha reacomodado.
 *
 * ### Las dos entradas
 *
 * - `registrar(id, el)` lo llama cada tarjeta y cada columna desde su `ref`.
 * - `sembrar(id, caja)` mete a mano el «antes» de un elemento **que todavía no
 *   existía**. Es lo que convierte el final del arrastre en un aterrizaje: la
 *   tarjeta se monta en su columna nueva, pero su rectángulo anterior es el del
 *   fantasma, así que la animación la trae desde donde la mano la soltó.
 *
 * ### Por qué hace falta `invalidar()`
 *
 * Los rectángulos son de ventana, así que **desplazar una lista los mueve
 * todos** — y desplazar no repinta nada en React, con lo que la medida guardada
 * se queda vieja sin que nos enteremos. La siguiente reposición leería un salto
 * enorme y animaría media pantalla de tarjetas que no se han movido.
 *
 * Se arregla por la vía barata: quien desplaza avisa, y esa pasada se mide sin
 * animar. Se pierde una animación de vez en cuando; la alternativa —seguirle la
 * pista al `scrollTop` de cada antepasado de cada tarjeta— cuesta mucho más de
 * lo que arregla.
 */
export function useReposicionAnimada() {
  const nodos = useRef(new Map<string, HTMLElement>());
  const previos = useRef(new Map<string, DOMRect>());
  const sembrados = useRef(new Set<string>());
  const sucio = useRef(false);

  /**
   * ⚠️ **Al soltar el nodo NO se borra su medida anterior.**
   *
   * Parece lo natural y rompe la animación entera. Quien nos llama pasa un
   * `ref` en línea —`ref={(el) => registrar(id, el)}`—, así que React lo
   * considera distinto en cada render y hace dos llamadas seguidas: primero con
   * `null` y después con el mismo nodo. Borrando aquí, el «antes» desaparecía en
   * cada repintado y no quedaba nunca contra qué comparar: ninguna tarjeta se
   * movía jamás.
   *
   * Lo que sí desaparece de verdad lo limpia el barrido del final del efecto,
   * que sabe distinguir «se ha vuelto a registrar» de «ya no está».
   */
  const registrar = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodos.current.set(id, el);
    else nodos.current.delete(id);
  }, []);

  const sembrar = useCallback((id: string, caja: DOMRect | null) => {
    if (!caja) return;
    previos.current.set(id, caja);
    sembrados.current.add(id);
  }, []);

  const invalidar = useCallback(() => {
    sucio.current = true;
  }, []);

  useLayoutEffect(() => {
    const saltarAnimacion = sucio.current || movimientoReducido();
    sucio.current = false;

    const vistos = new Set<string>();

    for (const [id, el] of nodos.current) {
      if (!el.isConnected) continue;
      vistos.add(id);

      const ahora = el.getBoundingClientRect();
      const antes = previos.current.get(id);
      previos.current.set(id, ahora);

      if (!antes) continue;

      const dx = antes.left - ahora.left;
      const dy = antes.top - ahora.top;
      const sembrado = sembrados.current.delete(id);

      /* Un elemento sembrado siempre se anima: viene del fantasma y ese salto es
         justo lo que hay que enseñar. El resto se salta si la pasada está sucia
         por un desplazamiento. */
      if (!sembrado && saltarAnimacion) continue;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      el.animate(
        [{ transform: `translate3d(${dx}px, ${dy}px, 0)` }, { transform: 'translate3d(0,0,0)' }],
        { duration: DURACION_DE_REPOSICION_MS, easing: CURVA, composite: 'replace' },
      );
    }

    /* Lo que ya no está en pantalla no debe conservar su medida: si vuelve —al
       cambiar de tablero, al deshacer un filtro— tiene que entrar como nuevo y
       no viajar desde el sitio que ocupaba hace diez minutos. */
    for (const id of previos.current.keys()) {
      if (!vistos.has(id)) previos.current.delete(id);
    }
  });

  return { registrar, sembrar, invalidar };
}
