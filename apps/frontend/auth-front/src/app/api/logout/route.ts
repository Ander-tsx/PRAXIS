import { type NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'praxis_session';

/**
 * BFF — POST /auth/api/logout
 *
 * Borra la cookie de sesión seteando maxAge=0.
 * No necesita comunicarse con el gateway — el token seguirá siendo
 * técnicamente válido hasta su exp, pero el cliente ya no lo tendrá
 * (no hay localStorage ni sessionStorage).
 *
 * Nota de arquitectura: si se requiere invalidación inmediata del lado
 * del servidor (token blacklist), habría que agregar un endpoint en el
 * microservicio auth y llamarlo aquí. Por ahora esto está fuera del scope.
 */
export async function POST(_request: NextRequest) {
  const response = NextResponse.json({ success: true });

  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
