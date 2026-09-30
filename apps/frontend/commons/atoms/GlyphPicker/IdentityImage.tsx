import { colors } from '../../tokens';

const MEDIDAS = {
  sm: 'h-8 w-8',
  md: 'h-11 w-11',
} as const;

const RADIO = {
  sm: { square: 'rounded-lg', circle: 'rounded-full' },
  md: { square: 'rounded-xl', circle: 'rounded-full' },
} as const;

/** El proxy del gateway: hay una sola aplicación, así que es siempre el mismo. */
const GATEWAY_PATH = '/api/gateway';

/**
 * La imagen subida de un proyecto o una organización, con la misma caja que
 * `Glyph` y `ProjectMonogram` para que las tres caras sean intercambiables.
 *
 * `imageUrl` es la ruta **relativa al gateway** que guarda el backend
 * (`/projects/<id>/image?v=…`); aquí se le antepone el proxy.
 *
 * ⚠️ Va de `background-image` y no de `<img>` por lo mismo que `Avatar`: se pinta
 * desde componentes de servidor y un `onError` no puede cruzar esa frontera.
 * Si la imagen no carga, queda el fondo neutro en vez de un icono roto.
 */
export function IdentityImage({
  imageUrl,
  label,
  size = 'sm',
  shape = 'square',
  apagado = false,
  className = '',
}: {
  imageUrl: string;
  label?: string;
  size?: 'sm' | 'md';
  shape?: 'square' | 'circle';
  apagado?: boolean;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label ?? 'Imagen'}
      className={`shrink-0 bg-cover bg-center transition-[filter] ${MEDIDAS[size]} ${RADIO[size][shape]} ${className}`}
      style={{
        backgroundColor: colors.surfaceElevated,
        backgroundImage: `url(${GATEWAY_PATH}${imageUrl})`,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
        filter: apagado ? 'grayscale(1) opacity(0.6)' : undefined,
      }}
    />
  );
}
