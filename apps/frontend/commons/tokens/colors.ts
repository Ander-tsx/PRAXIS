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
