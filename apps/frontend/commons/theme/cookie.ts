/**
 * Nombre y atributos de la cookie de tema, compartidos por todas las zonas.
 *
 * Va con `path: '/'` por el mismo motivo que las de sesión (`../auth/cookies`):
 * el navegador ve un único origen — el del web-shell — y las cinco zonas
 * necesitan leer la misma cookie para estampar `data-theme` sin parpadeo.
 */

export type ThemeName = 'dark' | 'light';

/**
 * Los temas válidos, en runtime.
 *
 * `ThemeName` es un tipo y **desaparece al compilar**: no filtra nada. Hace
 * falta la lista de verdad para que quien escribe la cookie pueda comprobar lo
 * que le llega, y no solo confiar en que quien la lee normalice.
 */
export const THEME_NAMES = ['dark', 'light'] as const;

/** ¿Es un tema que conocemos? */
export function esTemaValido(valor: unknown): valor is ThemeName {
  return typeof valor === 'string' && (THEME_NAMES as readonly string[]).includes(valor);
}

export const THEME_COOKIE = 'praxis_theme';

/** Sin cookie —primera visita, o el usuario nunca lo cambió— la app sigue oscura. */
export const DEFAULT_THEME: ThemeName = 'dark';

/** Un año: es una preferencia de la persona, no una sesión. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface ThemeCookieOptions {
  sameSite: 'lax';
  path: '/';
  maxAge: number;
}

/**
 * A diferencia de las cookies de sesión, no necesita `httpOnly`: no protege
 * nada, y no hay ningún cliente que la lea con JS hoy —cada zona la resuelve
 * en el servidor— pero tampoco haría daño que lo hiciera mañana.
 */
export function themeCookieOptions(): ThemeCookieOptions {
  return {
    sameSite: 'lax',
    path: '/',
    maxAge: THEME_COOKIE_MAX_AGE,
  };
}
