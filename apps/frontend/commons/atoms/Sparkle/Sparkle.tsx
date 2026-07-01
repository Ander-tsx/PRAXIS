import type { CSSProperties } from 'react';

export interface SparkleProps {
  size?: number;
  style?: CSSProperties;
  className?: string;
  /** aria-hidden defaults to true — purely decorative */
  'aria-hidden'?: boolean;
}

/**
 * Sparkle — ícono SVG de estrella de 4 puntas.
 * Decorativo por defecto (aria-hidden=true).
 * Usado en headers de sección, hero y CTA.
 */
export function Sparkle({
  size = 14,
  style,
  className = '',
  'aria-hidden': ariaHidden = true,
}: SparkleProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      style={style}
      className={className}
      aria-hidden={ariaHidden}
    >
      <path d="M12 0l1.8 8.7 8.7 1.8-8.7 1.8L12 21l-1.8-8.7L1.5 10.5l8.7-1.8z" />
    </svg>
  );
}
