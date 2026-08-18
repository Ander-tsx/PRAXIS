'use client';

import { FileIcon, ImageIcon, VideoIcon } from 'lucide-react';
import { messagePreview } from '../../api/chat-refs';

const ICONO_POR_TIPO = {
  imagen: ImageIcon,
  video: VideoIcon,
  archivo: FileIcon,
} as const;

/**
 * El texto de un mensaje en un sitio que no puede pintarlo entero: la cita, la
 * barra de fijados, un resultado de búsqueda, la hoja «Respondiendo a».
 *
 * Cuando el mensaje es solo un archivo —sin texto propio— `messagePreview`
 * ya resuelve qué decir; aquí solo se le pone el icono de Lucide que
 * corresponde, delante. Un componente y no repetir el `if` del icono en los
 * cuatro sitios que lo usan.
 */
export function AdjuntoPreview({
  mensaje,
  maximo,
}: {
  mensaje: {
    body: string;
    attachments: { mimeType: string }[];
    /** Puesto, el resumen es la lápida. Ver `ChatMessage.deletedAt`. */
    deletedAt?: string | null;
  };
  /**
   * Tope de caracteres del resumen.
   *
   * ⚠️ **No es una alternativa al recorte por CSS, es su red de seguridad.** Un
   * mensaje puede tener 4000 caracteres, y confiar el recorte a un `line-clamp`
   * significa entregar los 4000 al navegador y esperar que la regla gane: si
   * alguna utilidad de `display` la pisa —cosa que pasa, y pasó en la barra de
   * fijados— el contenedor crece hasta ocupar la pantalla. Cortando aquí, el
   * peor caso es un renglón de más.
   */
  maximo?: number;
}) {
  /* Una lápida no tiene resumen que dar: `body` está vacío y `attachments`
     también, así que `messagePreview` devolvería una cadena vacía y la cita se
     quedaría en blanco — que es indistinguible de un fallo de carga. */
  if (mensaje.deletedAt) {
    return <span className="italic text-text-disabled">Mensaje eliminado</span>;
  }

  const { texto, tipoAdjunto } = messagePreview(mensaje);
  const Icono = tipoAdjunto ? ICONO_POR_TIPO[tipoAdjunto] : null;

  const recortado =
    maximo && texto.length > maximo ? `${texto.slice(0, maximo).trimEnd()}…` : texto;

  return (
    <>
      {Icono && (
        <Icono
          aria-hidden="true"
          className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom"
        />
      )}
      {recortado}
    </>
  );
}
