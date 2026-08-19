'use client';

import { type ReactNode, useEffect, useState } from 'react';

/**
 * Cuánto dura la apertura, en milisegundos.
 *
 * ⚠️ **Tiene que coincidir con la clase `duration-300` de abajo.** Son dos sitios
 * porque Tailwind necesita la clase literal para generarla y el temporizador
 * necesita el número; si divergen, el recorte se suelta antes de tiempo —y se ve
 * el contenido salirse del panel a medio abrir— o tarde, y el desplegable de
 * dentro sigue cortado un instante.
 */
const DURACION_MS = 300;

/**
 * Un bloque que se abre y se cierra **sin dar un salto**.
 *
 * ## El problema que resuelve
 *
 * Los tres paneles de esta pantalla —filtros, catálogo y constructor— aparecían
 * y desaparecían de golpe, y cada uno mide entre 100 y 300 px. El lienzo entero
 * pegaba un brinco hacia abajo, y quien estaba mirando un gráfico lo perdía de
 * vista sin haber tocado nada. Un cambio de sitio instantáneo no se percibe como
 * «se ha abierto algo»: se percibe como que la página se ha movido sola.
 *
 * ## Por qué `grid-template-rows` y no `height` ni `max-height`
 *
 * 🔴 **`height: auto` no se puede animar.** Es la razón de que esto exista como
 * componente en vez de como dos clases sueltas.
 *
 * - `max-height` con un valor grande «funciona» y miente: la transición corre
 *   sobre los píxeles que **no** tiene el contenido, así que un panel de 100 px
 *   con `max-height: 500px` tarda un quinto del tiempo en abrir y el resto en
 *   nada. Al cerrar es peor —empieza lento y termina de golpe— y el ritmo cambia
 *   con lo que haya dentro, que aquí depende de cuántos filtros se pinten.
 * - Medir el alto con JS y animarlo obliga a un `ResizeObserver` y a un render
 *   por cada cambio de contenido.
 *
 * `grid-template-rows` de `0fr` a `1fr` **sí** interpola, es CSS puro y sale
 * exacto sea cual sea el alto. El hijo necesita `overflow: hidden` o su
 * contenido se sale mientras la fila todavía no ha crecido.
 *
 * ## ⚠️ `motion-safe` y no una animación sin condición
 *
 * Quien tenga puesto «reducir movimiento» en su sistema recibe el cambio
 * instantáneo, que es lo que pidió. Es la misma prudencia que ya aplica el
 * `motion-safe:scroll-smooth` del armazón.
 *
 * ## 🔴 El recorte se suelta en cuanto termina de abrir
 *
 * Y es obligatorio, no una mejora. `overflow: hidden` es lo que hace posible la
 * animación —sin él, el contenido se sale mientras la fila todavía no ha
 * crecido— y es también lo que **se come cualquier cosa que salga del panel**:
 * la lista de un `Select`, el calendario de `SelectorDeFecha`. Los dos se pintan
 * con `position: absolute` y un `z-50` de sobra, así que no era un problema de
 * capas: era el panel recortándolos. En la pantalla se veía como un desplegable
 * que se abre y **no aparece**, que es de los fallos más desconcertantes que hay.
 *
 * Así que el recorte solo dura lo que dura el movimiento: mientras abre, mientras
 * cierra, y siempre que está cerrado. Abierto y quieto, `overflow: visible`.
 *
 * ⚠️ **Por temporizador y no por `transitionend`.** Con «reducir movimiento»
 * puesto no hay transición y ese evento **no se dispara nunca**: el panel se
 * quedaría recortado para siempre justo para quien menos puede permitírselo.
 *
 * ## ⚠️ Y el contenido sigue montado cuando está cerrado
 *
 * A propósito: es lo que permite que la transición tenga algo que revelar. La
 * consecuencia es que **lo de dentro no puede ser caro** —aquí son campos de
 * formulario y tarjetas, nada que pida datos— y que hay que quitarlo del orden
 * de tabulación, cosa que hace el `inert`. Sin él, tabular desde la barra
 * saltaba a campos invisibles.
 */
export function Desplegable({ abierto, children }: { abierto: boolean; children: ReactNode }) {
  const [recorta, setRecorta] = useState(true);

  useEffect(() => {
    /* Al cerrar, se recorta ya: lo que sobresalga tiene que desaparecer con el
       panel y no quedarse flotando sobre el lienzo. */
    if (!abierto) {
      setRecorta(true);
      return;
    }
    const id = window.setTimeout(() => setRecorta(false), DURACION_MS);
    return () => window.clearTimeout(id);
  }, [abierto]);

  return (
    <div
      className="grid motion-safe:transition-[grid-template-rows] motion-safe:duration-300 motion-safe:ease-out"
      style={{ gridTemplateRows: abierto ? '1fr' : '0fr' }}
    >
      <div
        className={`motion-safe:transition-opacity motion-safe:duration-200 ${
          recorta ? 'overflow-hidden' : 'overflow-visible'
        }`}
        style={{ opacity: abierto ? 1 : 0 }}
        /* `inert` saca del foco y del lector de pantalla todo lo de dentro
           mientras está cerrado. React 19 lo pasa como atributo booleano. */
        inert={!abierto}
      >
        {children}
      </div>
    </div>
  );
}
