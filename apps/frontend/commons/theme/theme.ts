import { DEFAULT_THEME, type ThemeName } from './cookie';

/**
 * El tema de la interfaz, en el servidor.
 *
 * ⚠️ **El modo claro está retirado por ahora**, así que esto siempre devuelve
 * `'dark'` — ignora la cookie `praxis_theme`, incluso una `=light` que quedara
 * de antes. La infraestructura (la cookie, `:root[data-theme="light"]` en
 * `theme.css`, el átomo `ThemeToggle`) sigue en su sitio, dormida: volver a
 * habilitar el claro es restaurar la lectura de la cookie aquí.
 *
 * Solo se puede llamar desde Server Components, layouts o Server Actions.
 */
export async function getTheme(): Promise<ThemeName> {
  return DEFAULT_THEME;
}
