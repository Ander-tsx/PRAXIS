'use client';

import { type ReactNode, useEffect } from 'react';
import { alpha, colors } from '../../tokens';

/**
 * Cada cuánto avanza el paso visible.
 *
 * No mide nada: ver más abajo por qué el reloj es de adorno y las fases no.
 */
interface Paso {
  texto: string;
  icono: ReactNode;
}

interface FlujoDePensamientoProps {
  /**
   * Lo que el servidor va contando que hace (F3): una línea por consulta.
   * Delante va siempre «Pensando», que es lo que ocurre antes de la primera.
   */
  pasos: string[];
  /** Se llama al llegar cada paso, para que el hilo lo siga hacia abajo. */
  alAvanzar?: () => void;
}

/**
 * Lo que está haciendo PRAX mientras se le espera.
 *
 * ## Ya no es un reloj (F3 de docs/PLAN-PRAX-SEMIAGENTICO.md)
 *
 * Esto enseñaba tres fases fijas —«Leyendo el estado», «Consultando al modelo»,
 * «Revisando propuesta»— y pasaba de una a otra con un temporizador, porque el
 * turno llegaba entero y no había forma de saber en qué andaba. Con el turno en
 * vivo, cada línea es algo que **ha ocurrido de verdad**: el servidor manda un
 * paso por cada consulta que hace el modelo («Buscando tareas en «Web»…»).
 *
 * El último paso se queda encendido hasta que llega la respuesta. Los anteriores
 * pasan a hechos.
 */
export function FlujoDePensamiento({ pasos, alAvanzar }: FlujoDePensamientoProps) {
  const lista: Paso[] = [
    { texto: 'Pensando', icono: <IconoModelo /> },
    ...pasos.map((texto) => ({ texto, icono: <IconoDatos /> })),
  ];
  const activo = lista.length - 1;

  // biome-ignore lint/correctness/useExhaustiveDependencies: el aviso es por cada paso nuevo
  useEffect(() => {
    alAvanzar?.();
  }, [activo]);

  return (
    <div className="flex flex-col" aria-label="El asistente está trabajando">
      {lista.map((paso, indice) => {
        const hecho = indice < activo;
        const enCurso = indice === activo;
        /* Los que aún no han llegado no se pintan: la lista crece conforme
           avanza, en vez de enseñar de entrada tres pasos apagados que ya
           adelantan lo que va a hacer. */
        if (!hecho && !enCurso) return null;

        return (
          <div key={`${indice}-${paso.texto}`} className="flex flex-col">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors"
                style={{
                  background: enCurso ? alpha(colors.primary, 15) : 'transparent',
                  color: enCurso ? colors.primary : colors.textDisabled,
                }}
              >
                {hecho ? <IconoHecho /> : paso.icono}
              </span>
              <span
                /* El paso en curso destaca; los ya hechos bajan a secundario. El
                   ternario devolvía lo mismo en las dos ramas desde el rediseño
                   monocromo, así que los pasos pesaban todos igual y no se veía
                   por cuál iba. El icono sí lo distinguía —arriba, `primary`
                   frente a `textDisabled`—, lo que hacía la incoherencia más
                   visible, no menos. */
                className={[
                  'font-sans text-sm transition-colors',
                  enCurso ? 'text-text-primary' : 'text-text-secondary',
                ].join(' ')}
              >
                {paso.texto}
                {enCurso && <PuntosSuspensivos />}
              </span>
            </div>

            {/* El tramo vertical que une un paso con el siguiente, como en la
                referencia. Solo entre pasos: colgando del último parecería que
                falta uno por aparecer. */}
            {indice < activo && (
              <span
                className="ml-3 h-3 w-px"
                style={{ background: alpha(colors.border, 90) }}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Tres puntos que aparecen por turnos.
 *
 * En CSS y no en estado de React: es decoración pura y no merece un render por
 * cada punto. `steps(4)` los va descubriendo de uno en uno en vez de
 * desvanecerlos, que es lo que hace que se lea como algo en curso.
 */
function PuntosSuspensivos() {
  return (
    <span className="inline-block w-4 overflow-hidden align-bottom">
      <span className="animate-puntos-suspensivos inline-block">…</span>
    </span>
  );
}

/* Heroicons v2 «chart-bar»: el contexto del proyecto son sus métricas. */
function IconoDatos() {
  return (
    <Icono>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
      />
    </Icono>
  );
}

/* Heroicons v2 «sparkles»: la llamada al modelo. */
function IconoModelo() {
  return (
    <Icono>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
      />
    </Icono>
  );
}

/* Heroicons v2 «clipboard-document-check»: validar lo que el modelo propone. */

/* Heroicons v2 «check». */
function IconoHecho() {
  return (
    <Icono>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </Icono>
  );
}

function Icono({ children }: { children: ReactNode }) {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
