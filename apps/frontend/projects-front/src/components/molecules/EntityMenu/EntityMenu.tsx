'use client';

import { alpha, colors } from '@praxis/commons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EntityPanel, type EntityPanelProps } from './EntityPanel';

export type EntityMenuProps = Omit<EntityPanelProps, 'alCerrar'>;

/**
 * `EntityPanel` detrás de tres puntos, en un desplegable.
 *
 * Es la forma que toma en la cabecera del tablero, al lado de «Ampliar»: el
 * disparador copia el tratamiento de ese botón —texto secundario, fondo al
 * pasar por encima, misma altura— para que se lean como lo que son, los
 * controles del tablero.
 *
 * Quien no puede ni renombrar ni borrar no ve nada: tres puntos que abren un
 * menú vacío son ruido.
 */
export function EntityMenu(props: EntityMenuProps) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);

  /* `useCallback` porque el panel lo lleva en las dependencias de un efecto:
     una closure nueva por render lo dispararía en cada uno. */
  const cerrar = useCallback(() => setAbierto(false), []);

  /**
   * Se cierra al pulsar fuera y con Escape.
   *
   * Las dos, no una: el clic fuera es lo que se hace con el ratón y Escape lo
   * que se hace con el teclado; atender solo a una deja encerrado a quien use
   * la otra. Escape además devuelve el foco al disparador.
   */
  useEffect(() => {
    if (!abierto) return;

    function alPulsarFuera(evento: PointerEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    }
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key !== 'Escape') return;
      /* Se para aquí: en un tablero expandido, Escape también sale de pantalla
         completa, y una sola tecla no debería deshacer dos cosas a la vez. */
      evento.stopPropagation();
      setAbierto(false);
      disparador.current?.focus();
    }

    document.addEventListener('pointerdown', alPulsarFuera);
    document.addEventListener('keydown', alTeclear, true);
    return () => {
      document.removeEventListener('pointerdown', alPulsarFuera);
      document.removeEventListener('keydown', alTeclear, true);
    };
  }, [abierto]);

  if (!props.canEdit && !props.canDelete) return null;

  return (
    <div ref={contenedor} className="relative">
      <button
        ref={disparador}
        type="button"
        onClick={() => setAbierto((estaba) => !estaba)}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-label={`Opciones del ${props.entidad} ${props.nombre}`}
        title="Opciones"
        className="flex shrink-0 cursor-pointer items-center rounded-lg px-1.5 py-1 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        style={abierto ? { color: colors.textPrimary } : undefined}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="12" cy="19" r="1.7" />
        </svg>
      </button>

      {abierto && (
        <div
          /* Sin `role="menu"`: ese rol promete navegación con flechas, y el
             panel se convierte en un formulario según la vista. Un rol mal
             cumplido estorba más que no declararlo. Mismo criterio que
             `ColumnMenu`. */
          aria-label={`Opciones del ${props.entidad} ${props.nombre}`}
          className="absolute right-0 top-full z-30 mt-1 w-60 rounded-xl p-1.5"
          style={{
            background: colors.surfaceElevated,
            boxShadow: `0 12px 32px ${alpha(colors.overlay, 55)}, 0 0 0 1px ${alpha(colors.border, 70)}`,
          }}
        >
          <EntityPanel {...props} alCerrar={cerrar} />
        </div>
      )}
    </div>
  );
}
