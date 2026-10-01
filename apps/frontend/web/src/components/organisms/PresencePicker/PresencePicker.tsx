'use client';

import { setPresenceAction } from '@/app/(privado)/main/profile/actions';
import { PRESENCES, type Presence, presenceOf } from '@praxis/commons';
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
  const [abierto, setAbierto] = useState(false);

  async function elegir(siguiente: Presence) {
    if (siguiente === presencia) return;

    const anterior = presencia;
    setPresencia(siguiente);
    setGuardando(true);
    const confirmada = await setPresenceAction(siguiente);
    setGuardando(false);
    setPresencia(confirmada ?? anterior);
  }

  const actual = presenceOf(presencia);

  return (
    /* Plegado: **una sola fila** con tu estado de ahora. Se abre para cambiarlo y
       se vuelve a plegar al elegir — es un ajuste que se toca de pasada, no una
       lista que deba estar siempre a la vista. */
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/5"
      >
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: actual.color }}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-sans text-[10px] uppercase tracking-wider text-text-secondary">
            Tu estado
          </span>
          <span className="font-sans text-[13px] font-semibold text-white">{actual.etiqueta}</span>
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200 ${abierto ? '-rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out motion-reduce:transition-none ${
          abierto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <fieldset
          className="flex min-h-0 flex-col gap-0.5 overflow-hidden"
          disabled={guardando || !abierto}
          aria-busy={guardando}
        >
          <legend className="sr-only">Tu estado</legend>
          {PRESENCES.filter((clave) => clave !== 'AWAY').map((clave) => {
            const descripcion = presenceOf(clave);
            const puesta = clave === presencia;

            return (
              <button
                key={clave}
                type="button"
                onClick={() => {
                  void elegir(clave);
                  setAbierto(false);
                }}
                aria-pressed={puesta}
                title={descripcion.ayuda}
                className={`ml-3 flex min-w-0 cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  puesta ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: descripcion.color }}
                />
                <span
                  className={`flex-1 font-sans text-[13px] ${puesta ? 'font-semibold text-white' : 'font-medium text-text-secondary'}`}
                >
                  {descripcion.etiqueta}
                </span>
                {puesta && (
                  <svg
                    className="h-4 w-4 shrink-0 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.25}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </fieldset>
      </div>
    </div>
  );
}
