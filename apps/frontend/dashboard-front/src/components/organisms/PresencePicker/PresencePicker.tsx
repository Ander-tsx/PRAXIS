'use client';

import { setPresenceAction } from '@/app/(private)/profile/actions';
import { PRESENCES, type Presence, alpha, colors, presenceOf } from '@praxis/commons';
import { useState } from 'react';

export interface PresencePickerProps {
  /** La presencia guardada. Lo que no se reconozca cae a «Disponible». */
  inicial: string;
}

/**
 * Elegir tu estado, con los seis explicados.
 *
 * ## Por qué aquí sí, si la esfera de la barra lateral ya lo cambia
 *
 * `PresenceSwitcher` (la esfera del avatar, en `commons`) está para cambiarlo
 * **en marcha**, en dos clics y desde cualquier pantalla; por eso su menú es
 * estrecho y en la versión plegada solo son colores. Esta es la pantalla donde
 * se *decide*: cada opción trae la frase que dice cuándo ponerla, que es lo que
 * no cabe en un menú flotante de la barra.
 *
 * ## Se pinta lo que confirma el servidor
 *
 * El estado cambia al instante —esperar a la red para pintar un punto de color
 * se nota— pero se corrige con lo que devuelve el action: si el guardado falla,
 * vuelve a decir la verdad en vez de la intención. Es la misma regla que
 * `PresenceSwitcher`, y la de todo el repositorio: se confirma contra el
 * `data`, no contra el status.
 *
 * `setPresenceAction` revalida el layout, así que el mismo clic actualiza la
 * esfera de la barra lateral y el retrato de la portada.
 */
export function PresencePicker({ inicial }: PresencePickerProps) {
  const [presencia, setPresencia] = useState(inicial);
  const [guardando, setGuardando] = useState(false);

  async function elegir(siguiente: Presence) {
    if (siguiente === presencia) return;

    const anterior = presencia;
    setPresencia(siguiente);
    setGuardando(true);
    const confirmada = await setPresenceAction(siguiente);
    setGuardando(false);
    setPresencia(confirmada ?? anterior);
  }

  return (
    /* `fieldset` deshabilitado mientras guarda: bloquea las seis de una vez sin
       repetir `disabled` en cada botón. */
    <fieldset className="flex flex-wrap gap-3" disabled={guardando} aria-busy={guardando}>
      <legend className="sr-only">Tu estado</legend>

      {PRESENCES.filter((clave) => clave !== 'AWAY').map((clave) => {
        const descripcion = presenceOf(clave);
        const puesta = clave === presencia;

        return (
          <button
            key={clave}
            type="button"
            onClick={() => void elegir(clave)}
            aria-pressed={puesta}
            className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none ${puesta ? 'shadow-lg border-transparent' : 'border-white/10 hover:border-white/20'}`}
            style={{
              background: puesta ? alpha(descripcion.color, 15) : 'rgba(255, 255, 255, 0.02)',
              boxShadow: puesta ? `0 0 0 1px ${descripcion.color}` : 'none',
            }}
          >
            <span
              aria-hidden="true"
              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: descripcion.color }}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-sans text-sm font-medium text-text-primary">
                {descripcion.etiqueta}
              </span>
              <span className="font-sans text-xs text-white">{descripcion.ayuda}</span>
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
