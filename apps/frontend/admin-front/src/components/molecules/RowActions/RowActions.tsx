'use client';

import { alpha, colors } from '@praxis/commons';
import { useEffect, useRef, useState } from 'react';

export interface RowAction {
  id: string;
  label: string;
  onSelect: () => void;
  /** `danger` para lo que quita acceso o retira algo. Tiñe el texto de rojo. */
  tone?: 'default' | 'danger';
  /**
   * Por qué no se puede hacer.
   *
   * Cuando viene, la opción se enseña apagada **y con el motivo escrito
   * debajo**, no en un `title` que hay que descubrir dejando el ratón quieto —y
   * que en una pantalla táctil no existe—. Es la mitad de la razón por la que
   * las acciones se movieron a un menú: en una fila no cabía explicar nada.
   */
  disabledReason?: string;
}

export interface RowActionsProps {
  actions: RowAction[];
  /** Sobre qué actúa este menú, para el lector de pantalla. */
  label: string;
}

/**
 * Las acciones de una fila, detrás de tres puntos.
 *
 * ## Por qué no son botones sueltos
 *
 * La tabla de cuentas llevaba tres botones de texto por fila —«Suspender»,
 * «Cambiar rol», «Plan IA»— y con veinticinco filas eso son **setenta y cinco
 * botones** en pantalla, uno de ellos destructivo y rojo. El resultado es que la
 * columna de acciones pesaba más que los datos, que es al revés de lo que hace
 * falta para decidir: primero se mira **a quién**, y solo después qué hacerle.
 *
 * Y había un segundo problema, más concreto: cuando una acción no se podía
 * hacer, el motivo vivía en un `title`. Eso obliga a dejar el ratón quieto sobre
 * un botón apagado para enterarte de por qué está apagado, y **en una pantalla
 * táctil no aparece nunca**. Aquí el motivo se lee.
 *
 * ## Se cierra al pulsar fuera y con Escape
 *
 * Las dos, no una: el clic fuera es lo que se hace con el ratón y Escape lo que
 * se hace con el teclado, y atender solo a una deja encerrado a quien use la
 * otra. Escape además devuelve el foco al disparador. Mismo criterio que
 * `EntityMenu` en `projects-front`.
 *
 * ⚠️ **El desplegable solo se ve porque `DataTable` no lleva `overflow-hidden`.**
 * Lo llevaba —para redondear las esquinas— y recortaba este menú en la última
 * fila. Si alguien se lo devuelve, esto deja de verse y parecerá que el menú no
 * abre.
 *
 * ⚠️ **Sin `role="menu"`.** Ese rol promete navegación con flechas y esto es una
 * lista de botones. Un rol mal cumplido estorba más que no declararlo; es la
 * misma decisión que ya tomaron `EntityMenu` y `ColumnMenu`.
 */
export function RowActions({ actions, label }: RowActionsProps) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;

    function alPulsarFuera(evento: PointerEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    }
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key !== 'Escape') return;
      setAbierto(false);
      disparador.current?.focus();
    }

    document.addEventListener('pointerdown', alPulsarFuera);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('pointerdown', alPulsarFuera);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  /* Un menú sin ninguna opción es un botón que se abre para no decir nada. */
  if (actions.length === 0) return null;

  return (
    <div ref={contenedor} className="relative">
      <button
        ref={disparador}
        type="button"
        onClick={() => setAbierto((estaba) => !estaba)}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-label={`Acciones sobre ${label}`}
        title="Acciones"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        style={abierto ? { background: colors.surface, color: colors.textPrimary } : undefined}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="12" cy="19" r="1.7" />
        </svg>
      </button>

      {abierto && (
        <div
          aria-label={`Acciones sobre ${label}`}
          className="absolute right-0 top-full z-30 mt-1 flex w-64 flex-col gap-0.5 rounded-xl p-1.5"
          style={{
            background: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            boxShadow: `0 12px 28px ${alpha(colors.overlay, 35)}`,
          }}
        >
          {actions.map((accion) => {
            const bloqueada = !!accion.disabledReason;
            const peligro = accion.tone === 'danger';

            return (
              <div key={accion.id}>
                <button
                  type="button"
                  disabled={bloqueada}
                  onClick={() => {
                    /* Se cierra **antes** de abrir el diálogo: si no, el menú se
                       queda detrás del modal y sigue ahí al cerrarlo. */
                    setAbierto(false);
                    accion.onSelect();
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left font-sans text-sm transition-colors enabled:hover:bg-surface disabled:cursor-not-allowed"
                  style={{
                    color: bloqueada
                      ? colors.textDisabled
                      : peligro
                        ? colors.error
                        : colors.textPrimary,
                  }}
                >
                  {accion.label}
                </button>

                {bloqueada && (
                  <p className="px-3 pb-1.5 font-sans text-xs text-text-disabled">
                    {accion.disabledReason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
