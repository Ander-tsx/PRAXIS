/**
 * Los dos glifos que marcan lo que una tarea lleva dentro: notas y archivos.
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

/** Cuaderno con renglones. La marca de que hay notas. */
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
        d="M8 4h9a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z"
      />
      <path strokeLinecap="round" d="M9.5 9h6M9.5 12.5h6M9.5 16h3.5" />
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
