import { gatewayPost } from '@/lib/auth/gateway';
import { REFRESH_COOKIE, SESSION_COOKIE, clearSessionCookies } from '@/lib/auth/session-cookie';
import { ApiError, type RefreshedToken } from '@praxis/commons/api';
import { decodeJwt } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * BFF — POST /auth/api/refresh
 *
 * Canjea el refresh token (cookie httpOnly) por un access token nuevo y
 * reescribe la cookie de sesión. Si el refresh ya no es válido, limpia ambas
 * cookies para que el usuario vuelva al login en lugar de quedarse en un
 * limbo con una sesión muerta.
 *
 * El backend solo rota el access token: el refresh token sigue siendo el mismo
 * hasta que caduca a los 7 días, así que no lo tocamos.
 */
export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  let data: RefreshedToken;

  try {
    data = await gatewayPost<RefreshedToken>('/auth/refresh', { refreshToken });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const response = NextResponse.json(
      { authenticated: false },
      { status: status === 503 ? 503 : 401 },
    );

    // Refresh inválido o expirado → la sesión no es recuperable
    if (status !== 503) {
      clearSessionCookies(response);
    }
    return response;
  }

  if (typeof data?.accessToken !== 'string') {
    const response = NextResponse.json({ authenticated: false }, { status: 502 });
    clearSessionCookies(response);
    return response;
  }

  let maxAge = 60 * 60 * 24;
  try {
    const { exp } = decodeJwt(data.accessToken);
    if (typeof exp === 'number') {
      maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));
    }
  } catch {
    // se queda el fallback
  }

  const response = NextResponse.json({ authenticated: true });

  response.cookies.set(SESSION_COOKIE, data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  return response;
}
