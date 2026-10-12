import { cookies } from 'next/headers';
import {
  DEFAULT_THEME,
  THEME_COOKIE,
  type ThemeName,
  type ThemePreference,
  esPreferenciaValida,
} from './cookie';

/**
 * Lo que la persona eligió (cookie `praxis_theme`): `dark`, `light` o `system`. Sin cookie, o con
 * un valor que no conocemos, **oscuro**: es el tema por defecto y el de siempre.
 *
 * Solo se puede llamar desde Server Components, layouts o Server Actions.
 */
export async function getThemePreference(): Promise<ThemePreference> {
  const valor = (await cookies()).get(THEME_COOKIE)?.value;
  return esPreferenciaValida(valor) ? valor : DEFAULT_THEME;
}

/**
 * El tema con el que se pinta el servidor. Con `system` no se puede saber qué prefiere el
 * navegador, así que se pinta oscuro y un script de la cabecera (ver el layout raíz) lo corrige
 * **antes del primer pintado**, sin parpadeo.
 */
export async function getTheme(): Promise<ThemeName> {
  return (await getThemePreference()) === 'light' ? 'light' : 'dark';
}
