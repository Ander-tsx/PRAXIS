export function PraxSidebarIcon({ className = '' }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="PRAX, listo"
      title="PRAX, listo"
      className={`inline-flex shrink-0 select-none items-center justify-center font-mono font-bold leading-none rounded-[30%] h-5 w-5 text-[7px] ${className}`}
      style={{
        background: 'transparent',
        color: 'currentColor',
        /* Borde interior con el mismo grosor (1.75px) que el trazo de los iconos de la barra lateral */
        boxShadow: 'inset 0 0 0 1.75px currentColor',
        fontVariantLigatures: 'none',
        letterSpacing: '-0.02em',
      }}
    >
      <span style={{ transform: 'translateY(-0.04em)' }}>^-^</span>
    </span>
  );
}
