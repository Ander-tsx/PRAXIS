import { alpha, colors } from '../../tokens';
import { type GlyphDef, glyphByKey } from './glyphs';
import { IdentityImage } from './IdentityImage';

export interface GlyphProps {
  /** La `key` guardada (`Project.iconKey` / `Organization.iconKey`). */
  iconKey: string | null | undefined;
  /** Color de acento `#rrggbb`. Si falta, se usa el morado de marca. */
  color?: string | null;
  /** `sm` (32 px) en listas y filas; `md` (44 px) en tarjetas y cabeceras. */
  size?: 'sm' | 'md';
  /** Cuadrado (proyecto) o círculo (organización). Por defecto cuadrado. */
  shape?: 'square' | 'circle';
  /** Apagado a gris, para un proyecto suspendido. */
  apagado?: boolean;
  /**
   * Imagen subida (ruta relativa al gateway). **Gana al icono**: si hay, se pinta
   * ella y no el glifo, y el componente ya no devuelve `null` por falta de icono.
   */
  imageUrl?: string | null;
  className?: string;
}

const MEDIDAS = {
  sm: { caja: 'h-8 w-8', icono: 16 },
  md: { caja: 'h-11 w-11', icono: 22 },
} as const;

const RADIO = {
  sm: { square: 'rounded-lg', circle: 'rounded-full' },
  md: { square: 'rounded-xl', circle: 'rounded-full' },
} as const;

/**
 * Un icono elegido sobre su color, con la misma caja que `ProjectMonogram`.
 *
 * Es la otra cara del monograma: cuando un proyecto o una organización tiene
 * `iconKey`, esto sustituye a las dos letras. El fondo es el color a baja
 * opacidad y el trazo va en el color a plena — igual que el monograma pinta las
 * iniciales— para que las dos formas se lean como «la cara de esto», no como
 * dos componentes distintos.
 *
 * Devuelve `null` si la `key` no está en la lista curada: quien lo monta tiene
 * que tener preparado el monograma de letras como alternativa. Ver `glyphByKey`.
 */
export function Glyph({
  iconKey,
  color,
  size = 'sm',
  shape = 'square',
  apagado = false,
  imageUrl = null,
  className = '',
}: GlyphProps) {
  if (imageUrl) {
    return (
      <IdentityImage
        imageUrl={imageUrl}
        size={size}
        shape={shape}
        apagado={apagado}
        className={className}
      />
    );
  }
  const def: GlyphDef | undefined = glyphByKey(iconKey);
  if (!def) return null;

  const { caja, icono } = MEDIDAS[size];
  const tono = apagado ? colors.textSecondary : color || colors.primary;
  const { Icon } = def;

  return (
    <span
      role="img"
      aria-label={def.label}
      className={`flex shrink-0 items-center justify-center transition-colors ${caja} ${RADIO[size][shape]} ${className}`}
      style={{
        background: alpha(tono, apagado ? 14 : 16),
        color: apagado ? colors.textDisabled : tono,
        boxShadow: `inset 0 0 0 1px ${alpha(tono, 30)}`,
      }}
    >
      <Icon size={icono} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}
