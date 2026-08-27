import type { SVGProps } from 'react';

/**
 * Iconos inline de la landing. Dos variantes de la misma flecha —recta y
 * desplazada— porque el patrón "roll" del CTA (commons/molecules/Reveal no
 * cubre esto: es un swap de icono, no de texto) necesita que la segunda copia
 * empiece ya fuera de encuadre para que el gesto sea un giro, no un salto.
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

export function ArrowUpRightAltIcon(props: SVGProps<SVGSVGElement>) {
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
