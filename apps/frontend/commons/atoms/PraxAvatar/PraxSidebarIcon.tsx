/**
 * La cara de PRAX en miniatura, para la fila de la barra lateral.
 *
 * Fantasmita pixel-art estático: cúpula arriba, faldón escalonado abajo y dos
 * ojos cuadrados (dos pies y una muesca, no los tres del avatar grande — a 20 px
 * el trazo de 1.6 cerraría el bajo en una mancha). Va de trazo —no relleno—
 * porque comparte fila con seis iconos de línea. `currentColor` para heredar el
 * hover/selección. Sin animaciones, sin estado de cliente.
 *
 * ⚠️ **Nada de comentarios `{/* … *\/}` entre los hijos del `<svg>`.** Eran los
 * culpables del aviso «Each child in a list should have a unique "key" prop …
 * render method of `NavList`»: un comentario JSX entre hermanos hace que el
 * compilador emita `jsx` (hijos dinámicos) en vez de `jsxs` (lista estática), y
 * ahí el validador de claves de desarrollo sí entra. Con los tres trazos como
 * hermanos limpios —sin nada entre ellos— vuelve a ser `jsxs` y el aviso
 * desaparece. La explicación va aquí, fuera del JSX.
 *
 * Trazos, en orden: cuerpo (cúpula de radio 7 centrada en (10, 8.5) + faldón),
 * ojo izquierdo, ojo derecho.
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
      <path
        d="M 3 8.5 A 7 7 0 0 1 17 8.5 L 17 16 Q 17 17 16 17 L 13.5 17 Q 12.5 17 12.5 16 L 12.5 14.5 Q 12.5 13.5 11.5 13.5 L 8.5 13.5 Q 7.5 13.5 7.5 14.5 L 7.5 16 Q 7.5 17 6.5 17 L 4 17 Q 3 17 3 16 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
      <rect x="6" y="7" width="3.2" height="3.2" rx="0.9" fill="currentColor" />
      <rect x="10.8" y="7" width="3.2" height="3.2" rx="0.9" fill="currentColor" />
    </svg>
  );
}
