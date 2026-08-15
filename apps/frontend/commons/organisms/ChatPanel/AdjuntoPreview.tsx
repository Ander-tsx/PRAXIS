'use client';

import { FileIcon, ImageIcon, VideoIcon } from 'lucide-react';
import { previewDeMensaje } from '../../api/chat-refs';

const ICONO_POR_TIPO = {
  imagen: ImageIcon,
  video: VideoIcon,
  archivo: FileIcon,
} as const;

/**
 * El texto de un mensaje en un sitio que no puede pintarlo entero: la cita, la
 * barra de fijados, un resultado de búsqueda, la hoja «Respondiendo a».
 *
 * Cuando el mensaje es solo un archivo —sin texto propio— `previewDeMensaje`
 * ya resuelve qué decir; aquí solo se le pone el icono de Lucide que
 * corresponde, delante. Un componente y no repetir el `if` del icono en los
 * cuatro sitios que lo usan.
 */
export function AdjuntoPreview({
  mensaje,
}: {
  mensaje: { body: string; attachments: { mimeType: string }[] };
}) {
  const { texto, tipoAdjunto } = previewDeMensaje(mensaje);
  const Icono = tipoAdjunto ? ICONO_POR_TIPO[tipoAdjunto] : null;

  return (
    <>
      {Icono && (
        <Icono
          aria-hidden="true"
          className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom"
        />
      )}
      {texto}
    </>
  );
}
