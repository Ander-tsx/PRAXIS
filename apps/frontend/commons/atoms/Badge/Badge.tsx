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
 * Cada variante es un **wash de color con forma de pastilla**: fondo tintado al
 * ~15%, borde del mismo color al ~35% y el texto a plena saturación. Se lee
 * bien sobre superficie oscura y sobre el blanco del tema claro, y el color
 * dice de un vistazo de qué tipo es el estado —verde va, rojo para, ámbar
 * atención— sin tener que leer la palabra.
 *
 * `default` sale de `textSecondary` (gris en los dos temas) para lo que no
 * tiene color propio.
 */
const wash = (color: string): CSSProperties => ({
  background: alpha(color, 15),
  border: `1px solid ${alpha(color, 35)}`,
  color,
});

const variantStyles: Record<BadgeVariant, CSSProperties> = {
  default: wash(colors.textSecondary),
  primary: wash(colors.primary),
  accent: wash(colors.accent),
  success: wash(colors.success),
  warning: wash(colors.warning),
  error: wash(colors.error),
  info: wash(colors.info),
};

export function Badge({ children, variant = 'default', className = '', style }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center font-sans font-semibold ${className}`}
      style={{
        fontSize: 10,
        letterSpacing: '0.04em',
        padding: '3px 10px',
        borderRadius: '9999px',
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
