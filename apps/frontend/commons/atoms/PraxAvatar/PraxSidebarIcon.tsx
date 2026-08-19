/**
 * La cara de PRAX en miniatura, para la fila de la barra lateral.
 *
 * Es una versión estática y simplificada del avatar principal: un cuadrado
 * redondeado con dos ojitos. No anima ni reacciona — en la barra lateral
 * solo necesita ser reconocible, no expresivo.
 *
 * Usa `currentColor` para el trazo exterior y los ojos, heredando el color
 * del texto de la barra. El interior es transparente para que se integre
 * con cualquier estado de hover o selección del ítem del menú.
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
      {/* Cuerpo: cuadrado redondeado, solo contorno */}
      <rect
        x="1" y="1" width="18" height="18"
        rx="5.5" ry="5.5"
        stroke="currentColor"
        strokeWidth="1.75"
        fill="none"
      />
      {/* Ojo izquierdo */}
      <circle cx="7.2" cy="8.8" r="1.7" fill="currentColor" />
      {/* Ojo derecho */}
      <circle cx="12.8" cy="8.8" r="1.7" fill="currentColor" />
      {/* Sonrisa */}
      <path
        d="M 7 12.5 Q 10 15.5 13 12.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
