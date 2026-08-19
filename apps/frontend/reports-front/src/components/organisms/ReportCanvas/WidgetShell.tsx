'use client';

import { CATALOGO, type Widget, tituloDe } from '@/lib/widgets';
import type { ReactNode } from 'react';

/**
 * El marco de un widget dentro del lienzo.
 *
 * Es el `ChartCard` de la pantalla anterior con dos añadidos —el tirador y el
 * botón de quitar— y una diferencia que importa: **dentro de la cuadrícula el
 * contenido desborda con barra propia**, no empuja. En una página apilada un
 * gráfico alto solo alarga la página; en una cuadrícula, empujar significa
 * taparle el sitio al de al lado. El alto lo decide quien redimensiona.
 *
 * ## ⚠️ `altoFijo={false}` para la lista apilada, y no es cosmético
 *
 * Con el alto en celdas y el desbordamiento oculto, una tarjeta que en escritorio
 * cabe de sobra **se corta en un teléfono**: la misma altura en filas, la mitad
 * de ancho, y el contenido reflowado al doble de alto. En la captura de un móvil
 * de 390 px, «Resumen» perdía dos de sus cuatro cifras —una arriba y otra
 * abajo— y quedaban a medio pintar, que no se lee como «hay que desplazar» sino
 * como que la tarjeta está rota.
 *
 * No se arregla con más filas: el alto que hace falta depende de cuánto reflowe
 * cada contenido. Se arregla quitando la restricción donde no hace falta, que es
 * justo donde no hay cuadrícula — por debajo de `lg` no se arrastra nada, así
 * que ninguna tarjeta puede quitarle el sitio a otra.
 *
 * ⚠️ La clase `.tirador` no es decorativa: es el selector que la cuadrícula tiene
 * configurado como `handle`. Si se renombra aquí y no allí, el lienzo deja de
 * moverse **sin ningún error**.
 */
export function WidgetShell({
  widget,
  children,
  onQuitar,
  movible,
  altoFijo = true,
}: {
  widget: Widget;
  children: ReactNode;
  onQuitar: () => void;
  movible: boolean;
  /** `false` deja que la tarjeta crezca con su contenido. Ver el bloque de arriba. */
  altoFijo?: boolean;
}) {
  const entrada = CATALOGO[widget.tipo];
  const titulo = tituloDe(widget);

  return (
    <section
      className={`flex flex-col rounded-2xl border border-border bg-surface ${
        altoFijo ? 'h-full overflow-hidden' : ''
      }`}
    >
      <header
        className={`tirador flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-4 ${
          movible ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate font-display text-lg text-text-primary" title={titulo}>
            {titulo}
          </h3>
          {/* La frase que dice qué mide va **siempre**, también en los
              generados: un gráfico sin ella se interpreta mal con muchísima
              seguridad, porque quien lo mira inventa la explicación que le
              encaja. Es la misma razón por la que era obligatoria en ChartCard. */}
          <p className="truncate font-sans text-xs text-text-disabled" title={subtitulo(widget)}>
            {subtitulo(widget)}
          </p>
        </div>

        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar «${titulo}» del lienzo`}
          title="Quitar del lienzo"
          /* Fuera del tirador para que pulsarlo no cuente como principio de un
             arrastre. La cuadrícula tiene un umbral de píxeles, pero depender de
             él para que un botón funcione es depender de que nadie tiemble. */
          onPointerDown={(evento) => evento.stopPropagation()}
          className="shrink-0 rounded-lg p-1.5 text-text-disabled transition-colors hover:bg-surface-elevated hover:text-error"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className={`px-5 pb-5 pt-1 ${altoFijo ? 'min-h-0 flex-1 overflow-auto' : ''}`}>
        {children ?? <Cargando />}
      </div>

      {!entrada && (
        <p className="px-5 pb-4 font-sans text-xs text-text-disabled">
          Este grafo ya no existe en el catálogo. Quítalo del lienzo.
        </p>
      )}
    </section>
  );
}

/**
 * La línea de debajo del título.
 *
 * En los fijos es la descripción del catálogo. En un `generado` es **la
 * parametrización en palabras**, y eso no es adorno: el asistente eligió una
 * métrica, un rango y un corte, y quien mira el gráfico tiene derecho a saber
 * cuál sin abrir nada. Un gráfico que no dice qué recorte enseña se lee como si
 * enseñara todo.
 */
function subtitulo(widget: Widget): string {
  if (!widget.grafico) return CATALOGO[widget.tipo]?.descripcion ?? '';

  const { metrica, dias, soloVencidas, topN } = widget.grafico;
  const piezas = [ETIQUETA_METRICA[metrica] ?? metrica];

  if (dias !== undefined) {
    /* En «paradas» el rango es el umbral de parón, no una ventana de tiempo.
       Decirlo igual que en las demás sería decir algo falso. */
    piezas.push(
      metrica === 'paradas_por_columna'
        ? `sin moverse desde hace ${dias} días`
        : `últimos ${dias} días`,
    );
  }
  if (soloVencidas) piezas.push('solo las vencidas');
  if (topN !== undefined) piezas.push(`las ${topN} mayores`);

  return piezas.join(' · ');
}

const ETIQUETA_METRICA: Record<string, string> = {
  tareas_por_columna: 'Tareas por columna',
  tareas_por_prioridad: 'Tareas por prioridad',
  tareas_por_etiqueta: 'Tareas por etiqueta',
  carga_por_persona: 'Carga por persona',
  cerradas_por_persona: 'Cerradas por persona',
  vencidas_por_persona: 'Vencidas por persona',
  paradas_por_columna: 'Tareas paradas, por columna',
  flujo_por_columna: 'Flujo acumulado por columna',
  cierres_por_semana: 'Cerradas por semana',
  creadas_por_semana: 'Creadas por semana',
};

/**
 * El hueco de un widget recién añadido.
 *
 * Su informe se pide en el siguiente renderizado del servidor. Se dice que está
 * cargando en vez de dejarlo en blanco: un marco vacío y uno que falla se ven
 * exactamente igual.
 */
function Cargando() {
  return (
    <div className="flex h-full min-h-24 items-center justify-center">
      <p className="font-sans text-sm text-text-disabled">Cargando el informe…</p>
    </div>
  );
}
