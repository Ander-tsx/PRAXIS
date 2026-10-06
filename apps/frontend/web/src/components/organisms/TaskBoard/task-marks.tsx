import { Link2 } from 'lucide-react';

/**
 * Los glifos que marcan lo que una tarea lleva dentro: notas, archivos y
 * documentos vinculados.
 *
 * En un módulo propio porque los usan **dos sitios cada uno** —la cabecera de
 * su sección en el diálogo y la píldora de la tarjeta— y tienen que ser el
 * mismo dibujo en los dos. Si la tarjeta enseña un icono y la sección otro, la
 * marca deja de ser una promesa de lo que hay al abrir.
 *
 * ⚠️ **`currentColor` y nada de tamaño propio.** Quien los monta decide el
 * color y la caja: en la tarjeta van al tono de la píldora y a 10 px, y en la
 * sección van en blanco y a 14. Un `stroke` fijo aquí obligaría a pelearlo con
 * `!important` desde fuera.
 */

/**
 * Burbuja de conversación. La marca de que hay notas.
 *
 * Era un cuaderno con renglones, y al lado del clip de archivos se leían como
 * dos documentos. Las notas son lo que el equipo se dice sobre la tarea: una
 * burbuja lo cuenta sin abrirla.
 */
export function NotesGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

/** Clip. La marca de que hay archivos adjuntos. */
export function AttachmentGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 6.5l-7.8 7.8a2.5 2.5 0 003.5 3.5l7.8-7.8a4.5 4.5 0 00-6.4-6.4l-7.8 7.8a6.5 6.5 0 009.2 9.2l6.9-6.9"
      />
    </svg>
  );
}

/**
 * La marca de que hay documentos vinculados: `Link2` de lucide, **el mismo**
 * que el botón «Vincular» de la sección de documentos del panel. Era un eslabón
 * dibujado aquí, parecido pero no igual, y una marca que no coincide con el
 * botón que la produce deja de leerse como su resultado.
 */
export function LinkGlyph({ className }: { className?: string }) {
  return <Link2 className={className} strokeWidth={2} aria-hidden="true" />;
}
