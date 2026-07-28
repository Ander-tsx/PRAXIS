import { type AuthTokens, JwtClaims } from '@praxis/commons/api';
import { decodeJwt } from 'jose';
import type { NextResponse } from 'next/server';

export const SESSION_COOKIE = 'praxis_session';
export const REFRESH_COOKIE = 'praxis_refresh';

/** Fallback conservador si el token no declara `exp` o no se puede decodificar. */
const FALLBACK_MAX_AGE = 60 * 60 * 24; // 24 h

/** El backend firma refresh tokens con REFRESH_TOKEN_EXPIRES_IN=7d. */
const REFRESH_FALLBACK_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * maxAge derivado del `exp` real del JWT, para que la cookie y el token
 * caduquen exactamente a la vez.
 */
function maxAgeFromJwt(token: string, fallback: number): number {
  try {
    const { exp } = decodeJwt(token);
    if (typeof exp === 'number') {
      return Math.max(0, exp - Math.floor(Date.now() / 1000));
    }
  } catch {
    // token opaco o malformado — usamos el fallback
  }
  return fallback;
}

/**
 * Escribe las cookies de sesión sobre la respuesta.
 *
 * - httpOnly: el token nunca es accesible desde el JS del cliente
 * - secure en producción
 * - sameSite=lax: protección CSRF básica sin romper la navegación entre zonas
 * - path='/': visible en todas las zonas del multi-zone, no solo bajo /auth
 */
export function setSessionCookies(response: NextResponse, tokens: AuthTokens): void {
  const isProduction = process.env.NODE_ENV === 'production';

  const base = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  } as const;

  response.cookies.set(SESSION_COOKIE, tokens.accessToken, {
    ...base,
    maxAge: maxAgeFromJwt(tokens.accessToken, FALLBACK_MAX_AGE),
  });

  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    maxAge: maxAgeFromJwt(tokens.refreshToken, REFRESH_FALLBACK_MAX_AGE),
  });
}

/** Borra ambas cookies de sesión. */
export function clearSessionCookies(response: NextResponse): void {
  const isProduction = process.env.NODE_ENV === 'production';

  for (const name of [SESSION_COOKIE, REFRESH_COOKIE]) {
    response.cookies.set(name, '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }
}
