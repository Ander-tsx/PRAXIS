/**
 * PRAXIS — Spacing Tokens
 * Sistema base 4px. Todos los valores son múltiplos de 4.
 * Usar las clases de Tailwind (p-4, gap-8, etc.) siempre que sea posible.
 * Estos tokens son referencia para cuando se requiere style={{ padding: spacing[4] }}.
 */

export const spacing = {
  0: '0',
  0.5: '0.125rem', // 2px
  1: '0.25rem', // 4px
  1.5: '0.375rem', // 6px
  2: '0.5rem', // 8px
  2.5: '0.625rem', // 10px
  3: '0.75rem', // 12px
  3.5: '0.875rem', // 14px
  4: '1rem', // 16px — padding base de inputs y botones
  5: '1.25rem', // 20px
  6: '1.5rem', // 24px
  7: '1.75rem', // 28px
  8: '2rem', // 32px
  10: '2.5rem', // 40px
  12: '3rem', // 48px — separación entre secciones (mobile)
  14: '3.5rem', // 56px
  16: '4rem', // 64px — separación entre secciones (desktop)
  20: '5rem', // 80px
  24: '6rem', // 96px — hero padding vertical
  28: '7rem', // 112px
  32: '8rem', // 128px — secciones grandes
} as const;

export type SpacingToken = keyof typeof spacing;

/** Border radius tokens */
export const radius = {
  sm: 'var(--radius-sm)', // 4px  — chips, badges small
  md: 'var(--radius-md)', // 8px  — inputs, botones
  lg: 'var(--radius-lg)', // 12px — tarjetas
  xl: 'var(--radius-xl)', // 16px — modales, feature cards
  '2xl': 'var(--radius-2xl)', // 24px — elementos grandes
  full: 'var(--radius-full)', // 9999px — avatares, botones pill
} as const;

/** Radix values (px) para cuando CSS vars no aplican */
export const radiusValues = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
} as const;
