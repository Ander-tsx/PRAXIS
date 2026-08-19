'use client';

import type { ReactNode } from 'react';

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
 * ## ⚠️ Y el contenido sigue montado cuando está cerrado
 *
 * A propósito: es lo que permite que la transición tenga algo que revelar. La
 * consecuencia es que **lo de dentro no puede ser caro** —aquí son campos de
 * formulario y tarjetas, nada que pida datos— y que hay que quitarlo del orden
 * de tabulación, cosa que hace el `inert`. Sin él, tabular desde la barra
 * saltaba a campos invisibles.
 */
export function Desplegable({ abierto, children }: { abierto: boolean; children: ReactNode }) {
  return (
    <div
      className="grid motion-safe:transition-[grid-template-rows] motion-safe:duration-300 motion-safe:ease-out"
      style={{ gridTemplateRows: abierto ? '1fr' : '0fr' }}
    >
      <div
        className="overflow-hidden motion-safe:transition-opacity motion-safe:duration-200"
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
