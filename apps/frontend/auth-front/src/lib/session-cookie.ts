import type { AuthTokens } from '@praxis/commons/api';
import {
  ACCESS_TOKEN_FALLBACK_MAX_AGE,
  REFRESH_COOKIE,
  REFRESH_TOKEN_FALLBACK_MAX_AGE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@praxis/commons/auth';
import { decodeJwt } from 'jose';
import type { NextResponse } from 'next/server';

export { SESSION_COOKIE, REFRESH_COOKIE };

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
 * Los atributos (httpOnly, secure, sameSite, path) viven en
 * @praxis/commons/auth para que todas las zonas usen exactamente los mismos.
 */
export function setSessionCookies(response: NextResponse, tokens: AuthTokens): void {
  response.cookies.set(
    SESSION_COOKIE,
    tokens.accessToken,
    sessionCookieOptions(maxAgeFromJwt(tokens.accessToken, ACCESS_TOKEN_FALLBACK_MAX_AGE)),
  );

  response.cookies.set(
    REFRESH_COOKIE,
    tokens.refreshToken,
    sessionCookieOptions(maxAgeFromJwt(tokens.refreshToken, REFRESH_TOKEN_FALLBACK_MAX_AGE)),
  );
}

/** Borra ambas cookies de sesión. */
export function clearSessionCookies(response: NextResponse): void {
  for (const name of [SESSION_COOKIE, REFRESH_COOKIE]) {
    response.cookies.set(name, '', sessionCookieOptions(0));
  }
}
