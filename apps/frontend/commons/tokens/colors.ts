/**
 * PRAXIS — Color Tokens
 * Extraídos del design system definido en globals.css @theme.
 * Usar siempre estas referencias en lugar de valores hex directos.
 */

export const colors = {
  // ── FONDOS ────────────────────────────────────────────────
  background: 'var(--color-background)', // #0D0F14 — Fondo base
  surface: 'var(--color-surface)', // #161B27 — Cards, modales
  surfaceElevated: 'var(--color-surface-elevated)', // #1E2535 — Elevado sobre surface
  overlay: 'var(--color-overlay)', // #080A0F — Overlays, drawers
  canvasShadow: 'var(--color-canvas-shadow)', // Sombra del lienzo del tablero — invierte con el tema

  // ── MARCA / PRIMARIO ──────────────────────────────────────
  primary: 'var(--color-primary)', // #6C63FF
  primaryHover: 'var(--color-primary-hover)', // #5A52D5
  primaryMuted: 'var(--color-primary-muted)', // rgba(108,99,255,0.12)
  primaryForeground: 'var(--color-primary-foreground)', // #FFFFFF

  // ── ACENTO ────────────────────────────────────────────────
  accent: 'var(--color-accent)', // #D4A843
  accentHover: 'var(--color-accent-hover)', // #B8902F
  accentMuted: 'var(--color-accent-muted)', // rgba(212,168,67,0.12)
  accentForeground: 'var(--color-accent-foreground)', // #0D0F14

  // ── TEXTO ─────────────────────────────────────────────────
  textPrimary: 'var(--color-text-primary)', // #E8EAF0
  textSecondary: 'var(--color-text-secondary)', // #9AA0B4
  textDisabled: 'var(--color-text-disabled)', // #4A5168
  textInverse: 'var(--color-text-inverse)', // #0D0F14

  // ── BORDES ────────────────────────────────────────────────
  border: 'var(--color-border)', // #2A3045
  borderSubtle: 'var(--color-border-subtle)', // #1E2535
  borderStrong: 'var(--color-border-strong)', // #3D4A6B

  // ── ESTADOS ───────────────────────────────────────────────
  success: 'var(--color-success)', // #4ADE80
  successMuted: 'var(--color-success-muted)',
  warning: 'var(--color-warning)', // #FBBF24
  warningMuted: 'var(--color-warning-muted)',
  error: 'var(--color-error)', // #F87171
  errorMuted: 'var(--color-error-muted)',
  info: 'var(--color-info)', // #60A5FA
  infoMuted: 'var(--color-info-muted)',
} as const;

/**
 * Los seis tonos de serie, **en orden fijo**.
 *
 * Para categorías que no traen color propio —etiquetas, personas— y solo
 * cuando el gráfico no las nombra ya en un eje: en unas barras horizontales el
 * nombre está escrito al lado de cada barra y pintarlas de seis colores es
 * repetir la misma información dos veces. Donde hace falta de verdad es en una
 * dona, que no tiene eje.
 *
 * ⚠️ **No se cicla.** A partir de la sexta, las categorías se agrupan en
 * «Otras»: un séptimo tono generado deja de distinguirse de alguno de estos, y
 * un gráfico donde dos series comparten color miente sobre cuántas hay.
 *
 * Los valores y el porqué de cada uno, en `commons/styles/theme.css`.
 */
export const serieColors = [
  'var(--color-serie-1)',
  'var(--color-serie-2)',
  'var(--color-serie-3)',
  'var(--color-serie-4)',
  'var(--color-serie-5)',
  'var(--color-serie-6)',
] as const;

/** Cuántas categorías caben antes de agrupar en «Otras». */
export const MAX_SERIES = serieColors.length;

export type ColorToken = keyof typeof colors;

/** Valores hex directos (usar solo en contextos que no soportan CSS vars) */
export const colorValues = {
  background: '#0D0F14',
  surface: '#161B27',
  surfaceElevated: '#1E2535',
  primary: '#6C63FF',
  primaryHover: '#5A52D5',
  accent: '#D4A843',
  textPrimary: '#E8EAF0',
  textSecondary: '#9AA0B4',
  textDisabled: '#4A5168',
  border: '#2A3045',
  borderStrong: '#3D4A6B',
} as const;

/**
 * Aplica transparencia a cualquier color CSS.
 *
 * No se puede concatenar el alfa al valor (`${color}15`): eso solo funciona
 * con hex de 6 dígitos y produce CSS inválido —descartado en silencio— cuando
 * el color viene de un token (`var(--color-primary)15`). `color-mix` acepta
 * ambas formas.
 *
 * @param color   Cualquier color CSS válido, incluido `var(--color-*)`
 * @param percent Opacidad resultante, de 0 a 100
 */
export function alpha(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}
