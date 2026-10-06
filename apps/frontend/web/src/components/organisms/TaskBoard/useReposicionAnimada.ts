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
 *
 * ### 🔴 Por qué se mide contra el padre y no contra la ventana
 *
 * Medía `getBoundingClientRect()` a secas en cada render, y cualquier cosa que
 * moviera el tablero **entero** se leía como que cada tarjeta había cambiado de
 * sitio: abrir el panel de una tarea (el lienzo pierde ~450 px de ancho), que
 * llegue la tira del sprint por encima, un `router.refresh()` que reacomoda la
 * cabecera. Cada tarjeta salía volando desde donde estaba antes del cambio —un
 * zarandeo de toda la pantalla—. El filtro de «menos de 20 px» que hubo solo lo
 * escondía cuando el salto era pequeño.
 *
 * Ahora la posición que se compara es **relativa a su contenedor**, con el
 * desplazamiento de este sumado: si el tablero entero se mueve, contenedor y
 * tarjeta se mueven juntos y la diferencia es cero. Solo viaja lo que de verdad
 * cambió de sitio dentro de su lista. Si cambió **de lista** sin que nadie lo
 * sembrara —un movimiento que llega en vivo de otra persona—, no hay contra qué
 * compararlo y aparece en su sitio sin viajar.
 */
type Medida = { caja: DOMRect; padre: Element | null; x: number; y: number };

function medir(el: HTMLElement): Medida {
  const caja = el.getBoundingClientRect();
  const padre = el.parentElement;
  if (!padre) return { caja, padre: null, x: caja.left, y: caja.top };
  const marco = padre.getBoundingClientRect();
  return {
    caja,
    padre,
    x: caja.left - marco.left + padre.scrollLeft,
    y: caja.top - marco.top + padre.scrollTop,
  };
}

export function useReposicionAnimada() {
  const nodos = useRef(new Map<string, HTMLElement>());
  const previos = useRef(new Map<string, Medida>());
  const sembrados = useRef(new Map<string, DOMRect>());
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

  /* El «antes» sembrado es el rectángulo del fantasma, en coordenadas de
     ventana: ese viaje sí es absoluto, de donde la mano soltó a donde cae. */
  const sembrar = useCallback((id: string, caja: DOMRect | null) => {
    if (!caja) return;
    sembrados.current.set(id, caja);
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

      const ahora = medir(el);
      const antes = previos.current.get(id);
      previos.current.set(id, ahora);

      const semilla = sembrados.current.get(id);
      if (semilla) {
        sembrados.current.delete(id);
        /* Un elemento sembrado siempre se anima: viene del fantasma y ese salto
           es justo lo que hay que enseñar. */
        animar(el, semilla.left - ahora.caja.left, semilla.top - ahora.caja.top);
        continue;
      }

      if (!antes || saltarAnimacion) continue;
      /* Cambió de lista sin semilla: no hay un «antes» comparable. */
      if (antes.padre !== ahora.padre) continue;

      const dx = antes.x - ahora.x;
      const dy = antes.y - ahora.y;
      /* Medio píxel de redondeo no es un movimiento. */
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue;

      animar(el, dx, dy);
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

function animar(el: HTMLElement, dx: number, dy: number) {
  el.animate(
    [{ transform: `translate3d(${dx}px, ${dy}px, 0)` }, { transform: 'translate3d(0,0,0)' }],
    { duration: DURACION_DE_REPOSICION_MS, easing: CURVA, composite: 'replace' },
  );
}
