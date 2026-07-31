import { cookies } from 'next/headers';
import { DEFAULT_THEME, THEME_COOKIE, type ThemeName } from './cookie';

/**
 * Lee la cookie de tema en el servidor.
 *
 * Solo se puede llamar desde Server Components, layouts o Server Actions.
 * Cualquier valor que no sea exactamente `'light'` cae al oscuro por
 * defecto — así una cookie corrompida o de una versión vieja nunca deja la
 * página sin tema.
 */
export async function getTheme(): Promise<ThemeName> {
  const store = await cookies();
  return store.get(THEME_COOKIE)?.value === 'light' ? 'light' : DEFAULT_THEME;
}
