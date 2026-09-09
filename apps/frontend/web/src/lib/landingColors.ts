/**
 * Paleta monocromática de la landing — beige/negro, medida sobre el proyecto
 * de Kyloo (ver kyloo-design/SKILL.md §2 y las variables `.landing`/
 * `.landing-light` de `globals.css`), más un único acento de marca.
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
  /**
   * El morado de la aplicación, y el único color de toda la landing.
   *
   * Cambia de tono entre zona oscura y clara igual que el resto de tokens
   * `--l-*`, así que se consume por variable y **nunca** por su valor: escribir
   * `#6c63ff` a pelo lo deja ilegible en cuanto cae sobre el beige. El porqué
   * y los cuatro sitios donde va, en `commons/styles/landing-theme.css`.
   */
  accent: 'var(--l-accent)',
  accentForeground: 'var(--l-accent-foreground)',
  /** Los dos extremos del degradado del titular. Ver `DEGRADADO_DE_MARCA`. */
  accentBright: 'var(--l-accent-bright)',
  accentDeep: 'var(--l-accent-deep)',
} as const;

/** Radio de esquina único de la landing — «muy tenue», casi cuadrado. */
export const lRadius = '0.35rem';
