'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import {
  type AssistantModelo,
  type ClaseDePaso,
  MODELOS_DE_PRAX,
  type PasoDePensamiento,
  formatearTokens,
} from '../../api/assistant';

/**
 * Lo que PRAX hace mientras piensa, y lo que hizo cuando ya ha respondido.
 *
 * ## Dos estados, un componente
 *
 * - **En curso**: una línea de tiempo abierta que crece según llegan los pasos
 *   del servidor —«Leyendo el estado de «Web»», «Es una pregunta», «Buscando
 *   tareas · 12 tareas»—, con el paso actual brillando y un reloj.
 * - **Terminado**: se compacta en una línea —«Pensó 4,2 s · 5 pasos»— que se
 *   despliega al pulsarla. Así el hilo se lee como conversación y quien quiera
 *   ver cómo llegó a la respuesta lo tiene a un clic.
 *
 * Se compacta **cuando empieza a escribir**, no al final del turno: a partir de
 * ahí lo que importa es el texto, y una lista de pasos abierta encima lo
 * empujaría hacia abajo mientras se lee.
 *
 * ## Nada aquí es decorado
 *
 * Esto sustituye a `FlujoDePensamiento`, que con el turno por SSE ya pintaba
 * pasos reales pero solo las consultas, y desaparecía sin dejar rastro al
 * llegar el texto. Cada paso es algo que ocurrió en el servidor (ver
 * `services/assistant/src/assistant/pensamiento.ts`) y se guarda con la
 * respuesta: al releer la conversación se despliega exactamente lo mismo.
 */
export function Pensamiento({
  pasos,
  enCurso,
  ms,
  tokens,
  modelo,
  alAvanzar,
}: {
  pasos: PasoDePensamiento[];
  /** Pensando todavía: abierto, con el paso actual vivo y el reloj corriendo. */
  enCurso: boolean;
  /** Lo que duró, al terminar. */
  ms?: number | undefined;
  /** Lo que costó la respuesta, para la línea compacta. */
  tokens?: number | undefined;
  /** Qué modelo respondió. Solo se nombra si no es el de siempre. */
  modelo?: AssistantModelo | undefined;
  /** Cada paso nuevo, para que el hilo lo siga hacia abajo. */
  alAvanzar?: (() => void) | undefined;
}) {
  const [abierto, setAbierto] = useState(enCurso);
  const cuerpoId = useId();
  const segundos = useSegundos(enCurso);

  /* Al dejar de pensar se pliega solo; lo que abra la persona después es suyo. */
  useEffect(() => {
    setAbierto(enCurso);
  }, [enCurso]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: el aviso es por cada paso nuevo
  useEffect(() => {
    if (enCurso) alAvanzar?.();
  }, [pasos.length]);

  const visibles = pasos.filter((p) => p.clase !== 'redaccion' || enCurso);
  if (!enCurso && visibles.length === 0) return null;

  /* Sin `ms` todavía —se compactó al empezar a escribir y el turno sigue—, vale
     el reloj congelado en el momento en que dejó de pensar. */
  const duracion = enCurso || ms === undefined ? segundos : ms / 1000;
  const resumen = [
    `${visibles.length} ${visibles.length === 1 ? 'paso' : 'pasos'}`,
    tokens ? `${formatearTokens(tokens)} tokens` : null,
    modelo && modelo !== 'gemini' ? MODELOS_DE_PRAX.find((m) => m.id === modelo)?.nombre : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col" aria-live={enCurso ? 'polite' : undefined}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={enCurso}
        aria-expanded={abierto}
        aria-controls={cuerpoId}
        className="group flex items-center gap-2 self-start rounded-md py-0.5 font-sans text-[13px] text-text-secondary transition-colors enabled:hover:text-text-primary disabled:cursor-default"
      >
        <Nucleo vivo={enCurso} />
        {enCurso ? (
          <span className="prax-brillo font-medium">Pensando</span>
        ) : (
          <span className="font-medium">
            Pensó {duracion < 10 ? duracion.toFixed(1).replace('.', ',') : Math.round(duracion)} s
          </span>
        )}
        <span className="font-mono text-[11px] tabular-nums text-text-disabled">
          {enCurso ? `${Math.floor(segundos)} s` : resumen}
        </span>
        {!enCurso && (
          <svg
            className={[
              'h-3 w-3 text-text-disabled transition-transform duration-300',
              abierto ? 'rotate-180' : '',
            ].join(' ')}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>

      {/* Plegar con `grid-template-rows` 0fr↔1fr: anima la altura real sin
          medirla, y el contenido no se desmonta —desplegar es instantáneo. */}
      <div
        id={cuerpoId}
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
        style={{ gridTemplateRows: abierto ? '1fr' : '0fr', opacity: abierto ? 1 : 0 }}
      >
        <ol className="min-h-0 overflow-hidden">
          {visibles.map((p, indice) => {
            const actual = enCurso && indice === visibles.length - 1;
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: los pasos solo se añaden al final
                key={indice}
                className="prax-paso-entra relative flex gap-2.5 pt-2 pl-[3px]"
              >
                {/* El hilo que une cada paso con el siguiente. */}
                {indice < visibles.length - 1 && (
                  <span
                    className="absolute top-[26px] bottom-[-8px] left-[11px] w-px bg-border"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={[
                    'relative z-10 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md transition-colors duration-300',
                    actual
                      ? 'bg-primary/15 text-primary'
                      : 'bg-surface-elevated text-text-secondary',
                  ].join(' ')}
                >
                  <IconoDePaso clase={p.clase} />
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 font-sans text-[13px] leading-[18px]">
                  <span
                    className={actual ? 'prax-brillo text-text-primary' : 'text-text-secondary'}
                  >
                    {p.texto}
                  </span>
                  {p.detalle && (
                    <span className="font-mono text-[11px] text-text-disabled">{p.detalle}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** Los segundos desde que empezó a pensar, con décimas, mientras piensa. */
function useSegundos(enCurso: boolean): number {
  const inicio = useRef<number | null>(null);
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    /* Al terminar no se pone a cero: se queda en lo que duró. */
    if (!enCurso) {
      inicio.current = null;
      return;
    }
    inicio.current = performance.now();
    const intervalo = setInterval(() => {
      if (inicio.current !== null) setSegundos((performance.now() - inicio.current) / 1000);
    }, 250);
    return () => clearInterval(intervalo);
  }, [enCurso]);
  return segundos;
}

/**
 * El punto de la cabecera. Pensando, un núcleo que late con un halo que se
 * expande; terminado, un punto quieto.
 */
function Nucleo({ vivo }: { vivo: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5 items-center justify-center" aria-hidden="true">
      {vivo && <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" />}
      <span
        className={[
          'relative h-1.5 w-1.5 rounded-full transition-colors duration-500',
          vivo ? 'bg-primary' : 'bg-text-disabled',
        ].join(' ')}
      />
    </span>
  );
}

function IconoDePaso({ clase }: { clase: ClaseDePaso }) {
  const trazos: Record<ClaseDePaso, ReactNode> = {
    /* Heroicons v2 «book-open». */
    contexto: (
      <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    ),
    /* Una bifurcación: la petición toma un camino. */
    ruta: <path d="M6 3v6a6 6 0 0 0 6 6h6M18 15l-3-3m3 3-3 3M6 21V9" />,
    /* Heroicons v2 «paper-clip». */
    lectura: (
      <path d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
    ),
    /* Heroicons v2 «magnifying-glass». */
    consulta: (
      <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    ),
    /* Heroicons v2 «pencil». */
    redaccion: (
      <path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
    ),
    /* Heroicons v2 «sparkles», reducido. */
    propuesta: (
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    ),
    /* Heroicons v2 «arrow-uturn-left». */
    correccion: <path d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />,
    /* Heroicons v2 «clock». */
    espera: <path d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  };
  return (
    <svg
      className="h-3 w-3"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {trazos[clase]}
    </svg>
  );
}
