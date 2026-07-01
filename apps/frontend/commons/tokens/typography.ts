/**
 * PRAXIS — Typography Tokens
 * Tres familias con roles semánticos claros:
 *   display → hero, nombres, highlights grandes (Redaction 50 — self-hosted)
 *   serif   → subtítulos de sección, citas, detalles (Lora — Google Fonts)
 *   sans    → body, labels, nav, botones (Inter — Google Fonts)
 *   mono    → código, permisos, datos técnicos (JetBrains Mono)
 */

export const fontFamily = {
  display: 'var(--font-display)', // 'Redaction 50', Georgia, serif
  serif: 'var(--font-serif)', // var(--font-lora), Georgia, serif
  sans: 'var(--font-sans)', // var(--font-inter), system-ui, sans-serif
  mono: 'var(--font-mono)', // JetBrains Mono, Fira Code, monospace
} as const;

/** Tailwind class names — usar directamente en className */
export const fontClass = {
  display: 'font-display',
  serif: 'font-serif',
  sans: 'font-sans',
  mono: 'font-mono',
} as const;

/**
 * Escala de tamaños — rem values (base 16px)
 * Usar las clases de Tailwind o los tokens en style={{}} cuando aplique.
 */
export const fontSize = {
  xs: '0.75rem', // 12px — captions, eyebrows, timestamps
  sm: '0.875rem', // 14px — texto secundario, labels
  base: '1rem', // 16px — body principal
  lg: '1.125rem', // 18px — subtítulos, intro
  xl: '1.25rem', // 20px — títulos de sección pequeña
  '2xl': '1.5rem', // 24px — stats grandes, display medium
  '3xl': '1.875rem', // 30px — headings
  '4xl': '2.25rem', // 36px — h2 de sección
  '5xl': '3rem', // 48px — hero subtitle
  '6xl': '3.75rem', // 60px — hero headline (md breakpoint)
  '7xl': '4.5rem', // 72px — hero headline (lg breakpoint)
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  black: '900',
} as const;

export const lineHeight = {
  tight: '1.02',
  snug: '1.25',
  normal: '1.5',
  relaxed: '1.65',
} as const;

export const letterSpacing = {
  tight: '-0.02em',
  normal: '0',
  wide: '0.04em',
  wider: '0.08em',
  widest: '0.12em',
} as const;
