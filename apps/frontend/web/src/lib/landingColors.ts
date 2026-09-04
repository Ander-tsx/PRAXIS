/**
 * Paleta monocromática de la landing — beige/negro, medida sobre el proyecto
 * de Kyloo (ver kyloo-design/SKILL.md §2 y las variables `.landing`/
 * `.landing-light` de `globals.css`).
 *
 * No vive en `commons/tokens/colors.ts`: esa paleta es la de la aplicación
 * —indigo, dorado, los seis colores de serie— y sigue respondiendo al
 * claro/oscuro de la cuenta. Esta es fija, solo para la landing pública, y
 * cambia con la zona (`.landing` / `.landing-light`) en vez de con el tema.
 */
export const l = {
  bg: 'var(--l-bg)',
  fg: 'var(--l-fg)',
  fgMuted: 'var(--l-fg-muted)',
  card: 'var(--l-card)',
  border: 'var(--l-border)',
  primary: 'var(--l-primary)',
  primaryForeground: 'var(--l-primary-foreground)',
} as const;

/** Radio de esquina único de la landing — «muy tenue», casi cuadrado. */
export const lRadius = '0.35rem';
