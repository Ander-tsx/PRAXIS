import { decodeJwt } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const COOKIE_NAME = 'praxis_session';

/**
 * BFF — POST /auth/api/login
 *
 * Flujo:
 * 1. Recibe { email, password } del cliente
 * 2. Llama al gateway POST /auth/login
 * 3. Si 200: decodifica el JWT para leer exp real, setea cookie httpOnly y
 *    responde { success: true } — el token NUNCA llega al cliente en plano
 * 4. Si error: reenvía mensaje genérico sin filtrar internals del backend
 *
 * Seguridad:
 * - Cookie httpOnly: no accesible desde JS del navegador
 * - Secure en producción: fuerza HTTPS
 * - SameSite=lax: protección CSRF básica
 * - maxAge calculado desde exp del JWT → expiran exactamente igual
 */
export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ message: 'Email y contraseña son requeridos.' }, { status: 400 });
  }

  let gatewayRes: Response;
  try {
    gatewayRes = await fetch(`${GATEWAY_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return NextResponse.json(
      { message: 'No se pudo conectar con el servidor de autenticación.' },
      { status: 503 },
    );
  }

  if (!gatewayRes.ok) {
    const status = gatewayRes.status === 401 ? 401 : 400;
    return NextResponse.json({ message: 'Credenciales inválidas.' }, { status });
  }

  let gatewayData: { access_token?: string };
  try {
    gatewayData = await gatewayRes.json();
  } catch {
    return NextResponse.json({ message: 'Respuesta inesperada del servidor.' }, { status: 502 });
  }

  const { access_token } = gatewayData;

  if (!access_token) {
    return NextResponse.json({ message: 'Respuesta inesperada del servidor.' }, { status: 502 });
  }

  // Calcular maxAge a partir del exp real del JWT
  // Esto garantiza que la cookie expira exactamente cuando expira el token
  let maxAge: number;
  try {
    const payload = decodeJwt(access_token);
    const exp = payload.exp;
    if (typeof exp === 'number') {
      maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));
    } else {
      // TODO: alinear con backend cuando se configure expiresIn en JwtModule
      maxAge = 60 * 60 * 24; // fallback conservador: 24h
    }
  } catch {
    maxAge = 60 * 60 * 24; // fallback si el token no se puede decodificar
  }

  const isProduction = process.env.NODE_ENV === 'production';

  const response = NextResponse.json({ success: true });

  response.cookies.set(COOKIE_NAME, access_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/', // visible en todo el dominio, no solo bajo /auth
    maxAge,
  });

  return response;
}
