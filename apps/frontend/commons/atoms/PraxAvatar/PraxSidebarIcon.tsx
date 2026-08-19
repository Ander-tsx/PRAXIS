/**
 * La cara de PRAX en miniatura, para la fila de la barra lateral.
 *
 * Versión pixel-art estática: un cuadrado redondeado con dos ojos cuadrados.
 * Usa `currentColor` para integrarse con el estado de hover/selección de la
 * barra lateral. Sin animaciones, sin estado de cliente.
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
      {/* Cuerpo */}
      <rect
        x="1" y="1" width="18" height="18"
        rx="4.5" ry="4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        fill="none"
      />
      {/* Ojo izquierdo — cuadrado */}
      <rect x="5.5" y="7" width="3.5" height="3.5" fill="currentColor" />
      {/* Ojo derecho — cuadrado */}
      <rect x="11" y="7" width="3.5" height="3.5" fill="currentColor" />
    </svg>
  );
}
