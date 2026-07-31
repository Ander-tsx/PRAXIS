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
 * gateway lleva **`Content-Security-Policy: sandbox`**, que hace que el
 * navegador trate ese recurso como un **origen opaco**: un PDF con JavaScript
 * dentro —que es un formato que lo admite— se ejecuta sin acceso a la cookie de
 * sesión, sin acceso al DOM de la aplicación y sin poder navegar la ventana de
 * arriba. Ese era el riesgo por el que estaba prohibido.
 *
 * El `sandbox` del propio `<iframe>` es una segunda capa por si algún día se
 * sirviera sin la cabecera. No lleva `allow-scripts`: el visor de PDF del
 * navegador no lo necesita, es nativo y no depende del sandbox del documento.
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
        className="shrink-0 cursor-pointer rounded-lg px-2 py-1 font-sans text-[11px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
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
            sandbox=""
            className="h-[70vh] w-full rounded-lg border border-border bg-background"
          />

          {/* Descargar sigue estando: un PDF de cien páginas se lee mejor fuera,
              y hay quien necesita el archivo, no leerlo. */}
          <a
            href={href}
            download={filename}
            className="self-start font-sans text-xs text-text-secondary underline underline-offset-2 hover:text-text-primary"
          >
            Descargar
          </a>
        </div>
      </Dialog>
    </>
  );
}
