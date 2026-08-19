/**
 * La cara de PRAX en miniatura, para la fila de la barra lateral.
 *
 * ⚠️ **El grosor no se consigue con `font-weight`, y ese fue el intento que no
 * funcionó.** `--font-mono` es `"JetBrains Mono", "Fira Code", monospace` y
 * ninguna de las dos está autoalojada: en la práctica esto se pinta con el
 * monoespaciado que tenga el sistema, así que pedir 800 o 900 da lo que ese
 * fallback tenga —casi siempre el mismo bold de 700, o una negrita sintética
 * distinta en cada máquina—. `-webkit-text-stroke` engorda el trazo del glifo
 * sea cual sea la fuente que acabe entrando, y **no cambia las métricas**: la
 * cara sigue cabiendo dentro del cuadro sin recolocar nada.
 *
 * A 7px la cara se distinguía mal del resto de iconos de trazo. Sube a 8px, que
 * es lo máximo que entra: tres caracteres de ancho ~0.6em son 14,4px y el
 * interior del cuadro mide 16,5px una vez descontado el borde de 1,75px.
 */
export function PraxSidebarIcon({ className = '' }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="PRAX, listo"
      title="PRAX, listo"
      className={`inline-flex shrink-0 select-none items-center justify-center font-mono font-bold leading-none rounded-[30%] h-5 w-5 text-[8px] ${className}`}
      style={{
        background: 'transparent',
        color: 'currentColor',
        /* Borde interior con el mismo grosor (1.75px) que el trazo de los iconos de la barra lateral */
        boxShadow: 'inset 0 0 0 1.75px currentColor',
        fontVariantLigatures: 'none',
        letterSpacing: '-0.02em',
      }}
    >
      <span
        style={{
          transform: 'translateY(-0.04em)',
          /* Ver arriba: esto es lo que engorda la cara, no el `font-bold`. */
          WebkitTextStroke: '0.35px currentColor',
        }}
      >
        ^-^
      </span>
    </span>
  );
}
