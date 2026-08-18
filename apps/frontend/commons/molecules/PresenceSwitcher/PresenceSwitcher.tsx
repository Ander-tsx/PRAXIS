'use client';

import { useEffect, useRef, useState } from 'react';
import { PRESENCES, type Presence, presenciaDe } from '../../api/presence';
import { useLiveEvent } from '../../realtime';
import { colors } from '../../tokens';

export interface PresenceSwitcherProps {
  /** La presencia actual. Un valor que no se reconozca cae a «Disponible». */
  valor: string | null | undefined;
  /**
   * Guarda la presencia nueva. La pone la zona, que es quien tiene el server
   * action; devuelve el valor confirmado o `null` si no se pudo.
   */
  onCambiar: (presencia: Presence) => Promise<string | null>;
  /**
   * El menú, en una columna de esferas y sin texto.
   *
   * Para la barra lateral plegada, que mide 72 px: ahí un menú de 224 px con
   * el nombre y la explicación de cada estado se sale de la pantalla o tapa
   * media aplicación. Los seis colores caben en una tira, y el nombre sigue
   * estando en el `title` y en el `aria-label` de cada uno.
   */
  compacto?: boolean;
}

/**
 * Cambiar de presencia pulsando **la propia esfera** del avatar.
 *
 * ## El punto es el botón
 *
 * Hubo una fila con el nombre del estado bajo la ficha de usuario, y sobraba:
 * el punto de color ya está ahí, ya dice cuál es tu estado y es donde se
 * intenta pulsar. Repetirlo debajo con su etiqueta ocupaba una línea entera de
 * la barra para decir lo que la esfera ya decía.
 *
 * Se dibuja **encima del avatar**, en su esquina, en el sitio exacto donde
 * `Avatar` pintaría el punto pasivo — por eso en la barra el avatar va sin
 * `presence`: lo sustituye este, que además se puede pulsar.
 *
 * ## Se pinta lo que confirma el servidor
 *
 * El estado se enseña al instante —el desplegable se cierra en el mismo clic—
 * pero se corrige con lo que devuelve el servidor: si el guardado falla, el
 * punto vuelve a decir la verdad en vez de la intención.
 */
export function PresenceSwitcher({ valor, onCambiar, compacto = false }: PresenceSwitcherProps) {
  const [abierto, setAbierto] = useState(false);
  const [presencia, setPresencia] = useState(valor ?? 'AWAY');
  const [guardando, setGuardando] = useState(false);
  const cajaRef = useRef<HTMLDivElement>(null);

  /* La verdad vive en el servidor: si la página se repinta con otra presencia
     —otra pestaña la cambió— esta se pone al día. */
  useEffect(() => setPresencia(valor ?? 'AWAY'), [valor]);

  /**
   * Y sin esperar a que la página se repinte.
   *
   * ⚠️ Depender solo del render del servidor dejaba tu propia esfera **muerta**:
   * cambiabas de estado en otra pestaña y aquí seguía el color viejo hasta
   * recargar. El servidor ya anuncia el cambio a quien le incumbe; esto es
   * escucharlo.
   *
   * `mio` lo resuelve el servidor porque este componente **no conoce tu id**:
   * recibe el valor de tu presencia, no quién eres. Ver `PresenceEvent`.
   */
  useLiveEvent('presencia', (evento) => {
    if (!evento.mio) return;
    setPresencia(evento.presencia);
  });

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

  /**
   * ⚠️ **Aquí vivía la mitad del sistema de presencia, y estaba mal por
   * construcción.**
   *
   * Había temporizadores de inactividad —cinco minutos sin ratón y te ponía
   * «Ausente»—, un manejador de `pagehide` para avisar al cerrar la pestaña y,
   * para que ese último aviso sobreviviera al cierre, **se reemplazaba
   * `window.fetch` por una versión con `keepalive` y se restauraba con un
   * `setTimeout`**. Un global del navegador, parcheado y devuelto a los 10 ms,
   * mientras cualquier otra parte de la aplicación podía estar usándolo.
   *
   * Y ni así funcionaba. El problema de fondo es que **el cliente no puede
   * informar de su propia desaparición**: si se corta la red, se agota la
   * batería o el navegador se cae, `pagehide` no se dispara nunca y la cuenta se
   * queda «Disponible» para siempre. Usuarios fantasma.
   *
   * Ahora lo gobierna el servidor. Tener el flujo de eventos abierto **es** estar
   * conectado, y una caída se detecta porque el gateway no consigue escribir el
   * siguiente latido —en menos de treinta segundos, sin que el navegador
   * coopere—. Este componente se ha quedado con lo único que de verdad le tocaba:
   * **elegir** un estado. Detalle en `gateway/src/presence/presence.service.ts`.
   */

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
      {/* El mismo tamaño y el mismo sitio que el punto pasivo de `Avatar`, para
          que al cambiar de una pantalla a otra no se mueva ni un píxel. */}
      <button
        type="button"
        onClick={() => setAbierto((previo) => !previo)}
        disabled={guardando}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Tu estado: ${actual.etiqueta}. Pulsa para cambiarlo`}
        title={`${actual.etiqueta} — pulsa para cambiar tu estado`}
        className="block h-3 w-3 cursor-pointer rounded-full ring-2 ring-surface transition-transform hover:scale-125 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: actual.color }}
      />

      {abierto && (
        /* Hacia **arriba**: el conmutador vive en el pie de la barra, así que
           un desplegable hacia abajo se saldría de la pantalla. */
        <div
          role="menu"
          className={`absolute bottom-full z-30 mb-2 overflow-hidden rounded-xl border shadow-lg ${
            compacto ? 'left-1/2 flex -translate-x-1/2 flex-col gap-1 p-1.5' : 'left-0 w-56'
          }`}
          style={{ background: colors.surfaceElevated, borderColor: colors.border }}
        >
          {/* `AWAY` no se ofrece: **no es un estado que se elija**, es lo que el
              servidor enseña cuando no tienes ninguna conexión abierta. Ponerlo
              en la lista invitaría a marcarse ausente estando delante, que es
              justo la confusión que el modelo viejo tenía. */}
          {PRESENCES.filter((clave) => clave !== 'AWAY').map((clave) => {
            const descripcion = presenciaDe(clave);
            const puesta = clave === presencia;

            if (compacto) {
              return (
                <button
                  key={clave}
                  type="button"
                  role="menuitem"
                  onClick={() => void elegir(clave)}
                  aria-label={descripcion.etiqueta}
                  title={descripcion.etiqueta}
                  className="flex cursor-pointer items-center justify-center rounded-full p-1 transition-transform hover:scale-110"
                  /* La elegida lleva un anillo: sin texto, es lo único que
                     distingue cuál está puesta. */
                  style={
                    puesta
                      ? { boxShadow: `0 0 0 2px ${colors.primary}`, background: colors.surface }
                      : undefined
                  }
                >
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 rounded-full"
                    style={{ background: descripcion.color }}
                  />
                </button>
              );
            }

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
