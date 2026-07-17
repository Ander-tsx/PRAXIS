import type { CSSProperties, ReactNode } from 'react';

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

const variantStyles: Record<BadgeVariant, CSSProperties> = {
  default: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.45)',
  },
  primary: {
    background: 'rgba(108,99,255,0.12)',
    border: '1px solid rgba(108,99,255,0.3)',
    color: 'var(--color-primary)',
  },
  accent: {
    background: 'rgba(212,168,67,0.12)',
    border: '1px solid rgba(212,168,67,0.3)',
    color: 'var(--color-accent)',
  },
  success: {
    background: 'rgba(74,222,128,0.12)',
    border: '1px solid rgba(74,222,128,0.3)',
    color: 'var(--color-success)',
  },
  warning: {
    background: 'rgba(251,191,36,0.12)',
    border: '1px solid rgba(251,191,36,0.3)',
    color: 'var(--color-warning)',
  },
  error: {
    background: 'rgba(248,113,113,0.12)',
    border: '1px solid rgba(248,113,113,0.3)',
    color: 'var(--color-error)',
  },
  info: {
    background: 'rgba(96,165,250,0.12)',
    border: '1px solid rgba(96,165,250,0.3)',
    color: 'var(--color-info)',
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
        borderRadius: 9999,
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
