'use client';

import { CATALOGO, TIPOS_WIDGET, type TipoWidget } from '@/lib/widgets';

/**
 * Lo que se puede añadir al lienzo.
 *
 * Un panel que se despliega en la propia página y no un diálogo modal: elegir un
 * gráfico es una decisión que se toma **mirando lo que ya tienes puesto**, y un
 * modal tapa exactamente eso. Además evita la trampa de los diálogos del
 * navegador, que bloquean todo lo demás.
 *
 * Los que ya están puestos siguen a la vista, marcados y sin poder pulsarse.
 * Esconderlos haría que el catálogo cambiara de forma cada vez que se añade
 * algo, y quien busca «flujo acumulado» y no lo encuentra concluye que no
 * existe, no que ya lo tiene.
 */
export function Catalogo({
  yaPuestos,
  onElegir,
  onGenerar,
}: {
  yaPuestos: Set<TipoWidget>;
  onElegir: (tipo: TipoWidget) => void;
  onGenerar: () => void;
}) {
  /* `generado` no se ofrece aquí: no se elige de una lista, se pide hablando y
     llega como propuesta. Se enseña como la última tarjeta, que lleva al chat. */
  const disponibles = TIPOS_WIDGET.filter((tipo) => tipo !== 'generado');

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg text-text-primary">Añade lo que quieras ver</h3>
        <p className="font-sans text-sm text-text-secondary">
          Se colocan al final del lienzo. Después se mueven arrastrando por la cabecera y se
          redimensionan por la esquina.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {disponibles.map((tipo) => {
          const entrada = CATALOGO[tipo];
          const puesto = yaPuestos.has(tipo);

          return (
            <li key={tipo}>
              <button
                type="button"
                disabled={puesto}
                onClick={() => onElegir(tipo)}
                className="flex h-full w-full flex-col gap-1 rounded-xl border border-border-subtle p-3 text-left transition-colors enabled:hover:border-border-strong enabled:hover:bg-surface-elevated disabled:cursor-default disabled:opacity-50"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-sans text-sm text-text-primary">{entrada.titulo}</span>
                  {puesto && (
                    <span className="shrink-0 font-sans text-xs text-text-disabled">
                      ya está puesto
                    </span>
                  )}
                </span>
                <span className="font-sans text-xs leading-relaxed text-text-secondary">
                  {entrada.descripcion}
                </span>
              </button>
            </li>
          );
        })}

        <li>
          <button
            type="button"
            onClick={onGenerar}
            className="flex h-full w-full flex-col gap-1 rounded-xl border border-dashed border-border p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-elevated"
          >
            <span className="font-sans text-sm text-text-primary">Uno a medida</span>
            <span className="font-sans text-xs leading-relaxed text-text-secondary">
              Pídeselo al asistente en tus palabras. Te lo propone y lo añades si te encaja.
            </span>
          </button>
        </li>
      </ul>
    </div>
  );
}
