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
