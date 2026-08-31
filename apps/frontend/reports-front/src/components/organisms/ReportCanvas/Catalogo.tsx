'use client';

import { MiniGrafo } from '@/components/molecules/MiniGrafo';
import { CATALOGO, TIPOS_WIDGET, type TipoWidget } from '@/lib/widgets';
import { PRAX_NAME, alpha, colors } from '@praxis/commons';

/**
 * Lo que se puede añadir al lienzo, **reconocible por su forma**.
 *
 * ## Por qué cada tarjeta enseña un dibujo
 *
 * Esto era una lista de ocho tarjetas de texto: un título y una frase de dos
 * líneas cada una. Elegir «flujo acumulado» obligaba a leerse la frase y
 * traducirla mentalmente a una imagen, y quien no supiera qué es un diagrama de
 * flujo acumulado seguía sin saberlo después de leerla. Una forma se reconoce
 * antes de leerse.
 *
 * La frase se queda —hace falta para saber **qué mide**, y esa es la regla de
 * `ChartCard`: un gráfico sin ella se interpreta mal con muchísima seguridad—
 * pero deja de ser lo primero.
 *
 * ## Un panel en la página, no un diálogo
 *
 * Elegir un grafo es una decisión que se toma **mirando lo que ya tienes
 * puesto**, y un modal tapa exactamente eso. Además evita la trampa de los
 * diálogos del navegador, que bloquean todo lo demás.
 *
 * ## Los que ya están puestos siguen a la vista
 *
 * Marcados y sin poder pulsarse. Esconderlos haría que el catálogo cambiara de
 * forma cada vez que se añade algo, y quien busca «flujo acumulado» y no lo
 * encuentra concluye que no existe, no que ya lo tiene.
 */
export function Catalogo({
  yaPuestos,
  onElegir,
  onGenerar,
}: {
  yaPuestos: Set<TipoWidget>;
  onElegir: (tipo: TipoWidget) => void;
  /** Lleva al chat con la frase de ejemplo puesta. */
  onGenerar: () => void;
}) {
  /* `generado` no se ofrece como una entrada más: no es un grafo, es un grafo
   **a parametrizar**, y para eso está la pestaña de al lado. */
  const disponibles = TIPOS_WIDGET.filter((tipo) => tipo !== 'generado');

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {disponibles.map((tipo) => {
          const entrada = CATALOGO[tipo];
          const puesto = yaPuestos.has(tipo);

          return (
            <li key={tipo}>
              <button
                type="button"
                disabled={puesto}
                onClick={() => onElegir(tipo)}
                className="group flex h-full w-full items-start gap-3 rounded-xl border border-border-subtle p-3 text-left transition-all enabled:hover:-translate-y-0.5 enabled:hover:border-border-strong enabled:hover:bg-surface-elevated disabled:cursor-default disabled:opacity-45"
              >
                {/* La miniatura, en un cuadro con fondo: sin él se confunde con
                    un icono de interfaz en vez de con una muestra del grafo. */}
                <span
                  className="flex shrink-0 items-center justify-center rounded-lg p-1.5"
                  style={{ background: alpha(colors.primary, 8) }}
                >
                  <MiniGrafo vista={entrada.vista} />
                </span>

                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 font-sans text-sm font-semibold text-text-primary">
                    {entrada.titulo}
                    {puesto && (
                      <span
                        aria-hidden="true"
                        className="font-normal"
                        style={{ color: colors.success }}
                      >
                        ✓
                      </span>
                    )}
                  </span>
                  <span className="font-sans text-xs leading-relaxed text-white">
                    {puesto ? 'Ya está en tu lienzo.' : entrada.descripcion}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/**
       * PRAX, al pie y no como una tarjeta más de la rejilla.
       *
       * ⚠️ **Es un camino distinto, no un grafo distinto.** Puesto entre los
       * ocho, se leía como el noveno del catálogo — y no lo es: los ocho se
       * añaden de un clic, este abre una conversación y devuelve una propuesta
       * que hay que aceptar. Mezclarlos prometía un gesto que no es el que pasa.
       */}
      <button
        type="button"
        onClick={onGenerar}
        className="flex items-center gap-2 self-start rounded-lg px-2 py-1 font-sans text-xs text-white transition-colors hover:text-text-primary"
      >
        <span aria-hidden="true">✦</span>
        ¿No ves el que buscas? Descríbeselo a {PRAX_NAME} en tus palabras →
      </button>
    </div>
  );
}
