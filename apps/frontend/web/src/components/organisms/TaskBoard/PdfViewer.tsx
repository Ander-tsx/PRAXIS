'use client';

import { Dialog, alpha, colors } from '@praxis/commons';
import { useState } from 'react';

/**
 * El visor de PDF, dentro de la propia página.
 *
 * Antes los adjuntos solo se podían descargar: el backend los servía con
 * `Content-Disposition: attachment` y abrirlos significaba salir de la
 * aplicación, buscarlos en la carpeta de descargas y volver.
 *
 * ## Por qué ahora sí se puede
 *
 * No se ha relajado la regla, se ha cerrado por otro lado. La respuesta del
 * gateway lleva **`Content-Security-Policy: sandbox allow-scripts
 * allow-downloads`**, que hace que el navegador trate ese recurso como un
 * **origen opaco** —falta `allow-same-origin`, que es la que importa—: un PDF con JavaScript
 * dentro —que es un formato que lo admite— se ejecuta sin acceso a la cookie de
 * sesión, sin acceso al DOM de la aplicación y sin poder navegar la ventana de
 * arriba. Ese era el riesgo por el que estaba prohibido.
 *
 * ⚠️ **El `<iframe>` NO lleva atributo `sandbox`, y quitarlo fue el arreglo.**
 *
 * Chrome se niega a cargar su visor de PDF dentro de un marco con atributo
 * `sandbox`, **da igual qué permisos lleve**: el visor es una extensión interna
 * y el marco sandboxeado no puede alojarla. Medido con cinco combinaciones
 * sirviendo el mismo PDF:
 *
 * | CSP de la respuesta | `sandbox` del iframe | |
 * |---|---|---|
 * | — | — | carga |
 * | `sandbox allow-scripts` | — | **carga** |
 * | `sandbox allow-scripts` | `allow-scripts` | ERR_BLOCKED_BY_CLIENT |
 * | — | `allow-scripts` | ERR_BLOCKED_BY_CLIENT |
 * | `sandbox … allow-same-origin` | `allow-scripts allow-same-origin` | ERR_BLOCKED_BY_CLIENT |
 *
 * **No se pierde nada de seguridad al quitarlo.** La directiva `sandbox` de la
 * cabecera aplica las mismas restricciones al documento en sí, y esa sigue
 * puesta: el PDF vive en un origen opaco, sin acceso a la cookie de sesión ni
 * al DOM de la aplicación. El atributo era una segunda capa redundante que,
 * además, impedía que la primera sirviera para algo.
 *
 * ## Por qué un `<iframe>` y no una librería
 *
 * Todos los navegadores que soporta el producto traen visor de PDF. Meter
 * `pdf.js` serían cientos de kilobytes en el bundle del tablero para reimplementar
 * peor lo que el navegador ya hace —y con su propia superficie de fallos, que es
 * justo lo que se está evitando.
 *
 * ## El marco no avisa cuando falla, y por eso hay un pie
 *
 * ⚠️ **Un `<iframe>` que recibe un 404 dispara `onLoad`, no `onError`.** El
 * navegador cargó *algo* —la página de error— así que para el evento aquello
 * fue un éxito, y el origen es opaco: no se puede mirar dentro para comprobar
 * qué llegó. Es literalmente lo que pasó cuando la ruta apuntaba a
 * `/projects/api/gateway/…` (ver `TaskAttachments`): el marco salía en blanco,
 * sin un error en ninguna consola, y parecía que el visor estaba roto.
 *
 * Como no hay forma de detectarlo, el pie del diálogo **siempre** ofrece las
 * dos salidas —abrir en pestaña y descargar—. No es decoración: es lo único que
 * queda cuando el marco se queda mudo.
 */
export function PdfViewer({ href, filename }: { href: string; filename: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {/**
       * ⚠️ **«Ver» era texto suelto, sin fondo ni borde**, al lado de un enlace
       * que también era texto: la única acción de la fila que no se parecía a un
       * botón. Ahora toma el lenguaje del resto del tablero —píldora tenue que
       * se enciende al pasar por encima— y lleva icono, que es lo que la separa
       * de un enlace a simple vista.
       */}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Ver ${filename}`}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-sans text-[11px] font-semibold text-white transition-colors hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
          />
        </svg>
        Ver
      </button>

      <Dialog
        open={abierto}
        onClose={() => setAbierto(false)}
        title={filename}
        description="Se abre aquí mismo, con la barra del navegador para buscar y hacer zoom."
        size="lg"
      >
        <div className="flex flex-col gap-3">
          {/* El marco va sobre el negro base y con borde propio: el diálogo está
              en `surface`, así que sin ese salto el PDF —que es blanco— parecía
              pegado al panel y no un documento dentro de él. */}
          <iframe
            /* `#toolbar=0` no se pone a propósito: la barra del visor trae
               buscar, rotar y zoom, que es lo que hace útil leer aquí en vez de
               descargar. */
            src={href}
            title={filename}
            className="h-[70vh] w-full rounded-xl border border-border bg-background"
          />

          {/**
           * Las dos salidas, siempre. Ver la nota de arriba: el marco no puede
           * avisar de que no ha cargado nada, así que esto es la red.
           *
           * «Abrir en una pestaña» va primero porque es lo que arregla el caso
           * en el que el marco falla; descargar es para cuando el documento es
           * largo y se lee mejor fuera.
           */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
            <p className="font-sans text-[11px] text-text-secondary">
              ¿El documento no aparece? Ábrelo en una pestaña.
            </p>

            <span className="flex items-center gap-2">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 font-sans text-xs font-medium text-white transition-colors hover:border-white/20 hover:bg-white/10"
              >
                Abrir en una pestaña
              </a>
              <a
                href={href}
                download={filename}
                className="rounded-lg px-3 py-1.5 font-sans text-xs font-semibold text-white transition-opacity hover:opacity-80"
                style={{ background: alpha(colors.primary, 20) }}
              >
                Descargar
              </a>
            </span>
          </div>
        </div>
      </Dialog>
    </>
  );
}
