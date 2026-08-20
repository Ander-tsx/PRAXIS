/**
 * La cara de PRAX en miniatura, para la fila de la barra lateral.
 *
 * Fantasmita pixel-art estático: cúpula arriba, faldón escalonado abajo y dos
 * ojos cuadrados. Va de trazo —no relleno— porque comparte fila con seis iconos
 * de línea: relleno se lee como un botón activo y rompe la lista.
 *
 * Usa `currentColor` para heredar el estado de hover/selección. Sin animaciones,
 * sin estado de cliente.
 */
export function PraxSidebarIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-label="PRAX, listo"
      className={`inline-flex shrink-0 select-none h-5 w-5 ${className}`}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/*
        Cuerpo — cúpula de radio 7 centrada en (10, 8.5) y faldón escalonado.

        ⚠️ **Dos pies y una muesca, no los tres del avatar grande.** A 20 px el
        trazo de 1.6 ocupa más que las muescas del faldón de tres pies y el bajo
        del fantasma se cierra en una mancha con dos ranuras. Una muesca sola de
        5 de ancho y 3.5 de hondo sigue leyéndose a tamaño de fila.
      */}
      <path
        d="M 3 8.5 A 7 7 0 0 1 17 8.5 L 17 16 Q 17 17 16 17 L 13.5 17 Q 12.5 17 12.5 16 L 12.5 14.5 Q 12.5 13.5 11.5 13.5 L 8.5 13.5 Q 7.5 13.5 7.5 14.5 L 7.5 16 Q 7.5 17 6.5 17 L 4 17 Q 3 17 3 16 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Ojo izquierdo — cuadrado */}
      <rect x="6" y="7" width="3.2" height="3.2" rx="0.9" fill="currentColor" />
      {/* Ojo derecho — cuadrado */}
      <rect x="10.8" y="7" width="3.2" height="3.2" rx="0.9" fill="currentColor" />
    </svg>
  );
}
