'use client';

import { useEffect, useRef, useState } from 'react';
import { PRESENCES, type Presence, presenciaDe } from '../../api/presence';
import { colors } from '../../tokens';

export interface PresenceSwitcherProps {
  /** La presencia actual. Un valor que no se reconozca cae a «Disponible». */
  valor: string | null | undefined;
  /**
   * Guarda la presencia nueva. La pone la zona, que es quien tiene el server
   * action; devuelve el valor confirmado o `null` si no se pudo.
   */
  onCambiar: (presencia: Presence) => Promise<string | null>;
  /** Plegada, solo cabe el punto. */
  plegada?: boolean;
}

/**
 * Cambiar de presencia **sin salir de donde estés**.
 *
 * Vive en el pie de la barra lateral, donde estaba «Cerrar sesión». El cambio
 * de estado es lo que se toca varias veces al día —entras a una reunión, sales
 * a comer— y mandarlo a una pantalla aparte era pedir dos navegaciones por
 * cada vez. Cerrar sesión, que se usa una vez, es lo que se fue a la pantalla
 * de cuenta.
 *
 * ## Se pinta lo que confirma el servidor
 *
 * El estado se enseña al instante —el desplegable se cierra en el mismo clic—
 * pero se corrige con lo que devuelve el servidor: si el guardado falla, el
 * punto vuelve a decir la verdad en vez de la intención.
 */
export function PresenceSwitcher({ valor, onCambiar, plegada = false }: PresenceSwitcherProps) {
  const [abierto, setAbierto] = useState(false);
  const [presencia, setPresencia] = useState(valor ?? 'AVAILABLE');
  const [guardando, setGuardando] = useState(false);
  const cajaRef = useRef<HTMLDivElement>(null);

  /* La verdad vive en el servidor: si la página se repinta con otra presencia
     —otra pestaña la cambió— esta se pone al día. */
  useEffect(() => setPresencia(valor ?? 'AVAILABLE'), [valor]);

  /* Cerrar al pulsar fuera. En captura, para que el mismo clic que abre no
     llegue después al documento y lo cierre en el acto. */
  useEffect(() => {
    if (!abierto) return;
    function alPulsarFuera(evento: MouseEvent) {
      if (cajaRef.current?.contains(evento.target as Node)) return;
      setAbierto(false);
    }
    document.addEventListener('click', alPulsarFuera, true);
    return () => document.removeEventListener('click', alPulsarFuera, true);
  }, [abierto]);

  const actual = presenciaDe(presencia);

  async function elegir(siguiente: Presence) {
    setAbierto(false);
    if (siguiente === presencia) return;

    const anterior = presencia;
    setPresencia(siguiente);
    setGuardando(true);
    const confirmada = await onCambiar(siguiente);
    setGuardando(false);
    /* Se corrige con lo que confirma el servidor, no con lo que se pidió. */
    setPresencia(confirmada ?? anterior);
  }

  return (
    <div ref={cajaRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((previo) => !previo)}
        disabled={guardando}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title={plegada ? `Estado: ${actual.etiqueta}` : 'Cambiar tu estado'}
        className={`flex w-full cursor-pointer items-center gap-2 rounded-lg font-sans text-xs text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60 ${
          plegada ? 'justify-center p-2' : 'px-2 py-2'
        }`}
      >
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: actual.color }}
        />
        {!plegada && <span className="min-w-0 flex-1 truncate text-left">{actual.etiqueta}</span>}
        {!plegada && (
          <svg
            className={`h-3 w-3 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {abierto && (
        /* Hacia **arriba**: el conmutador vive en el pie de la barra, así que
           un desplegable hacia abajo se saldría de la pantalla. */
        <div
          role="menu"
          className="absolute bottom-full left-0 z-30 mb-2 w-56 overflow-hidden rounded-xl border shadow-lg"
          style={{ background: colors.surfaceElevated, borderColor: colors.border }}
        >
          {PRESENCES.map((clave) => {
            const descripcion = presenciaDe(clave);
            const puesta = clave === presencia;
            return (
              <button
                key={clave}
                type="button"
                role="menuitem"
                onClick={() => void elegir(clave)}
                className="flex w-full cursor-pointer items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface"
                style={puesta ? { background: colors.surface } : undefined}
              >
                <span
                  aria-hidden="true"
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: descripcion.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-xs font-medium text-text-primary">
                    {descripcion.etiqueta}
                  </span>
                  <span className="block font-sans text-[11px] text-text-secondary">
                    {descripcion.ayuda}
                  </span>
                </span>
                {puesta && (
                  <svg
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    style={{ color: colors.primary }}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
