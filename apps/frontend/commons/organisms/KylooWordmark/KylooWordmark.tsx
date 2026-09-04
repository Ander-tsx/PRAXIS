/**
 * El wordmark real de Kyloo — geometría copiada literal de su propio
 * `src/components/icons.tsx` (`KylooO`, `KylooOSolid`, `KylooLetters`,
 * `KylooWordmark`). Organismo compartido: lo usan la landing (cierre del
 * footer) y `auth-front` (zona ambiental de `AuthPanel`), así que cada zona
 * que lo monte tiene que cargar Khteka en su propio `layout.tsx` con la
 * variable `--font-khteka` — si no la carga, el texto cae a su *fallback*
 * (`Arial`) sin avisar, no revienta.
 *
 * Sin el stagger de entrada por letra que tiene en el sitio real de Kyloo
 * (`.kyloo-letter` + `animationDelay`): cada consumidor decide su propia
 * forma de aparecer, y duplicar un sistema de animación aquí dentro solo
 * competiría con el de quien lo usa.
 */

interface OGlyphProps {
  x: number;
  y: number;
  size: number;
}

/** El anillo cortado — un solo trazo even-odd, el hueco queda transparente. */
function KylooO({ x, y, size }: OGlyphProps) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${size / 77})`}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M38.5 77C59.763 77 77 59.763 77 38.5C77 17.237 59.763 0 38.5 0C17.237 0 0 17.237 0 38.5C0 59.763 17.237 77 38.5 77ZM38.5 66C53.6878 66 66 53.6878 66 38.5C66 23.3122 53.6878 11 38.5 11C23.3122 11 11 23.3122 11 38.5C11 53.6878 23.3122 66 38.5 66Z"
        fill="currentColor"
      />
      <path d="M64.0695 0H77L12.7647 77H0L64.0695 0Z" fill="currentColor" />
    </g>
  );
}

/** El disco relleno — el primer "o" del par. */
function KylooOSolid({ x, y, size }: OGlyphProps) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${size / 77})`}>
      <path
        d="M38.5 77C59.763 77 77 59.763 77 38.5C77 17.237 59.763 0 38.5 0C17.237 0 0 17.237 0 38.5C0 59.763 17.237 77 38.5 77Z"
        fill="currentColor"
      />
    </g>
  );
}

function KylooLetters({ oSize = 42, oBaseline = 60 }: { oSize?: number; oBaseline?: number }) {
  const letter = {
    fill: 'currentColor',
    fontSize: 83,
    fontFamily: 'var(--font-khteka), Arial, sans-serif',
    fontWeight: 500,
    letterSpacing: '-0.02em',
  } as const;

  return (
    <g>
      <text x="0" y="60" {...letter}>
        K
      </text>
      <text x="55" y="60" {...letter}>
        y
      </text>
      <text x="98" y="60" {...letter}>
        l
      </text>
      <KylooOSolid x={122} y={oBaseline - oSize} size={oSize} />
      <KylooO x={168} y={oBaseline - oSize} size={oSize} />
    </g>
  );
}

/** Decorativo por diseño: siempre acompaña a un texto ("By Kyloo") que ya
 * lleva el nombre accesible en el elemento contenedor. */
export function KylooWordmark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 214 80"
      fill="none"
    >
      <KylooLetters />
    </svg>
  );
}
