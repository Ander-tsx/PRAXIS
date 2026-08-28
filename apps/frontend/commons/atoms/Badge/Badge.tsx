import type { CSSProperties, ReactNode } from 'react';
import { alpha, colors } from '../../tokens';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  style?: CSSProperties;
}

/**
 * `background`/`border` son washes al 10-12% sobre lo que haya detrás, no
 * colores sólidos: por eso se leen bien tanto sobre `--color-surface` oscuro
 * como sobre el blanco del tema claro. `default` es el único que no tenía
 * token propio — usaba blanco fijo, que en tema claro es invisible sobre
 * fondo blanco — así que sale de `textSecondary`, que ya es gris en los dos
 * temas.
 */
const variantStyles: Record<BadgeVariant, CSSProperties> = {
  default: {
    background: alpha(colors.textSecondary, 12),
    border: `1px solid ${alpha(colors.textSecondary, 25)}`,
    color: colors.textSecondary,
  },
  primary: {
    background: 'transparent',
    border: `1px solid ${colors.borderStrong}`,
    color: colors.primary,
  },
  accent: {
    background: 'transparent',
    border: `1px solid ${colors.borderStrong}`,
    color: colors.accent,
  },
  success: {
    background: 'transparent',
    border: `1px solid ${colors.borderStrong}`,
    color: colors.success,
  },
  warning: {
    background: 'transparent',
    border: `1px solid ${colors.borderStrong}`,
    color: colors.warning,
  },
  error: {
    background: 'transparent',
    border: `1px solid ${colors.borderStrong}`,
    color: colors.error,
  },
  info: {
    background: 'transparent',
    border: `1px solid ${colors.borderStrong}`,
    color: colors.info,
  },
};

export function Badge({ children, variant = 'default', className = '', style }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center font-sans font-medium ${className}`}
      style={{
        fontSize: 10,
        letterSpacing: '0.04em',
        padding: '3px 10px',
        borderRadius: '2px',
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
