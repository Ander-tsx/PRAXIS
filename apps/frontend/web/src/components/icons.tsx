import type { SVGProps } from 'react';

/**
 * Iconos inline de la landing.
 *
 * ⚠️ Aquí ponía que había «dos variantes de la misma flecha —recta y
 * desplazada—», y era falso: la segunda era una copia idéntica. Quien
 * desplaza la copia es `RollCta`, con un `transform`, no el propio dibujo.
 */

export function ArrowUpRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none">
      <title>Ir</title>
      <path
        d="M8.90954 9.09046L9 3L2.90954 3.09046L2.90213 4.32367L6.86437 4.25391L2.55914 8.55914L3.44086 9.44086L7.74609 5.13563L7.68708 9.10862L8.90954 9.09046Z"
        fill="currentColor"
      />
    </svg>
  );
}

/* 🚫 Aquí vivía `ArrowUpRightAltIcon`, **byte a byte la misma flecha** que la
   de arriba. Existía porque `RollCta` necesita dos copias para el efecto de
   rodillo, y en su día se resolvió duplicando el componente en vez de usarlo
   dos veces. Dos nombres para el mismo dibujo son dos sitios donde cambiar un
   `path`, y solo uno se acuerda. `RollCta` monta `ArrowUpRightIcon` las dos
   veces. */

/** La flecha entrando en una bandeja: el icono de "descargar/instalar" de `InstallAppButton`. */
export function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <title>Instalar</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
      />
    </svg>
  );
}
