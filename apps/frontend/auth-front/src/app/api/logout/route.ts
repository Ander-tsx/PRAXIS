import { REFRESH_COOKIE, SESSION_COOKIE, clearSessionCookies } from '@/lib/session-cookie';
import { type NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';

/**
 * BFF — POST /auth/api/logout
 *
 * 1. Avisa al gateway (POST /api/auth/logout) para que credentials-service
 *    borre la sesión de Redis — eso invalida el refresh token del lado servidor
 * 2. Borra las cookies del navegador
 *
 * El paso 1 es best-effort: si el gateway no responde igualmente cerramos la
 * sesión local, porque dejar la cookie puesta es peor que dejar huérfana una
 * entrada en Redis (que caduca sola a los 7 días).
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (token) {
    try {
      await fetch(`${GATEWAY_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        /**
         * El refresh token dice **cuál** de las sesiones se cierra.
         *
         * Una cuenta puede tener varias abiertas a la vez, así que salir en el
         * portátil no debe echar del móvil. Sin este cuerpo, el backend las
         * cerraría todas —que es lo que hacía antes, y lo que sigue haciendo si
         * la cookie no está—.
         */
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
        cache: 'no-store',
      });
    } catch (error) {
      console.warn('[logout] no se pudo notificar al gateway', error);
    }
  }

  const response = NextResponse.json({ success: true });
  clearSessionCookies(response);
  return response;
}
