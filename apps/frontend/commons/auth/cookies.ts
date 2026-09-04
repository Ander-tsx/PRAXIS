/**
 * Nombres y atributos de las cookies de sesión.
 *
 * Van con `path: '/'` a propósito. Era obligatorio en el multi-zone —el
 * navegador veía un único origen y cada zona tenía que leer la misma cookie— y
 * desde la fusión ya no hace falta, pero se conserva: quitarlo no gana nada y
 * romperlo es fácil.
 */

export const SESSION_COOKIE = 'praxis_session';
export const REFRESH_COOKIE = 'praxis_refresh';

/** El backend firma el access token con JWT_EXPIRES_IN=15m. */
export const ACCESS_TOKEN_FALLBACK_MAX_AGE = 60 * 15;

/** El backend firma el refresh token con REFRESH_TOKEN_EXPIRES_IN=7d. */
export const REFRESH_TOKEN_FALLBACK_MAX_AGE = 60 * 60 * 24 * 7;

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
}

/**
 * Atributos base de las cookies de sesión.
 *
 * - httpOnly: el token nunca es accesible desde el JS del navegador
 * - secure en producción
 * - sameSite=lax: protección CSRF sin romper la navegación entre zonas
 */
export function sessionCookieOptions(maxAge: number): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}
