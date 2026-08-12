'use client';

import { alpha, colors } from '@praxis/commons';
import { type ReactNode, useState } from 'react';
import { SenalDeAceptarTodas } from './ProposalCard';

export interface GrupoDePropuestasProps {
  /**
   * Cuántas de las que hay dentro siguen sin decidirse.
   *
   * Lo cuenta quien nos monta a partir del estado guardado de cada propuesta,
   * no las tarjetas: cada una lleva el suyo por dentro y no lo publica. Sirve
   * para el encabezado y para decidir si «Aceptar todas» tiene sentido.
   */
  pendientes: number;
  children: ReactNode;
}

/**
 * Las propuestas de un turno, juntas y con una acción para todas.
 *
 * Antes salían sueltas, una tarjeta detrás de otra, indistinguibles del resto
 * del hilo: con cinco propuestas había que bajar aceptando de una en una sin
 * saber cuántas quedaban. Agrupadas se ven como lo que son —un bloque de cosas
 * que decidir— y se dice cuántas hay antes de empezar.
 *
 * **«Aceptar todas» no sustituye a aceptar una por una**, se suma. Cada tarjeta
 * conserva sus dos botones, porque lo normal es querer tres de las cinco.
 *
 * La señal viaja por contexto: ver `SenalDeAceptarTodas`.
 */
export function GrupoDePropuestas({ pendientes, children }: GrupoDePropuestasProps) {
  const [senal, setSenal] = useState(0);
  const [lanzada, setLanzada] = useState(false);

  return (
    <section
      aria-label={pendientes === 1 ? 'Propuesta del asistente' : 'Propuestas del asistente'}
      className="flex flex-col gap-3 rounded-2xl border p-3"
      style={{
        borderColor: alpha(colors.primary, 22),
        background: alpha(colors.primary, 4),
      }}
    >
      {/* Con una sola propuesta no hay nada que resumir ni nada que aceptar en
          bloque: el encabezado sería una línea diciendo «1 propuesta» encima de
          una tarjeta que ya se explica. */}
      {pendientes > 1 && (
        <header className="flex flex-wrap items-center gap-3 px-1">
          <span className="font-sans text-sm font-medium text-text-primary">
            {pendientes} propuestas
          </span>
          <span className="font-sans text-xs text-text-secondary">
            Acéptalas una a una o todas de golpe.
          </span>

          {lanzada ? (
            <span className="ml-auto font-sans text-xs text-text-secondary">Aceptando…</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setLanzada(true);
                setSenal((actual) => actual + 1);
              }}
              className="ml-auto cursor-pointer rounded-lg px-3 py-1.5 font-sans text-xs font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={{ background: colors.primary, color: colors.primaryForeground }}
            >
              Aceptar todas
            </button>
          )}
        </header>
      )}

      {/**
       * ⚠️ El proveedor envuelve a las tarjetas, no al revés.
       *
       * Cada una aplica su propia acción contra el servidor y con sus propios
       * permisos: «aceptar todas» solo pulsa sus botones a la vez. Si una falla
       * —permiso, columna borrada, tarea que ya no existe—, esa enseña su error
       * y las demás siguen su camino. No hay transacción ni la debe haber.
       */}
      <SenalDeAceptarTodas.Provider value={senal}>
        <div className="flex flex-col gap-3">{children}</div>
      </SenalDeAceptarTodas.Provider>
    </section>
  );
}
