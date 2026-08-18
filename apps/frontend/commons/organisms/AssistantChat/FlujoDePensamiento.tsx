'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { alpha, colors } from '../../tokens';

/**
 * Cada cuánto avanza el paso visible.
 *
 * No mide nada: ver más abajo por qué el reloj es de adorno y las fases no.
 */
const PASO_MS = 1100;

interface Paso {
  texto: string;
  icono: ReactNode;
}

/**
 * Las fases por las que pasa de verdad una pregunta.
 *
 * Están en el orden en que ocurren dentro de `assistant.service.ts`: se arma el
 * contexto del proyecto —instantánea, tiempos, predicción, personas—, se manda
 * a Gemini y se validan las herramientas que conteste antes de convertirlas en
 * propuestas.
 */
const PASOS: Paso[] = [
  { texto: 'Leyendo el estado del proyecto', icono: <IconoDatos /> },
  { texto: 'Consultando al modelo', icono: <IconoModelo /> },
  { texto: 'Revisando lo que propone', icono: <IconoRevision /> },
];

/**
 * Lo que se enseña mientras el asistente responde.
 *
 * Sustituye a un «Pensando…» suelto, que durante cinco segundos no decía nada
 * más que «espera».
 *
 * ⚠️ **Esto no es el pensamiento del modelo, y conviene tenerlo claro.** Gemini
 * puede devolver su cadena de razonamiento, pero este servicio llama a
 * `:generateContent` sin streaming y sin pedir `thoughts`: cuando la respuesta
 * llega, ya está entera. Enseñar un razonamiento en vivo exigiría rehacer el
 * bucle del servicio, el transporte y la Server Action.
 *
 * Lo que sí es cierto son **las fases**: las tres ocurren, en ese orden, en cada
 * pregunta. Lo simulado es el reloj —cuándo se pasa de una a la siguiente—,
 * porque sin streaming no hay forma de saberlo desde aquí. Por eso ninguna dice
 * un número ni un resultado: describen en qué anda, no lo que ha encontrado.
 * Inventar «he leído 47 tareas» sí sería mentir.
 *
 * El último paso se queda encendido hasta que llega la respuesta, en vez de dar
 * la vuelta: una lista que se reinicia sugiere que algo se atascó.
 */
export function FlujoDePensamiento() {
  const [activo, setActivo] = useState(0);

  useEffect(() => {
    if (activo >= PASOS.length - 1) return;
    const temporizador = window.setTimeout(() => setActivo((actual) => actual + 1), PASO_MS);
    return () => window.clearTimeout(temporizador);
  }, [activo]);

  return (
    <div className="flex flex-col" aria-label="El asistente está trabajando">
      {PASOS.map((paso, indice) => {
        const hecho = indice < activo;
        const enCurso = indice === activo;
        /* Los que aún no han llegado no se pintan: la lista crece conforme
           avanza, en vez de enseñar de entrada tres pasos apagados que ya
           adelantan lo que va a hacer. */
        if (!hecho && !enCurso) return null;

        return (
          <div key={paso.texto} className="flex flex-col">
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
                className={[
                  'font-sans text-sm transition-colors',
                  enCurso ? 'text-text-secondary' : 'text-text-disabled',
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
function IconoRevision() {
  return (
    <Icono>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75"
      />
    </Icono>
  );
}

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
