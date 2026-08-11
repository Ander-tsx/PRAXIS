import { decodeJwt } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';
import { timeoutSignal } from '../api/timeout';
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

/**
 * El resultado de intentar renovar, con la distinción que importa.
 *
 * ⚠️ **«El refresh ya no vale» y «no pude preguntar» no son lo mismo**, y
 * tratarlos igual tiene consecuencias: abajo, un fallo de renovación **borra las
 * dos cookies**. Con un único `null` para ambos casos, un gateway que tarda un
 * momento de más —o el plazo que ahora corta esa espera— cerraba la sesión de
 * verdad, y volver a entrar era obligatorio aunque el corte hubiera durado un
 * segundo. Solo `rechazado` significa que la sesión está muerta.
 */
type Renovacion =
  | { estado: 'renovado'; token: string }
  | { estado: 'rechazado' }
  | { estado: 'inalcanzable' };

async function requestNewAccessToken(
  gatewayUrl: string,
  refreshToken: string,
): Promise<Renovacion> {
  try {
    const response = await fetch(`${gatewayUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
      /* Esto corre en el middleware, **antes de cada petición de la zona**: un
         cuelgue aquí no deja colgado un botón, sino la navegación entera.
         El `catch` de abajo lo trata como «no se pudo renovar». */
      signal: timeoutSignal(),
    });

    /* Que el gateway conteste «no» es una respuesta: el refresh no sirve. */
    if (!response.ok) return { estado: 'rechazado' };

    const payload = (await response.json()) as { data?: { accessToken?: unknown } };
    const accessToken = payload?.data?.accessToken;

    return typeof accessToken === 'string'
      ? { estado: 'renovado', token: accessToken }
      : { estado: 'rechazado' };
  } catch {
    /* Aquí no hubo respuesta: red caída, gateway apagado o plazo agotado. No
       sabemos si la sesión vale, así que no se toca. */
    return { estado: 'inalcanzable' };
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

    const renovacion = await requestNewAccessToken(gatewayUrl, refreshToken);

    if (renovacion.estado === 'rechazado') {
      // El refresh también murió: limpiamos para que la UI muestre el estado
      // real en lugar de dejar cookies zombis dando vueltas.
      const response = NextResponse.next();
      response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
      response.cookies.set(REFRESH_COOKIE, '', sessionCookieOptions(0));
      return response;
    }

    /**
     * No se pudo preguntar. Se sigue con lo que había: si el access token aún
     * aguanta, la petición pasa como si nada; si ya no, el guard mandará al
     * login. Lo que **no** se hace es borrar el refresh, que es lo que
     * permitirá renovar en cuanto el gateway vuelva.
     */
    if (renovacion.estado === 'inalcanzable') return NextResponse.next();

    const renewed = renovacion.token;

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
