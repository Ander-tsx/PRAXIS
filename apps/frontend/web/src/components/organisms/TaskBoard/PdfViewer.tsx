'use client';

import { Dialog } from '@praxis/commons';
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
 */
export function PdfViewer({ href, filename }: { href: string; filename: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="shrink-0 cursor-pointer rounded-lg px-2 py-1 font-sans text-[11px] font-semibold text-white transition-colors hover:text-text-primary"
      >
        Ver
      </button>

      <Dialog
        open={abierto}
        onClose={() => setAbierto(false)}
        title={filename}
        description="Se abre aquí mismo. También puedes descargarlo."
        size="lg"
      >
        <div className="flex flex-col gap-3">
          <iframe
            /* `#toolbar=0` no se pone a propósito: la barra del visor trae
               buscar, rotar y zoom, que es lo que hace útil leer aquí en vez de
               descargar. */
            src={href}
            title={filename}
            className="h-[70vh] w-full rounded-lg border border-border bg-background"
          />

          {/* Descargar sigue estando: un PDF de cien páginas se lee mejor fuera,
              y hay quien necesita el archivo, no leerlo. */}
          <a
            href={href}
            download={filename}
            className="self-start font-sans text-xs text-white underline underline-offset-2 hover:text-text-primary"
          >
            Descargar
          </a>
        </div>
      </Dialog>
    </>
  );
}
