import { jwtVerify } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'praxis_session';

/**
 * BFF — GET /auth/api/session
 *
 * Verifica la cookie de sesión usando jose.jwtVerify con el JWT_SECRET
 * compartido entre gateway y auth-front (opción b del plan de implementación).
 *
 * Por qué opción (b) y no (a):
 * - No se modificó el backend (restricción explícita del usuario)
 * - jose.jwtVerify valida firma + exp + nbf → es una verificación completa,
 *   no solo un decode de claims sin validar
 * - JWT_SECRET es la misma variable que usa el gateway (compartida vía env)
 *
 * Respuestas:
 * - { authenticated: true,  userId: string } → cookie válida y no expirada
 * - { authenticated: false }                 → cookie ausente, expirada o firma inválida
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error('[session] JWT_SECRET no está configurado en auth-front');
    return NextResponse.json({ authenticated: false });
  }

  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret);

    // JwtPayloadDto: { sub: string, iat: number, exp: number }
    const userId = typeof payload.sub === 'string' ? payload.sub : undefined;

    return NextResponse.json({ authenticated: true, userId });
  } catch {
    // Token expirado, firma inválida, o malformado → sesión inválida
    return NextResponse.json({ authenticated: false });
  }
}
