import { decodeJwt } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_FALLBACK_MAX_AGE,
  REFRESH_COOKIE,
  REFRESH_TOKEN_FALLBACK_MAX_AGE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from './cookies';

/**
 * Renovación de sesión en el borde, para `proxy.ts`.
 *
 * El access token dura 15 minutos y el refresh 7 días. Sin esto, a los 15
 * minutos `getSession()` devuelve null aunque la sesión siga viva: el navbar
 * mostraría "Iniciar sesión" a alguien que sí está identificado.
 *
 * Este proxy detecta el access token caducado, lo renueva contra el gateway y
 * — la parte importante — reescribe la cookie **de la petición** para que el
 * render en curso ya vea la sesión buena, no solo la siguiente navegación.
 */

export interface CreateSessionRefreshProxyOptions {
  /** Por defecto: `process.env.GATEWAY_URL` o http://localhost:3000 */
  gatewayUrl?: string;
  /**
   * Margen en segundos para renovar antes de que caduque de verdad, y evitar
   * carreras con peticiones que salen justo en el límite. Por defecto 60.
   */
  skewSeconds?: number;
}

function secondsUntilExpiry(token: string): number | null {
  try {
    const { exp } = decodeJwt(token);
    return typeof exp === 'number' ? exp - Math.floor(Date.now() / 1000) : null;
  } catch {
    return null;
  }
}

async function requestNewAccessToken(
  gatewayUrl: string,
  refreshToken: string,
): Promise<string | null> {
  try {
    const response = await fetch(`${gatewayUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { data?: { accessToken?: unknown } };
    const accessToken = payload?.data?.accessToken;

    return typeof accessToken === 'string' ? accessToken : null;
  } catch {
    return null;
  }
}

export function createSessionRefreshProxy(options: CreateSessionRefreshProxyOptions = {}) {
  const gatewayUrl = options.gatewayUrl ?? process.env.GATEWAY_URL ?? 'http://localhost:3000';
  const skewSeconds = options.skewSeconds ?? 60;

  return async function sessionRefreshProxy(request: NextRequest): Promise<NextResponse> {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

    // Sin refresh token no hay nada que renovar: visitante anónimo.
    if (!refreshToken) return NextResponse.next();

    const accessToken = request.cookies.get(SESSION_COOKIE)?.value;

    if (accessToken) {
      const remaining = secondsUntilExpiry(accessToken);
      if (remaining !== null && remaining > skewSeconds) {
        return NextResponse.next();
      }
    }

    const renewed = await requestNewAccessToken(gatewayUrl, refreshToken);

    if (!renewed) {
      // El refresh también murió: limpiamos para que la UI muestre el estado
      // real en lugar de dejar cookies zombis dando vueltas.
      const response = NextResponse.next();
      response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
      response.cookies.set(REFRESH_COOKIE, '', sessionCookieOptions(0));
      return response;
    }

    /**
     * Reescribir la cookie de la petición es lo que hace que el render actual
     * vea ya la sesión renovada. Sin esto habría que recargar para notarlo.
     */
    const requestHeaders = new Headers(request.headers);
    const cookies = request.cookies.getAll().filter((cookie) => cookie.name !== SESSION_COOKIE);
    const serialized = [
      ...cookies.map((c) => `${c.name}=${c.value}`),
      `${SESSION_COOKIE}=${renewed}`,
    ].join('; ');
    requestHeaders.set('cookie', serialized);

    const response = NextResponse.next({ request: { headers: requestHeaders } });

    const remaining = secondsUntilExpiry(renewed);
    response.cookies.set(
      SESSION_COOKIE,
      renewed,
      sessionCookieOptions(
        remaining !== null && remaining > 0 ? remaining : ACCESS_TOKEN_FALLBACK_MAX_AGE,
      ),
    );

    // El backend no rota el refresh token, así que solo estiramos su cookie
    // para que no caduque en el navegador antes que en Redis.
    response.cookies.set(
      REFRESH_COOKIE,
      refreshToken,
      sessionCookieOptions(secondsUntilExpiry(refreshToken) ?? REFRESH_TOKEN_FALLBACK_MAX_AGE),
    );

    return response;
  };
}
