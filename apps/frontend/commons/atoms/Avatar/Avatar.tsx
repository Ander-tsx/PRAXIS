import { alpha, colors } from '../../tokens';

/**
 * El círculo con las iniciales de una persona.
 *
 * Existe porque había **dos** y no coincidían: la tarjeta del tablero pintaba
 * dos iniciales y en rojo cuando la tarea era tuya, y la ficha de la barra
 * lateral pintaba una sola inicial en violeta. Eran la misma persona —tú— con
 * dos caras distintas en la misma pantalla, y eso obliga a aprenderse dos veces
 * lo mismo.
 *
 * Ahora el rojo significa **una sola cosa en todo el producto**: eres tú.
 *
 * ## Por qué las iniciales van aquí y no en cada sitio
 *
 * `iniciales()` estaba dentro de `TaskCard`, con el criterio bueno; la barra
 * lateral tenía el suyo, más pobre. Al compartir el componente se comparte la
 * regla, y deja de poder divergir.
 */

export type AvatarSize = 'sm' | 'md';

const SIZES: Record<AvatarSize, string> = {
  /** El del tablero: cabe cuatro veces en una tarjeta sin ahogarla. */
  sm: 'h-6 w-6 text-[10px]',
  /** El de la barra lateral y las fichas de persona. */
  md: 'h-10 w-10 text-sm',
};

export interface AvatarProps {
  /** Nombre completo, o el correo si no hay nombre. De aquí salen las iniciales. */
  label: string;
  /** Eres tú. Pinta el círculo en rojo, que es lo que lo distingue del resto. */
  mine?: boolean;
  size?: AvatarSize;
  /** Anillo del color del fondo, para que se solapen sin fundirse. */
  ring?: boolean;
  className?: string;
  title?: string;
}

export function Avatar({
  label,
  mine = false,
  size = 'sm',
  ring = false,
  className = '',
  title,
}: AvatarProps) {
  return (
    <span
      title={title ?? label}
      className={[
        'flex shrink-0 items-center justify-center rounded-full font-sans font-semibold uppercase',
        SIZES[size],
        ring ? 'ring-2 ring-background' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        mine
          ? /* `colors.error` con `textInverse` encima funciona en los dos temas
               sin condicionarlo: el par se invierte solo. */
            { background: colors.error, color: colors.textInverse }
          : { background: alpha(colors.primary, 30), color: colors.textPrimary }
      }
    >
      {iniciales(label)}
    </span>
  );
}

/**
 * Iniciales de una persona: la primera letra de sus dos primeras palabras.
 *
 * Cortar los dos primeros caracteres del nombre parecía equivalente y no lo es:
 * «Andres Praxis» y «Andrea Ruiz» daban las dos «AN» y quedaban indistinguibles
 * en la misma tarjeta. Con una sola palabra —el caso de quien no ha puesto
 * nombre y cae al correo— sí se usan sus dos primeras letras.
 */
export function iniciales(label: string): string {
  const [primera, segunda] = label.trim().split(/\s+/).filter(Boolean);
  if (!primera) return '?';
  if (!segunda) return primera.slice(0, 2);
  return primera.charAt(0) + segunda.charAt(0);
}
